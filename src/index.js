/* eslint-disable camelcase */
const core = require('@actions/core');
const github = require('@actions/github');

const RESOLVED_KEYWORDS = [
  'close',
  'closes',
  'closed',
  'fix',
  'fixes',
  'fixed',
  'resolve',
  'resolves',
  'resolved',
];
const RESOLVED_KEYWORDS_FOR_REGEX = RESOLVED_KEYWORDS.join('|');
const RESOLVED_LINK_REGEX = new RegExp(
  `(?<=(?:${RESOLVED_KEYWORDS_FOR_REGEX})\\s+)(?:(?<![/\\w-.])(?<repo>\\w[\\w-.]+\\/\\w[\\w-.]+|\\B)#(?<issue>[1-9]\\d*))\\b`,
  'gi'
);

/**
 *
 * @param {string} token - GitHub token
 * @param {Partial<MoreGithubActionsOptions>} opts - Options
 */
async function main(
  token,
  {useCommitMessage = 'true', usePRTitle = 'true'} = {}
) {
  try {
    const shouldUseCommitMessage = useCommitMessage.toLowerCase() !== 'false';
    // const shouldUsePRTitle = usePRTitle.toLowerCase() !== 'false';

    const linkedIssues = new Set();
    if (github.context.eventName === 'pull_request') {
      if (shouldUseCommitMessage) {
        const payload = /**
         * @type {import('@octokit/webhooks').EventPayloads.WebhookPayloadPullRequest}
         */ (github.context.payload);
        const {sha: commit_sha} = payload.pull_request.head;
        const octokit = github.getOctokit(token);
        const {message} = (
          await octokit.git.getCommit({
            commit_sha,
            ...github.context.repo,
          })
        ).data;

        [...message.matchAll(RESOLVED_LINK_REGEX)]
          .map((match) => match.groups || {})
          .forEach((match) => {
            linkedIssues.add(match);
          });
      }
    }

    core.setOutput(
      'links',
      `${[...linkedIssues]
        .map(({repo, issue}) => (repo ? `${repo}#${issue}` : `#${issue}`))
        .join(', ')}.`
    );
  } catch (err) {
    core.setFailed(err);
  }
}

if (require.main === module) {
  main(core.getInput('github-token'), {
    useCommitMessage: /** @type {MoreGithubActionsOptions["useCommitMessage"]} */ (core.getInput(
      'use-commit-message'
    )),
    usePRTitle: /** @type {MoreGithubActionsOptions["usePRTitle"]} */ (core.getInput(
      'use-pr-title'
    )),
  });
}

/**
 * @typedef {Object} MoreGithubActionsOptions
 * @property {"true"|"false"} useCommitMessage - If 'false', do not use linking keywords in commit messages
 * @property {"true"|"false"} usePRTitle - If 'false', do not use linking keywords in PR titles
 */
