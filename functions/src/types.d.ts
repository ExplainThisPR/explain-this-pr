import { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods/dist-types';

export type GithubRequestParams = {
  installationId: number;
  repoName: string;
  repoOwner: string;
  pullNumber: number;
};

export type ReducedUpdatedFile = { filename: string; content: string };

export type PullRequestFiles =
  RestEndpointMethodTypes['pulls']['listFiles']['response']['data'];

export type RequestType =
  | 'explain_pr_by_label'
  | 'explain_pr_by_comment'
  | 'repo_added'
  | 'repo_removed'
  | 'comment_by_bot'
  | 'not_handled'
  | 'bad_request';
