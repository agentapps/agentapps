import type { AgentApp } from '@agentapps/sdk';
import { assertIsRepo, resolveRepoPath, runGit } from '../lib/git-local.js';
import { throwClassifiedGitError } from './_git-error.js';

export function registerGitCherryPickTool(app: AgentApp) {
  app.tool('git-cherry-pick', {
    annotations: {
      readOnlyHint: false,
      // Adds commits; git refuses to run over uncommitted changes.
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    description:
      'Cherry-pick commits onto the current branch. Pass `commits: ["sha", ...]` or drive an in-progress pick with `mode: continue/skip/abort`.',
    parameters: {
      type: 'object',
      properties: {
        repoPath: { type: 'string' },
        owner: { type: 'string' },
        repo: { type: 'string' },
        commits: {
          type: 'array',
          items: { type: 'string' },
          description: 'SHAs / refs to cherry-pick (in order).',
        },
        mode: { type: 'string', enum: ['start', 'continue', 'skip', 'abort'], default: 'start' },
        noCommit: {
          type: 'boolean',
          description: 'Stage changes but do not create the commit.',
          default: false,
        },
        mainline: {
          type: 'number',
          description: 'For merge commits: parent number (1-indexed) to use as mainline.',
        },
      },
    },
    handler: async (args, _ctx) => {
      const a = args as {
        repoPath?: string;
        owner?: string;
        repo?: string;
        commits?: string[];
        mode?: 'start' | 'continue' | 'skip' | 'abort';
        noCommit?: boolean;
        mainline?: number;
      };
      const repoPath = resolveRepoPath(a);
      assertIsRepo(repoPath);

      const mode = a.mode ?? 'start';

      let argv: string[];
      if (mode === 'continue' || mode === 'skip' || mode === 'abort') {
        argv = ['cherry-pick', `--${mode}`];
      } else {
        if (!a.commits || a.commits.length === 0) {
          throw new Error('[GIT_INVALID_INPUT] `commits` array is required for `mode: start`.');
        }
        const flags: string[] = [];
        if (a.noCommit) flags.push('-n');
        if (typeof a.mainline === 'number') flags.push('-m', String(a.mainline));
        argv = ['cherry-pick', ...flags, ...a.commits];
      }

      const result = runGit(repoPath, argv);
      if (result.code !== 0) throwClassifiedGitError(result);

      const headResult = runGit(repoPath, ['rev-parse', 'HEAD']);
      const branchResult = runGit(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']);

      return {
        repoPath,
        mode,
        commits: a.commits,
        branch: branchResult.stdout.trim(),
        head: headResult.stdout.trim(),
        details: result.stdout.trim() || result.stderr.trim(),
      };
    },
  });
}
