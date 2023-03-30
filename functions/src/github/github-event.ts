import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import {
  PullRequestLabeledEvent,
  IssueCommentCreatedEvent,
} from '@octokit/webhooks-types';
import Github from '../github';
import { FieldValue } from 'firebase-admin/firestore';

export default class GithubEvents {
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
}
