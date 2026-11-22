import type { AgentApp } from '@agentapps/sdk';
import { assertIsRepo, resolveRepoPath, runGit } from '../lib/git-local.js';
import { throwClassifiedGitError } from './_git-error.js';

export function registerGitTagTool(app: AgentApp) {
  app.tool('git-tag', {
    annotations: {
      readOnlyHint: false,
      // `delete` removes a tag and `force` moves an existing one.
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    description:
      'List, create, or delete local git tags. Pass `message` on create for an annotated tag (otherwise lightweight).',
    parameters: {
      type: 'object',
      properties: {
        repoPath: { type: 'string' },
        owner: { type: 'string' },
        repo: { type: 'string' },
        action: { type: 'string', enum: ['list', 'create', 'delete'], default: 'list' },
        name: { type: 'string', description: 'Tag name (required for create/delete).' },
        ref: { type: 'string', description: 'Ref to tag (default `HEAD`). Used by `create`.' },
        message: {
          type: 'string',
          description: 'If set, create an annotated tag with this message.',
        },
        pattern: { type: 'string', description: 'Glob filter for `list`.' },
        force: { type: 'boolean', description: 'Replace existing tag (`-f`).', default: false },
      },
    },
    handler: async (args, _ctx) => {
      const a = args as {
        repoPath?: string;
        owner?: string;
        repo?: string;
        action?: 'list' | 'create' | 'delete';
        name?: string;
        ref?: string;
        message?: string;
        pattern?: string;
        force?: boolean;
      };
      const repoPath = resolveRepoPath(a);
      assertIsRepo(repoPath);

      const action = a.action ?? 'list';

      if (action === 'list') {
        const argv = ['tag', '-l'];
        if (a.pattern) argv.push(a.pattern);
        const result = runGit(repoPath, argv);
        if (result.code !== 0) throwClassifiedGitError(result);
        const tags = result.stdout.split('\n').filter(Boolean);
        return { repoPath, action, tags, total: tags.length };
      }

      if (!a.name) {
        throw new Error('[GIT_INVALID_INPUT] `name` is required for create/delete.');
      }

      if (action === 'create') {
        const flags: string[] = [];
        if (a.force) flags.push('-f');
        if (a.message) flags.push('-a', '-m', a.message);
        const argv = ['tag', ...flags, a.name];
        if (a.ref) argv.push(a.ref);
        const result = runGit(repoPath, argv);
        if (result.code !== 0) throwClassifiedGitError(result);
        return {
          repoPath,
          action,
          name: a.name,
          ref: a.ref ?? 'HEAD',
          annotated: !!a.message,
        };
      }

      // delete
      const result = runGit(repoPath, ['tag', '-d', a.name]);
      if (result.code !== 0) throwClassifiedGitError(result);
      return { repoPath, action: 'delete', name: a.name };
    },
  });
}
