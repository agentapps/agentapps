import type { AgentApp } from '@agentapps/sdk';
import { assertIsRepo, resolveRepoPath, runGit } from '../lib/git-local.js';
import { throwClassifiedGitError } from './_git-error.js';

const ALLOWED_KEYS = new Set([
  'user.name',
  'user.email',
  'user.signingkey',
  'commit.gpgsign',
  'commit.template',
  'core.autocrlf',
  'core.editor',
  'core.pager',
  'core.eol',
  'core.ignorecase',
  'init.defaultbranch',
  'pull.rebase',
  'pull.ff',
  'push.default',
  'rebase.autosquash',
]);

export function registerGitConfigTool(app: AgentApp) {
  app.tool('git-config', {
    annotations: { readOnlyHint: false },
    description:
      'Read or write git config (whitelisted keys only). Default scope is `local` (the repo). For identity, prefer `user.name` and `user.email`.',
    parameters: {
      type: 'object',
      properties: {
        repoPath: { type: 'string' },
        owner: { type: 'string' },
        repo: { type: 'string' },
        action: { type: 'string', enum: ['get', 'set', 'unset', 'list'], default: 'get' },
        key: { type: 'string', description: 'Config key (required for get/set/unset).' },
        value: { type: 'string', description: 'New value (required for set).' },
        scope: { type: 'string', enum: ['local', 'global'], default: 'local' },
      },
    },
    handler: async (args, _ctx) => {
      const a = args as {
        repoPath?: string;
        owner?: string;
        repo?: string;
        action?: 'get' | 'set' | 'unset' | 'list';
        key?: string;
        value?: string;
        scope?: 'local' | 'global';
      };
      const repoPath = resolveRepoPath(a);
      assertIsRepo(repoPath);

      const action = a.action ?? 'get';
      const scopeFlag = a.scope === 'global' ? '--global' : '--local';

      if (action === 'list') {
        const result = runGit(repoPath, ['config', scopeFlag, '--list']);
        if (result.code !== 0) throwClassifiedGitError(result);
        const entries: Record<string, string> = {};
        for (const line of result.stdout.split('\n').filter(Boolean)) {
          const eq = line.indexOf('=');
          if (eq < 0) continue;
          const k = line.slice(0, eq);
          const v = line.slice(eq + 1);
          if (ALLOWED_KEYS.has(k)) entries[k] = v;
        }
        return { repoPath, scope: a.scope ?? 'local', entries };
      }

      if (!a.key) {
        throw new Error('[GIT_INVALID_INPUT] `key` is required for get/set/unset.');
      }
      if (!ALLOWED_KEYS.has(a.key)) {
        throw new Error(
          `[GIT_INVALID_INPUT] Key not whitelisted: ${a.key}. Allowed: ${Array.from(ALLOWED_KEYS).join(', ')}.`,
        );
      }

      if (action === 'get') {
        const result = runGit(repoPath, ['config', scopeFlag, '--get', a.key]);
        if (result.code === 1 && !result.stderr.trim()) {
          return { repoPath, scope: a.scope ?? 'local', key: a.key, value: null };
        }
        if (result.code !== 0) throwClassifiedGitError(result);
        return { repoPath, scope: a.scope ?? 'local', key: a.key, value: result.stdout.trim() };
      }

      if (action === 'set') {
        if (typeof a.value !== 'string') {
          throw new Error('[GIT_INVALID_INPUT] `value` is required for action=set.');
        }
        const result = runGit(repoPath, ['config', scopeFlag, a.key, a.value]);
        if (result.code !== 0) throwClassifiedGitError(result);
        return { repoPath, scope: a.scope ?? 'local', key: a.key, value: a.value };
      }

      // unset
      const result = runGit(repoPath, ['config', scopeFlag, '--unset', a.key]);
      if (result.code !== 0 && result.code !== 5) throwClassifiedGitError(result);
      return { repoPath, scope: a.scope ?? 'local', key: a.key, value: null };
    },
  });
}
