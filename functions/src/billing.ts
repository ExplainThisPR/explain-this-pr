import * as admin from 'firebase-admin';
import { Octokit } from 'octokit';
import { logger } from 'firebase-functions';
import { GithubRequestParams } from './types';

export default class Billing {
  protected octokit: Octokit;
  protected params: GithubRequestParams;
  private user: Record<string, any> | null = {};

  constructor(octokit: Octokit, params: GithubRequestParams) {
    this.octokit = octokit;
    this.params = params;
  }

  protected async init() {
    const { repoName, repoOwner } = this.params;
    const fullName = `${repoOwner}/${repoName}`.toLowerCase();
    this.user = await this.findUserByRepo(fullName);

    if (!this.user) {
      logger.warn('User not found based on repo', { fullName });
    }
  }

  /**
   * Checks if the user is within their billing limits
   * @param linesChanged The number of lines of code in the pull request
   * @returns
   */
  async checkStatus(linesChanged: number) {
    await this.init();
    if (!this.user) {
      return false;
    }

    const codeLimit = this.isWithinCodeLimit(linesChanged);
    const repoLimit = this.isWithinRepoLimit();
    if (!codeLimit || !repoLimit) {
      const issue = !codeLimit ? 'loc' : 'repos';
      await this.notifyAboutIssue(issue);
      return false;
    }

    return true;
  }

  /**
   * Checks if the user is within their repo limit
   * @returns
   */
  protected isWithinRepoLimit() {
    if (!this.user) {
      return false;
    }

    return this.user.repos.length < this.user.usage.repos_limit;
  }

  /**
   * Checks if the user is within their lines of code limit
   * @param linesCount The number of lines of code in the pull request
   * @returns
   */
  protected isWithinCodeLimit(linesCount: number) {
    if (!this.user) {
      return false;
    }

    return linesCount <= this.user.usage.loc_limit;
  }

  private async notifyAboutIssue(issue: 'loc' | 'repos') {
    try {
      if (!this.user) {
        return;
      }

      const { repoName, repoOwner, pullNumber } = this.params;
      const { loc_limit, repos_limit } = this.user.usage;
      const body =
        issue === 'loc'
          ? [
              `You have reached the limit of ${loc_limit} lines of code for this month.`,
              `Wait until the next month to resume the service or upgrade your subscription.`,
            ].join('\n')
          : [
              `You have reached the limit of ${repos_limit} repos.`,
              `Please remove a repo from your account to resume the service.`,
            ].join('\n');
      await this.octokit.rest.issues.createComment({
        owner: repoOwner,
        repo: repoName,
        issue_number: pullNumber,
        body,
      });
    } catch (e) {
      logger.error('Failed to post comment about billing problem', e);
    }
  }

  private async findUserByRepo(repo: string) {
    const query = await admin
      .firestore()
      .collection('Users')
      .where('repos', 'array-contains', repo)
      .get();
    if (query.empty) {
      return null;
    }
    const user = query.docs[0].data();
    return user;
  }
}
