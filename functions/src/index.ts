import { https, logger, config, Response, Request } from 'firebase-functions';
import * as admin from 'firebase-admin';
import Github, { PullRequestFiles } from './github';
import {
  PullRequestLabeledEvent,
  IssueCommentCreatedEvent,
  User as GithubUser,
  Organization as GithubOrg,
  InstallationRepositoriesAddedEvent,
  InstallationRepositoriesRemovedEvent,
} from '@octokit/webhooks-types';
import { Configuration, OpenAIApi } from 'openai';
import { Octokit } from 'octokit';
import { allowCors } from './helper';
import Stripe from 'stripe';
import ChatGPT from './chat-gpt';
import GithubEvents from './github/github-event';

admin.initializeApp();

const apiKey = config().openai.api_key;
const configuration = new Configuration({
  apiKey,
});
const OpenAI = new OpenAIApi(configuration);
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

  response.send();
});

export const processRawDiffBody = https.onRequest(async (request, response) => {
  const isPreflight = allowCors(request, response);
  if (isPreflight) return;

  const body = request.body;
  const content = Github.isDiffProcessable(body.diff_body);
  if (!content) {
    response.status(400).send({
      message:
        'The diff provided is not valid. Did you run the command properly?',
    });
    return;
  }

  const filestoSend = Github.filterOutFiltersToAnalyze(content);
  const chunks = Github.breakFilesIntoChunks(filestoSend);

  const totalChanges = filestoSend.reduce((acc, file) => acc + file.changes, 0);
  updatePublicStats(totalChanges);

  const comment = await ChatGPT.explainThisPR(chunks);
  response.send({
    comment,
  });
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
  }

  const sender = body.sender as GithubUser;
  const org = body.organization as GithubOrg | null;
  console.log({ sender, org, action: body.action });

  const handler = new GithubEvents();
  if (eventType === 'repo_added') {
    const payload = body as InstallationRepositoriesAddedEvent;
    const repoNames = payload.repositories_added.map(
      (repo: any) => repo.full_name,
    );
    await handler.onRepoAdded(sender.id, repoNames);
  } else if (eventType === 'repo_removed') {
    const payload = body as InstallationRepositoriesRemovedEvent;
    const repoNames = payload.repositories_removed.map(
      (repo: any) => repo.full_name,
    );
    await handler.onRepoRemoved(sender.id, repoNames);
  }

  /*
   From this line below we are explaining a PR. Whether by comment or label or whatever.
   --
   1. Find the diff and check the length
   2. Check here if the sender or the org is in good billing standing to run code analysis
   3. If bad, return
   4. send to GPT
   5. post comment
   6. update usage
   -- 
  */

  // @TODO Check if this repo is in list allowed for the user account before proceeding

  const payload = body as PullRequestLabeledEvent | IssueCommentCreatedEvent;
  const installationId = payload.installation?.id || 0;
  const repoName = payload.repository.name;
  const repoOwner = payload.repository.owner.login;
  const pullNumber =
    payload.action === 'labeled'
      ? payload.pull_request.number
      : payload.issue.number;

  const octokit = await Github.createInstance(installationId);
  const { data: files } = await octokit.rest.pulls.listFiles({
    owner: repoOwner,
    repo: repoName,
    pull_number: pullNumber,
  });

  const filestoSend = Github.filterOutFiltersToAnalyze(files);
  const chunks = Github.breakFilesIntoChunks(filestoSend);

  const totalChanges = filestoSend.reduce((acc, file) => acc + file.changes, 0);
  updatePublicStats(totalChanges);

  // @TODO Check billing here limits for lines of code or if subscription is active

  const comment = await ChatGPT.explainThisPR(chunks);
  await Github.leaveComment({
    repoName,
    repoOwner,
    pullNumber,
    comment,
  });
  response.send({
    comment,
  });
});

async function validateRepoCountLimit(
  repoName: string,
  repoOwner: string,
  pullNumber: number,
  octokit: Octokit,
) {
  /*
  Find the user who owns the repo
  Count the length of subs[] they have vs. the limit
  If over, throw an error to end the request
*/
  try {
    const query = await admin
      .firestore()
      .collection('Users')
      .where(
        'repos',
        'array-contains',
        `${repoOwner}/${repoName}`.toLowerCase(),
      )
      .get();
    if (query.empty) {
      return false;
    }
    const user = query.docs[0].data();
    const { repos_limit } = user.usage;

    if (user.repos.length > repos_limit) {
      await octokit.rest.issues.createComment({
        owner: repoOwner,
        repo: repoName,
        issue_number: pullNumber,
        body: [
          `You have reached the limit of ${repos_limit} repos.`,
          `Please remove a repo from your account to resume the service.`,
        ].join('\n'),
      });
      return false;
    }
    return true;
  } catch (e) {
    logger.error('Failed to validate subscription level', e);
    return false;
  }
}

/*
When a user is created, save their limits on their account
When a new repo is connected/removed to the app, find the user it belongs to and update their limits
*/

async function updatePublicStats(loc_analyzed: number) {
  try {
    await admin
      .firestore()
      .doc('/AdminDashboard/public')
      .update({
        runs: admin.firestore.FieldValue.increment(1),
        loc_analyzed: admin.firestore.FieldValue.increment(loc_analyzed),
        last_run_at: new Date().toISOString(),
      });
    logger.info('Successfully updated public stats');
  } catch (err) {
    logger.error('Failed to update public stats', err);
  }
}

/*
async function validateCodeLimit(
  LOC: number,
  repoName: string,
  repoOwner: string,
  pullNumber: number,
  octokit: Octokit | null,
) {
  /*
  Find the user who owns the repo
  Count the length of subs[] they have vs. the limit
  If over, throw an error to end the request
*
try {
  const query = await admin
    .firestore()
    .collection('Users')
    .where(
      'repos',
      'array-contains',
      `${repoOwner}/${repoName}`.toLowerCase(),
    )
    .get();
  if (query.empty) {
    return false;
  }
  const user = query.docs[0].data();
  const { loc_limit } = user.usage;

  if (LOC >= loc_limit) {
    await octokit?.rest.issues.createComment({
      owner: repoOwner,
      repo: repoName,
      issue_number: pullNumber,
      body: [
        `You have reached the limit of ${loc_limit} lines of code for this month.`,
        `Wait until the next month to resume the service or upgrade your subscription.`,
      ].join('\n'),
    });
    return false;
  }
  return true;
} catch (e) {
  logger.error('Failed to validate subscription level', e);
  return false;
}
}
*/
