import { https, logger, config, Response, Request } from 'firebase-functions';
import Github, { PullRequestFiles } from './github';
import { PullRequestLabeledEvent } from '@octokit/webhooks-types';
import { Configuration, OpenAIApi } from 'openai';
import { Octokit } from 'octokit';
import { allowCors } from './helper';

const apiKey = config().openai.api_key;
const configuration = new Configuration({
  apiKey,
});
const OpenAI = new OpenAIApi(configuration);

export const githubWebhook = https.onRequest(async (request, response) => {
  const isPreflight = allowCors(request, response);
  if (isPreflight) return;

  const body = request.body;
  logger.log({ action: body.action });

  let repoName = '';
  let repoOwner = '';
  let pullNumber = 0;
  let octokit: Octokit | null = null;
  let content: PullRequestFiles = [];

  if (body.action) {
    const fetched = await fetchDiff(request, response);
    if (!fetched) {
      return;
    }
    content = fetched.data;
    repoName = fetched.repoName;
    repoOwner = fetched.repoOwner;
    octokit = fetched.octokit;
  } else if (body.diff_body) {
    const validated = await validateDiffFormat(body.diff_body);
    if (!validated) {
      response.status(400).send({
        message:
          'The diff provided is not valid. Did you run the command properly?',
      });
      return;
    }
    content = JSON.parse(body.diff_body);
  } else {
    response.status(400).send({
      message: 'No sources provided to analyze Github files.',
    });
    return;
  }

  const filestoAnalyze = Github.filterOutFiltersToAnalyze(content);
  const filenames = filestoAnalyze.map((file) => file.filename);
  const chunks = Github.breakFilesIntoChunks(filestoAnalyze);
  logger.info(`Number of chunks to send: ${chunks.length}`);
  logger.info(filenames);

  let responses = await Promise.all(
    chunks.map(async (chunk) => {
      const combined = JSON.stringify(chunk);
      if (combined.length < 100) {
        return '';
      }

      const gpt = await getSummaryForPR(combined);
      const message = gpt?.choices[0].message?.content;
      return message || '';
    }),
  );

  const prefix = [
    '## :robot: Explain this PR :robot:',
    'Here is a summary of what I noticed. I am a bot in Beta, so I might be wrong. :smiling_face_with_tear:',
    'Please [share your feedback](url) with me. :heart:',
  ];
  const comment = [...prefix, ...responses].join('\n');
  if (responses.length === 0) {
    console.error('No responses from GPT');
    responses = [
      'No changes to analyze. Something likely went wrong. :thinking_face: We will look into it!',
      'Sometimes re-running the analysis helps with timeout issues. :shrug:',
    ];
  }

  logger.info('Adding a comment to the PR..');
  try {
    if (octokit) {
      await octokit.rest.issues.createComment({
        owner: repoOwner,
        repo: repoName,
        issue_number: pullNumber,
        body: comment,
      });
      logger.debug('Comment added to the PR:', { comment });
    }
  } catch (e: any) {
    const error = e?.response?.data || e;
    logger.error('Failed to create comment', error);
  }

  if (body.diff_body) {
    response.send({
      comment,
    });
  } else {
    response.send({
      message: 'Well, done!',
    });
  }
});

async function fetchDiff(request: Request, response: Response) {
  const body = request.body;
  const signature = request.header('x-hub-signature-256');
  const signatureGood = Github.verifySignature(
    JSON.stringify(body),
    signature || '',
  );

  if (!signatureGood) {
    response.status(403).send({
      message: 'Forbidden. Signature verification failed.',
    });
    return;
  }

  let installationId = 0;
  let repoName = '';
  let repoOwner = '';
  let pullNumber = 0;

  if (body.action === 'labeled') {
    const payload = body as PullRequestLabeledEvent;
    const label = payload.label.name.toLowerCase();
    if (label !== 'explainthispr') {
      response.send({
        message: 'Nothing for me to do.',
      });
      return;
    }

    installationId = payload.installation?.id || 0;
    repoName = payload.repository.name;
    repoOwner = payload.repository.owner.login;
    pullNumber = payload.pull_request.number;
  } else {
    response.send({
      message: 'Nothing for me to do.',
    });
    return;
  }

  const octokit = await Github.createInstance(installationId);
  const data = await octokit.rest.pulls.listFiles({
    owner: repoOwner,
    repo: repoName,
    pull_number: pullNumber,
  });
  return {
    data: data.data,
    octokit,
    repoName,
    repoOwner,
  };
}

/**
 * Validate if the content is in the correct format of PullRequestFiles
 * @param content The content to validate
 * @returns
 */
async function validateDiffFormat(content: string) {
  try {
    const parsed = JSON.parse(content) as PullRequestFiles;
    const first = parsed[0];
    if (!first || !first.filename || !first.status || !first.changes) {
      return false;
    }

    if (parsed.length === 0) {
      return false;
    }
    return true;
  } catch (e) {
    return false;
  }
}

async function getSummaryForPR(content: string) {
  try {
    const prompt = `
    You are an assistant designed to help developer teams review the PRs. Every time a PR is opened, I will send you a code file with the before and the after.
    I want you to compare the two and give me an overview of the things that were changed in the code in a bullet list format.
    I want your comments to be focused on architectural changes that affect the app.
    The format of your response should be in Markdown. Here is an example of a response.
    Limit how many import statements you have per file to 3 max.
    Please do not repeat yourself. If you already mention a technology like \`useFonts\` do not mention it again for that file.
    Please use the full filename. For example, \`src/components/Button.tsx\` is better than \`Button.tsx\`.
    Please be concise and do not talk repeatedly about the same change. If you have already mentioned how PDF data generation works for example, do not discuss again it.
    Only focus on the most impactful functional changes. The maximum is 4 bullet points. For each additional bullet point, divide the total \`patch\` length by 1500 to determine how many more bullet points you can add for this file.
    Here is an example of a response:
    ## src/App.tsx
      - Moved the routing logic to a standalone \`Router\` component
      - Setup a listener for the AuthState of the user and update the Redux store with the current user

    `;
    logger.debug('GPT Request: ', { content });
    const { data } = await OpenAI.createChatCompletion({
      model: 'gpt-3.5-turbo',
      max_tokens: 400,
      temperature: 0.3,
      frequency_penalty: 0.2,
      presence_penalty: 0.3,
      top_p: 1,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content },
      ],
    });
    logger.debug('GPT Response: ', {
      usage: data.usage,
      content: data.choices[0],
    });
    return data;
  } catch (err: any) {
    const error = err?.response?.data || err;
    logger.error('Failed to make GPT request', error);
    return null;
  }
}
