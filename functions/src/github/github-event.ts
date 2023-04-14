import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import {
  PullRequestLabeledEvent,
  IssueCommentCreatedEvent,
  MarketplacePurchase,
  MarketplacePurchaseEvent,
} from '@octokit/webhooks-types';
import Github from '../github';
import { FieldValue } from 'firebase-admin/firestore';

export default class GithubEvents {
  private planOptions = {
    free: {
      'usage.repos_limit': 1,
      'usage.loc_limit': 25000,
    },
    starter: {
      'usage.repos_limit': 4,
      'usage.loc_limit': 100000,
    },
    pro: {
      'usage.repos_limit': 30,
      'usage.loc_limit': 1000000,
    },
  };

  /**
   * Updates the user document in Firestore with the new plan information
   * @param user The user document
   * @param plan The plan that was purchased
   * @param firstTime True for first time purchase, false for upgrade/changes
   * @returns
   */
  async onPlanPurchased(
    user: Record<string, any>,
    plan: MarketplacePurchase['plan'],
    firstTime: boolean = false,
  ) {
    const userId = user.id;
    try {
      const limits = this.findUsageLimits(plan);
      await admin
        .firestore()
        .doc(userId)
        .update({
          ...limits,
          plan: plan.name.toLowerCase(),
        });
      if (firstTime) {
        // TODO: shoot an email to the user to welcome them in
      } else {
        // TODO: Do something different for upgrades and changes
      }
      return true;
    } catch (e) {
      logger.error('[onPlanPurchased] Error', { userId, plan, error: e });
      return false;
    }
  }

  async onPlanCancelled(userId: string) {
    try {
      await admin
        .firestore()
        .doc(userId)
        .update({
          ...this.planOptions.free,
          plan: 'free',
        });
      // TODO: shoot an email to ask why they cancelled
      return true;
    } catch (e) {
      logger.error('[onPlanCancelled] Error', { userId, error: e });
      return false;
    }
  }

  /**
   * Attempts to remove the repos from the user document in Firestore
   * @param githubId The github id of the user
   * @param repoNames The full name of the repos
   * @returns True if operation was successful, false otherwise
   */
  async onRepoRemoved(githubId: number, repoNames: string[]) {
    try {
      // Find user by githubId
      const user = await this.findUserByGithubId(githubId);
      if (!user) {
        logger.warn('[onRepoRemoved] User not found', { githubId });
        return false;
      }

      repoNames = repoNames.map((repo) => repo.toLowerCase());
      logger.info('[onRepoRemoved] Removing repo from user...', {
        githubId,
        repoNames,
      });
      await admin
        .firestore()
        .doc(user.id)
        .update({
          repos: FieldValue.arrayRemove(...repoNames),
          'usage.repos': FieldValue.increment(-repoNames.length),
        });
      logger.info('[onRepoRemoved] Repos successfully removed from user');
      return true;
    } catch (e) {
      logger.error(
        '[onRepoRemoved] Failed to remove repo from user',
        { githubId },
        e,
      );
      return false;
    }
  }

  /**
   * Attempts to add the repos to the user document in Firestore
   * @param githubId The github id of the user
   * @param repoNames The full name of the repo
   * @returns True if operation was successful, false otherwise
   */
  async onRepoAdded(githubId: number, repoNames: string[]) {
    try {
      const user = await this.findUserByGithubId(githubId);
      if (!user) {
        logger.warn('[onRepoAdded] User not found', { githubId });
        return false;
      }

      const newTotal = user.repos.length + repoNames.length;
      if (newTotal > user.usage.repos_limit + 1) {
        // +1 in case the user is simultaneously removing a repo
        logger.warn('[onRepoAdded] User has reached repo limit', { githubId });
        return false;
      }

      repoNames = repoNames.map((repo) => repo.toLowerCase());
      logger.info('[onRepoAdded] Adding repo to user...', {
        githubId,
        repoNames,
      });
      await admin
        .firestore()
        .doc(user.id)
        .update({
          repos: FieldValue.arrayUnion(...repoNames),
          'usage.repos': FieldValue.increment(repoNames.length),
        });
      logger.info('[onRepoAdded] Repos successfully added to user');
      return true;
    } catch (e) {
      logger.error('[onRepoAdded] Failed to add repo to user', { githubId }, e);
      return false;
    }
  }

  async findOrCreateUser(sender: MarketplacePurchaseEvent['sender']) {
    try {
      const user = await this.findUserByGithubId(sender.id);
      if (user) {
        return user;
      }

      logger.info('[findUserOrCreate] User not found, creating...', {
        githubId: sender.id,
      });
      const newUser = admin.firestore().collection('Users').doc();
      const data = {
        id: 'Users/' + newUser.id,
        uid: newUser.id,
        photoURL: sender.avatar_url,
        name: sender.login,
        githubId: sender.id.toString(),
        plan: 'free',
        repos: [],
        usage: {
          repos: 0,
          repos_limit: 0,
          loc: 0,
          loc_limit: 0,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await newUser.set(data);
      return data;
    } catch (e) {
      logger.error('[findUserOrCreate] Error', { sender, error: e });
      throw e;
    }
  }

  /**
   * Connect to the Github API and get the list of files in the PR
   * @param payload The Github webhook payload
   * @returns The list of files in the PR
   */
  async onJobQueued(
    payload: PullRequestLabeledEvent | IssueCommentCreatedEvent,
  ) {
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

    return files;
  }

  private async findUserByGithubId(githubId: number) {
    const query = await admin
      .firestore()
      .collection('Users')
      .where('githubId', '==', githubId.toString())
      .get();

    if (query.empty) {
      return null;
    }
    const user = query.docs[0].data();
    return user;
  }

  private findUsageLimits(plan: MarketplacePurchase['plan']) {
    const planKey = plan.name.toLowerCase() as keyof typeof this.planOptions;
    return this.planOptions[planKey] || this.planOptions.free;
  }
}
