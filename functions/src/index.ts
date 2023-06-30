import { https, logger, config, runWith } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import Github from './github';
import {
  PullRequestLabeledEvent,
  IssueCommentCreatedEvent,
  User as GithubUser,
  Organization as GithubOrg,
  InstallationRepositoriesAddedEvent,
  InstallationRepositoriesRemovedEvent,
  MarketplacePurchaseEvent,
} from '@octokit/webhooks-types';
import { allowCors } from './helper';
import Stripe from 'stripe';
import ChatGPT from './chat-gpt';
import GithubEvents from './github/github-event';
import { GithubRequestParams } from './types';
import Billing from './billing';

admin.initializeApp();

const stripeKey = config().stripe.api_key;
const stripeEndpointSecret = config().stripe.webhook_secret;
const stripe = new Stripe(stripeKey, {
  apiVersion: '2022-11-15',
});

export const stripeWebhook = https.onRequest(async (request, response) => {
  const sig = request.header('stripe-signature') || '';

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      request.rawBody,
      sig,
      stripeEndpointSecret,
    );
  } catch (err) {
    const error = err as Error;
    logger.error(error);
    response.status(400).send(`Webhook Error: ${error.message}`);
    return;
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const subscription = session.subscription as string;
    const customer = session.customer as string;

    try {
      const [subscriptionData, customerData] = await Promise.all([
        stripe.subscriptions.retrieve(subscription),
        stripe.customers.retrieve(customer),
      ]);
      const email = customerData.id;
      const subItem = subscriptionData.items.data[0];
      // Update the User document in Firestore with the new plan information
      // Find the user with the email and update the plan
      const query = await admin
        .firestore()
        .collection('users')
        .where('email', '==', email)
        .limit(1)
        .get();
      const user = query.docs[0];
      if (
        session.payment_status === 'paid' ||
        session.payment_status === 'no_payment_required'
      ) {
        const getLimits = () => {
          const userDoc = user.data();
          const usage = userDoc.usage || {};
          if (userDoc.plan === 'starter') {
            return {
              ...usage,
              repos_limit: 4,
              loc_limit: 100000,
            };
          } else if (userDoc.plan === 'pro') {
            return {
              ...usage,
              repos_limit: 30,
              loc_limit: 800000,
            };
          } else {
            return {
              ...usage,
              repos_limit: 1,
              loc_limit: 25000,
            };
          }
        };
        await user.ref.update({
          updatedAt: new Date().toISOString(),
          usage: getLimits(),
          stripe: {
            subscription: {
              id: subscription,
              active: subscriptionData.status === 'active',
              default_source: subscriptionData.default_source,
              price_id: subItem.price.id,
              price_key: subItem.price.nickname,
              product_id: subItem.price.product,
            },
            customer: {
              id: customer,
            },
          },
        });
      }

      logger.info(
        `Subscription created for ${email} on ${subItem.price.nickname}`,
      );
    } catch (err) {
      const error = err as Error;
      logger.error(error);
      response.status(400).send(`Failed to perform logic: ${error.message}`);
      return;
    }
  }

  response.send({
    received: true,
  });
});

export const ghMarketplaceWebhook = https.onRequest(
  async (request, response) => {
    const isPreflight = allowCors(request, response);
    if (isPreflight) return;

    const body = request.body as MarketplacePurchaseEvent;
    const signature = request.header('x-hub-signature-256') || '';
    const isValid = Github.verifySignature(JSON.stringify(body), signature);

    if (!isValid) {
      response.status(400).send({
        message: 'The request is not authorized.',
      });
    }

    // Find the user with the email (or create)
    const { sender } = body;
    const { plan } = body.marketplace_purchase;
    const handler = new GithubEvents();
    const user = await handler.findOrCreateUser(sender);

    let success = false;
    let message = 'Something went wrong. Marketplace event not handled.';

    if (body.action === 'purchased' || body.action === 'changed') {
      const completed = await handler.onPlanPurchased(user, plan, true);
      const keyword = body.action === 'purchased' ? 'purchase' : 'change';
      if (completed) {
        success = true;
        message = `Plan ${keyword}d successfully.`;
      } else {
        message = `Plan ${keyword} failed.`;
      }
    } else if (body.action === 'cancelled') {
      // remove the plan and billing status for that user
      // shoot an email to the user to ask why they cancelled
      const completed = await handler.onPlanCancelled(user.id);
      if (completed) {
        success = true;
        message = 'Plan cancelled successfully.';
      } else {
        message = 'Plan cancellation failed.';
      }
    }

    if (!success) {
      response.status(400).send({
        message,
      });
    }

    response.send({
      received: true,
      message,
    });
  },
);

