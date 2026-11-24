/**
 * Manifest and tool-surface checks for the GitHub Agent App.
 *
 * Keep the three lists below in sync with the tools in src/tools/.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { safeParseAppManifest } from '@agentapps/protocol';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { listTools } from './harness.js';

/** Every tool, sorted. */
const EXPECTED_TOOLS = [
  'add-issue-comment',
  'add-labels-to-issue',
  'cancel-workflow-run',
  'clone-repo',
  'compare-commits',
  'create-branch',
  'create-check-run',
  'create-issue',
  'create-or-update-file',
  'create-pr-review',
  'create-pull',
  'create-release',
  'create-repo',
  'dispatch-event',
  'get-branch',
  'get-commit',
  'get-file-content',
  'get-installation-context',
  'get-issue',
  'get-pull',
  'get-rate-limit',
  'get-repo',
  'get-user',
  'get-workflow-run',
  'git-add',
  'git-batch-commit',
  'git-bisect',
  'git-blame',
  'git-checkout',
  'git-cherry-pick',
  'git-commit',
  'git-config',
  'git-diff',
  'git-fetch',
  'git-list-files',
  'git-log',
  'git-merge',
  'git-mv',
  'git-pull',
  'git-push',
  'git-read-file',
  'git-rebase',
  'git-remote',
  'git-reset',
  'git-rm',
  'git-stash',
  'git-status',
  'git-tag',
  'git-write-file',
  'list-branches',
  'list-commits',
  'list-issues',
  'list-pr-commits',
  'list-pr-files',
  'list-pr-review-comments',
  'list-pulls',
  'list-releases',
  'list-repos',
  'list-workflow-run-jobs',
  'list-workflow-runs',
  'list-workflows',
  'merge-pull',
  'request-reviewers',
  'rerun-workflow-run',
  'search-code',
  'search-issues',
  'search-repos',
  'trigger-workflow',
  'update-check-run',
  'update-issue',
];
/** Tools that pause for approval by default: exactly the ones that are not read-only. */
const SENSITIVE_TOOLS = [
  'add-issue-comment',
  'add-labels-to-issue',
  'cancel-workflow-run',
  'clone-repo',
  'create-branch',
  'create-check-run',
  'create-issue',
  'create-or-update-file',
  'create-pr-review',
  'create-pull',
  'create-release',
  'create-repo',
  'dispatch-event',
  'git-add',
  'git-batch-commit',
  'git-bisect',
  'git-checkout',
  'git-cherry-pick',
  'git-commit',
  'git-config',
  'git-fetch',
  'git-merge',
  'git-mv',
  'git-pull',
  'git-push',
  'git-rebase',
  'git-remote',
  'git-reset',
  'git-rm',
  'git-stash',
  'git-tag',
  'git-write-file',
  'merge-pull',
  'request-reviewers',
  'rerun-workflow-run',
  'trigger-workflow',
  'update-check-run',
  'update-issue',
];
/** Tools whose effect the app cannot undo. */
const DESTRUCTIVE_TOOLS = [
  'dispatch-event',
  'git-batch-commit',
  'git-checkout',
  'git-mv',
  'git-push',
  'git-rebase',
  'git-remote',
  'git-reset',
  'git-stash',
  'git-tag',
  'git-write-file',
  'merge-pull',
  'rerun-workflow-run',
  'trigger-workflow',
];

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(APP_DIR, 'agentapp.json'), 'utf-8'));

describe('GitHub: manifest', () => {
  it('passes the protocol schema', () => {
    const result = safeParseAppManifest(manifest);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
    expect(manifest.id).toBe('app.github');
  });

  it('matches the createApp() config in src/app.ts', () => {
    const checkedIn = safeParseAppManifest(manifest);
    const generated = safeParseAppManifest(app.toManifest());
    expect(checkedIn.success && generated.success).toBe(true);
    if (!checkedIn.success || !generated.success) return;
    expect(generated.data).toEqual(checkedIn.data);
  });

  it('declares the GitHub App secrets', () => {
    expect(manifest.auth.type).toBe('github-app');
    expect(manifest.auth.systemSecrets).toEqual([
      'GITHUB_APP_ID',
      'GITHUB_APP_CLIENT_ID',
      'GITHUB_APP_CLIENT_SECRET',
      'GITHUB_APP_PRIVATE_KEY',
      'GITHUB_APP_WEBHOOK_SECRET',
      'GITHUB_APP_SLUG',
    ]);
    expect(manifest.auth.installationSecrets).toEqual([
      'INSTALLATION_ID',
      'USER_ACCESS_TOKEN',
      'USER_REFRESH_TOKEN',
      'USER_TOKEN_EXPIRES_AT',
      'USER_LOGIN',
    ]);
  });

  // Logos come from the service's official brand resources only, never generated.
  // A missing file stays a TODO (with where you searched in the README) until one exists.
  for (const key of ['logo', 'logoMono'] as const) {
    const file = join(APP_DIR, manifest[key]);
    if (existsSync(file)) {
      it(`ships ${key} (${manifest[key]})`, () => {
        if (key === 'logoMono') {
          // The host tints the mono logo, so it must carry no colours of its own.
          expect(readFileSync(file, 'utf-8')).not.toMatch(/fill="#|fill:\s*#|<style/);
        }
      });
    } else {
      it.todo(`${key}: add ${manifest[key]} from an official source (see README, Logos)`);
    }
  }
});

describe('GitHub: tools', () => {
  it('lists exactly the expected tools', async () => {
    const tools = await listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(EXPECTED_TOOLS);
    // 45 REST tools and 25 local git tools. The comments in src/app.ts and
    // src/tools/index.ts say 71; the app registers 70.
    expect(tools).toHaveLength(70);
  });

  it('declares every annotation explicitly on every tool', async () => {
    // Annotations are declared by the author, never inferred from tool names.
    const hints = [
      'readOnlyHint',
      'destructiveHint',
      'idempotentHint',
      'openWorldHint',
      'sensitive',
    ];
    for (const tool of await listTools()) {
      for (const hint of hints) {
        expect(typeof tool.annotations?.[hint], `${tool.name} does not declare ${hint}`).toBe(
          'boolean',
        );
      }
    }
  });

  it('marks exactly the writes as sensitive and only irreversible tools as destructive', async () => {
    const tools = await listTools();
    const where = (hint: string) =>
      tools
        .filter((t) => t.annotations?.[hint] === true)
        .map((t) => t.name)
        .sort();
    expect(where('sensitive')).toEqual(SENSITIVE_TOOLS);
    expect(where('destructiveHint')).toEqual(DESTRUCTIVE_TOOLS);
    for (const t of tools) {
      // No read-only tool is sensitive or destructive; every write asks first.
      expect(t.annotations?.sensitive, t.name).toBe(!t.annotations?.readOnlyHint);
      if (t.annotations?.readOnlyHint) expect(t.annotations?.destructiveHint, t.name).toBe(false);
    }
  });
});
