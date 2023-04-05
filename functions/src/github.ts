import { config, logger } from 'firebase-functions';
import * as crypto from 'crypto';
import { App, Octokit } from 'octokit';
import { extensions } from './static_data';
import {
  GithubRequestParams,
  ReducedUpdatedFile,
  RequestType,
  PullRequestFiles,
} from './types';

const appId = config().github.app_id;
const privateKey = config().github.private_key;
const gh = new App({ appId, privateKey });

export default class Github {
  static createInstance(installationId: number) {
    return gh.getInstallationOctokit(installationId);
  }

  static verifySignature(payloadBody: string, headerSignature: string) {
    const SECRET_TOKEN = config().github.webhook_secret;
    const algo = 'sha256';
    const encrypted = crypto
      .createHmac(algo, SECRET_TOKEN)
      .update(payloadBody)
      .digest('hex');
    const signature = `${algo}=${encrypted}`;

    if (
      !headerSignature ||
      !crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(headerSignature),
      )
    ) {
      return false;
    }

    return true;
  }

  /**
   * Verifies if a Github webhook event should be processed
   * @param signature The signature from the request header
   * @param body The body of the request
   * @returns What type of request this is
   */
  static isEventProcessable(
    signature: string,
    body: Record<string, any>,
  ): RequestType {
    const signatureGood = this.verifySignature(
      JSON.stringify(body),
      signature || '',
    );

    if (!signatureGood) {
      logger.warn('Signature verification failed', { signature, body });
      return 'bad_request';
    }

    const label = body.label?.name?.toLowerCase();
    if (body.action === 'labeled' && label === 'explainthispr') {
      return 'explain_pr_by_label';
    } else if (
      body.action === 'created' &&
      body.comment?.body?.toLowerCase().trim() === '@explainthispr'
    ) {
      return 'explain_pr_by_comment';
    } else if (
      body.action === 'added' &&
      (body.repositories_added?.length || 0) > 0
    ) {
      return 'repo_added';
    } else if (
      body.action === 'removed' &&
      (body.repositories_removed?.length || 0) > 0
    ) {
      return 'repo_removed';
    } else {
      logger.warn('Request type not recognized', { action: body.action });
      return 'bad_request';
    }
  }

  /**
   * Validate if the content is in the correct format of PullRequestFiles
   * @param diff The raw diff JSON to process
   */
  static isDiffProcessable(diff: string) {
    try {
      const parsed = JSON.parse(diff) as PullRequestFiles;
      const first = parsed[0];
      if (!first || !first.filename || !first.status || !first.changes) {
        return false;
      }

      if (parsed.length === 0) {
        return false;
      }
      return parsed;
    } catch (e) {
      return false;
    }
  }

  /**
   * Filter out files that we don't want to summarize
   * @param files The list of files to filter
   * @returns
   */
  static filterOutFiltersToAnalyze(files: PullRequestFiles) {
    let result = files.filter((file) => {
      const filename = file.filename.toLowerCase();
      if (
        filename.includes('test') ||
        filename.includes('spec') ||
        filename.includes('mock') ||
        filename.includes('fixture') ||
        filename.includes('package.json') ||
        filename.includes('package-lock.json')
      ) {
        return false;
      }

      if (filename.includes('icon')) {
        return false;
      }

      if (file.changes < 1) {
        return false;
      }

      const fileParts = filename.split('.');
      const extension = '.' + fileParts[fileParts.length - 1];

      return extensions.includes(extension);
    });

    // Update the content `patch` of the files that were deleted
    result = result.map((file) => {
      if (file.status === 'removed') {
        file.patch = 'File deleted';
      }
      return file;
    });

    logger.info(`Files before filter: ${files.length}`);
    logger.info(`Files after filter: ${result.length}`);
    const filenames = result.map((file) => file.filename);
    logger.info('files to process:', filenames);
    return result;
  }

  /**
   * Break the files into chunks of 9k or less characters to
   * stay within the GPT tokens limit
   * @param files The list of files to break into chunks
   * @returns
   */
  static breakFilesIntoChunks(files: PullRequestFiles) {
    const result: ReducedUpdatedFile[][] = [];
    let index = 0;
    let totalChar = 0;
    const limit = 9000;

    files.forEach((file) => {
      const filename = file.filename;
      const content = file.patch || '';
      if (totalChar + content.length > limit) {
        index++;
        totalChar = 0;
      }

      if (!result[index]) {
        result[index] = [];
      } else {
        result[index].push({ filename, content });
        totalChar += content.length;
      }
    });

    logger.info(`Number of chunks to send: ${result.length}`);
    return result;
  }

  static async leaveComment(
    comment: string,
    octokit: Octokit,
    params: GithubRequestParams,
  ) {
    try {
      logger.info('Adding a comment to the PR..');
      const { repoOwner, repoName, pullNumber } = params;
      await octokit.rest.issues.createComment({
        owner: repoOwner,
        repo: repoName,
        issue_number: pullNumber,
        body: comment,
      });
      logger.info('Comment added to the PR!');
    } catch (e: any) {
      const error = e?.response?.data || e;
      logger.error('Failed to create comment:' + e.message, error);
    }
  }
}