export const processRawDiffBody = runWith({
  enforceAppCheck: true,
}).https.onCall(async (body, context) => {
  logger.info('processRawDiffBody', body);
  if (context.app === undefined) {
    throw new https.HttpsError(
      'failed-precondition',
      'The function must be called from an App Check verified app.',
    );
  }

  const content = Github.isDiffProcessable(body.diff_body);
  if (!content) {
    throw new https.HttpsError(
      'invalid-argument',
      'The diff provided is not valid. Did you run the command properly?',
    );
  }

  const filestoSend = Github.filterOutFiltersToAnalyze(content);
  const chunks = Github.breakFilesIntoChunks(filestoSend);

  const totalChanges = filestoSend.reduce((acc, file) => acc + file.changes, 0);
  updatePublicStats(totalChanges);

  const comment = await ChatGPT.explainThisPR(chunks);
  return { comment };
});

export const githubWebhook = https.onRequest(async (request, response) => {
  const isPreflight = allowCors(request, response);
  if (isPreflight) return;

  const body = request.body;
  const signature = request.header('x-hub-signature-256') || '';
  const eventType = Github.isEventProcessable(signature, body);

  if (eventType === 'bad_request') {
    response.status(400).send({
      message: 'The request is not valid. Did you run the command properly?',
    });
    return;
  } else if (eventType === 'not_handled' || eventType === 'comment_by_bot') {
    response.status(200).send({
      message: `Nothing to do about "${eventType}" so exit without error`,
    });
    return;
  }

  const action = body.action;
  const sender = body.sender as GithubUser;
  const org = body.organization as GithubOrg | null;
  console.log({ action, sender, org });

  const handler = new GithubEvents();
  if (eventType === 'repo_added') {
    const payload = body as InstallationRepositoriesAddedEvent;
    const repoNames = payload.repositories_added.map((repo) => repo.full_name);
    const success = await handler.onRepoAdded(sender.id, repoNames);

    if (success) {
      response.status(200).send({
        message: `${repoNames.length} repos added`,
      });
    } else {
      response.status(400).send({
        message: 'Failed to add repos to this account',
      });
    }
    return;
  } else if (eventType === 'repo_removed') {
    const payload = body as InstallationRepositoriesRemovedEvent;
    const repoNames = payload.repositories_removed.map(
      (repo) => repo.full_name,
    );
    const success = await handler.onRepoRemoved(sender.id, repoNames);

    if (success) {
      response.status(200).send({
        message: `${repoNames.length} repos removed`,
      });
    } else {
      response.status(400).send({
        message: 'Failed to remove repos from user account',
      });
    }
    return;
  }

  const payload = body as PullRequestLabeledEvent | IssueCommentCreatedEvent;
  const params: GithubRequestParams = {
    installationId: payload.installation?.id || 0,
    repoName: payload.repository.name,
    repoOwner: payload.repository.owner.login,
    pullNumber:
      payload.action === 'labeled'
        ? payload.pull_request.number
        : payload.issue.number,
  };
  const { installationId, repoName, repoOwner, pullNumber } = params;

  // Fetch the files changed in the PR
  const octokit = await Github.createInstance(installationId);
  const { data: files } = await octokit.rest.pulls.listFiles({
    owner: repoOwner,
    repo: repoName,
    pull_number: pullNumber,
  });

  // Format them into a format that ChatGPT can work with
  const filestoSend = Github.filterOutFiltersToAnalyze(files);
  const chunks = Github.breakFilesIntoChunks(filestoSend);

  const totalChanges = filestoSend.reduce((acc, file) => acc + file.changes, 0);
  updatePublicStats(totalChanges);

  const billing = new Billing(octokit, params);
  const billingIsGood = await billing.checkStatus(totalChanges);

  if (!billingIsGood) {
    response.status(400).send({
      message: 'You have reached your plan limits for this month',
    });
    return;
  }

  const comment = await ChatGPT.explainThisPR(chunks);
  await Promise.all([
    Github.leaveComment(comment, octokit, params),
    billing.updateUsage(totalChanges),
  ]);
  response.send({ comment });
});

async function updatePublicStats(loc_analyzed: number) {
  try {
    await admin
      .firestore()
      .doc('/AdminDashboard/public')
      .update({
        runs: FieldValue.increment(1),
        loc_analyzed: FieldValue.increment(loc_analyzed),
        last_run_at: new Date().toISOString(),
      });
    logger.info('Successfully updated public stats');
  } catch (err) {
    logger.error('Failed to update public stats', err);
  }
}
