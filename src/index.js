/* eslint-disable camelcase */
const core = require('@actions/core');
const github = require('@actions/github');
const {name, homepage} = require('../package.json');

const DEFAULT_RESOLVED_KEYWORDS = [
  'close',
  'closes',
  'closed',
  'fix',
  'fixes',
  'fixed',
  'resolve',
  'resolves',
  'resolved',
].join(',');

const TRUE = 'true';
const FALSE = 'false';
const BODY_TOKEN_HEADER = `<!-- BEGIN ${name} -->`;
const BODY_TOKEN_FOOTER = `<!-- END ${name} -->`;

const BODY_TOKEN_REGEX = new RegExp(
  `${BODY_TOKEN_HEADER}[\\s\\S]*?${BODY_TOKEN_FOOTER}`,
  'g'
);

const ALLOWED_EVENTS = new Set(['pull_request']);

const LINK_TOKEN = 'resolves';

const OUTPUT_LINKS = 'links';

/**
 * @param {string} str
 */
const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);

/**
 * @param {number} pullNumber
 * @param {string} url
 */
const toPRString = (pullNumber, url) => `PR #${pullNumber} (${url})`;

/**
 *
 * @param {string} token - GitHub token
 * @param {Partial<MoreGithubActionsOptions>} opts - Options
 */
async function main(
  token,
  {
    useCommitMessage = TRUE,
    usePRTitle = TRUE,
    keywords = DEFAULT_RESOLVED_KEYWORDS,
  } = {}
) {
  try {
    if (ALLOWED_EVENTS.has(github.context.eventName)) {
      const cleanKeywords = keywords
        .split(',')
        .map((str) => str.trim().replace(/\W/g, ''));
      const resolvedLinksRegex = new RegExp(
        `(?<=(?:${cleanKeywords.join(
          '|'
        )})\\s+)(?:(?<![/\\w-.])(?<repo>\\w[\\w-.]+\\/\\w[\\w-.]+|\\B)#(?<issue>[1-9]\\d*))\\b`,
        'gi'
      );

      const shouldUseCommitMessage = useCommitMessage.toLowerCase() !== FALSE;
      const shouldUsePRTitle = usePRTitle.toLowerCase() !== FALSE;
      const linkedIssues = new Set();
      const octokit = github.getOctokit(token);

      const payload = /**
       * @type {import('@octokit/webhooks').EventPayloads.WebhookPayloadPullRequest}
       */ (github.context.payload);

      const pullNumber = payload.pull_request.number;

      // get pull request description
      let {body, title, url} = (
        await octokit.pulls.get({
          ...github.context.repo,
          pull_number: pullNumber,
        })
      ).data;

      const prString = toPRString(pullNumber, url);

      if (shouldUseCommitMessage) {
        // get all commits for this pr
        const commits = await octokit.paginate(octokit.pulls.listCommits, {
          ...github.context.repo,
          pull_number: pullNumber,
        });

        commits.forEach(({commit, sha, url}) => {
          const {message} = commit;
          [...message.matchAll(resolvedLinksRegex)]
            .map(({groups = {}}) => {
              const {repo, issue} = groups;
              return repo ? `${repo}#${issue}` : `#${issue}`;
            })
            .forEach((ref) => {
              linkedIssues.add(ref);
              core.info(
                `found linked issue in ${prString} commit ${sha} (${url}) message: ${ref}`
              );
            });
        });
      }

      if (shouldUsePRTitle) {
        [...title.matchAll(resolvedLinksRegex)]
          .map(({groups = {}}) => {
            const {repo, issue} = groups;
            return repo ? `${repo}#${issue}` : `#${issue}`;
          })
          .filter((ref) => {
            if (linkedIssues.has(ref)) {
              core.info(`linked issue in ${prString} already found: ${ref}`);
              return false;
            }
            return true;
          })
          .forEach((ref) => {
            linkedIssues.add(ref);
            core.info(
              `found linked issue in ${prString} title "${title}": ${ref}`
            );
          });
      }

      // remove any existing token
      body = body.replace(BODY_TOKEN_REGEX, '');

      if (linkedIssues.size) {
        const references = [...linkedIssues];
        core.setOutput(OUTPUT_LINKS, references.join(','));

        const linkedReferences = capitalize(
          references.map((ref) => `${LINK_TOKEN} ${ref}`).join(', ')
        );

        const now = new Date();

        // append new token to end of PR body
        body = `${body}
${BODY_TOKEN_HEADER}
- - -

&blacktriangleright; _${linkedReferences}_

<sub>updated ${now} by <a href="${homepage}">${name}</a></sub>
${BODY_TOKEN_FOOTER}
`;
        core.info(`updating body of ${prString} with linked issues`);
      } else {
        core.info(
          `removing invalid link(s) from ${prString} body (this will not unlink issues if they are linked elsewhere)`
        );
      }

      await octokit.pulls.update({
        ...github.context.repo,
        pull_number: pullNumber,
        body,
      });
    } else {
      core.info(
        `found unsupported event "${github.context.eventName}", skipping...`
      );
      // is this needed?
      core.setOutput(OUTPUT_LINKS, '');
    }
    core.info('more-linked-issues-action complete');
  } catch (err) {
    core.setFailed(err);
    core.error(err);
    core.error(err.stack);
  }
}

core.info('more-linked-issues-action starting');
main(core.getInput('github-token'), {
  useCommitMessage: /** @type {MoreGithubActionsOptions["useCommitMessage"]} */ (core.getInput(
    'use-commit-message'
  )),
  usePRTitle: /** @type {MoreGithubActionsOptions["usePRTitle"]} */ (core.getInput(
    'use-pr-title'
  )),
});

/**
 * @typedef {Object} MoreGithubActionsOptions
 * @property {"true"|"false"} useCommitMessage - If 'false', do not use linking keywords in commit messages
 * @property {"true"|"false"} usePRTitle - If 'false', do not use linking keywords in PR titles
 * @property {string} keywords - Comma-delimited list of keywords to recognize to establish links. Jeyword must precede an issue reference, followed by a space
 */
