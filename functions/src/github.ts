import { config, logger } from 'firebase-functions';
import * as crypto from 'crypto';
import { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods/dist-types';
import { App } from 'octokit';
import { extensions } from './static_data';

const appId = config().github.app_id;
const privateKey = config().github.private_key;
const gh = new App({ appId, privateKey });

type PullRequestFiles =
  RestEndpointMethodTypes['pulls']['listFiles']['response']['data'];

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
    return result;
  }

  /**
   * Break the files into chunks of 9k or less characters to
   * stay within the GPT tokens limit
   * @param files The list of files to break into chunks
   * @returns
   */
  static breakFilesIntoChunks(files: PullRequestFiles) {
    const result: { filename: string; content: string }[][] = [];
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

    return result;
  }
}
