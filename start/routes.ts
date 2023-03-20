/*
|--------------------------------------------------------------------------
| Routes
|--------------------------------------------------------------------------
|
| This file is dedicated for defining HTTP routes. A single file is enough
| for majority of projects, however you can define routes in different
| files and just make sure to import them inside this file. For example
|
| Define routes in following two files
| ├── start/routes/cart.ts
| ├── start/routes/customer.ts
|
| and then import them inside `start/routes.ts` as follows
|
| import './routes/cart'
| import './routes/customer'
|
*/

import { HttpContext } from '@adonisjs/core/build/standalone';
import Route from '@ioc:Adonis/Core/Route';
import Env from '@ioc:Adonis/Core/Env';
import { PullRequestLabeledEvent } from '@octokit/webhooks-types';
import { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods/dist-types';
import crypto from 'crypto';
import { App } from 'octokit';
import { extensions } from '../datapoints';

type PullRequestFiles = RestEndpointMethodTypes['pulls']['listFiles']['response']['data'];

Route.get('/', async () => {
  return { hello: 'world' };
});

const appId = Env.get('GITHUB_APP_ID');
const privateKey = Env.get('GITHUB_APP_PRIVATE_KEY');

const gh = new App({ appId, privateKey });

Route.post('/webhook', async ({ request }: HttpContext) => {
  console.log({
    action: request.body().action,
  });
  const signature = request.header('x-hub-signature-256');
  verifySignature(JSON.stringify(request.body()), signature || '');

  let installationId = 0;
  let repoName = '';
  let repoOwner = '';
  let pullNumber = 0;

  if (request.body().action === 'labeled') {
    const payload = request.body() as PullRequestLabeledEvent;
    if (payload.label.name.toLowerCase() !== 'explainthispr') {
      /*return {
        message: 'Nothing for me to do.',
      };*/
    }

    installationId = payload.installation?.id || 0;
    repoName = payload.repository.name;
    repoOwner = payload.repository.owner.login;
    pullNumber = payload.pull_request.number;
  } else {
    return {
      message: 'Nothing for me to do.',
    };
  }

  const octokit = await gh.getInstallationOctokit(installationId);
  const data = await octokit.rest.pulls.listFiles({
    owner: repoOwner,
    repo: repoName,
    pull_number: pullNumber,
  });

  const filestoAnalyze = filterOutFiltersToAnalyze(data.data);
  const filenames = filestoAnalyze.map((file) => file.filename);
  console.log(filenames);

  const content = combineIntoSingleString(filestoAnalyze);
  console.log(content);
  console.log(`Content length: ${content.length}`);

  return {
    message: 'Well, done!',
  };
});

function filterOutFiltersToAnalyze(files: PullRequestFiles) {
  // Filter out the files and only keep the ones that are code files in many languages
  // and not test files ignore icon or other visual assets or files with too few changes
  // Skip package.json and lock files
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

  console.log(`Before filter: ${files.length}`);
  console.log(`After filter: ${result.length}`);
  return result;
}

function combineIntoSingleString(files: PullRequestFiles) {
  const result = files.map((file) => ({
    filename: file.filename,
    content: file.patch,
  }));
  return JSON.stringify(result);
}

function verifySignature(payloadBody: string, headerSignature: string) {
  const SECRET_TOKEN = Env.get('APP_KEY');
  const signature =
    'sha256=' + crypto.createHmac('sha256', SECRET_TOKEN).update(payloadBody).digest('hex');
  if (
    !headerSignature ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(headerSignature))
  ) {
    throw new Error("Signatures didn't match!");
  }
}