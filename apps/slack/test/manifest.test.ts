/**
 * Manifest and tool-surface checks for the Slack Agent App.
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
  'accept-shared-invite',
  'add-bookmark',
  'add-call',
  'add-call-participants',
  'add-emoji',
  'add-reaction',
  'add-remote-file',
  'append-stream',
  'approve-shared-invite',
  'archive-channel',
  'complete-upload',
  'create-canvas',
  'create-channel',
  'create-channel-canvas',
  'create-list',
  'create-list-field',
  'create-list-item',
  'decline-shared-invite',
  'delete-canvas',
  'delete-file',
  'delete-list',
  'delete-list-field',
  'delete-list-item',
  'delete-message',
  'delete-scheduled-message',
  'delete-user-photo',
  'edit-bookmark',
  'edit-canvas',
  'end-call',
  'end-dnd',
  'get-access-logs',
  'get-call',
  'get-channel',
  'get-dnd',
  'get-file',
  'get-integration-logs',
  'get-list',
  'get-permalink',
  'get-reactions',
  'get-remote-file',
  'get-team-dnd',
  'get-team-info',
  'get-team-preferences',
  'get-team-profile',
  'get-upload-url',
  'get-user',
  'get-user-identity',
  'get-user-presence',
  'get-user-profile',
  'invite-shared',
  'invite-to-channel',
  'join-channel',
  'kick-from-channel',
  'leave-channel',
  'list-auth-teams',
  'list-bookmarks',
  'list-channel-members',
  'list-channels',
  'list-connect-invites',
  'list-emoji',
  'list-files',
  'list-list-fields',
  'list-list-items',
  'list-messages',
  'list-my-reactions',
  'list-pins',
  'list-remote-files',
  'list-scheduled-messages',
  'list-stars',
  'list-user-channels',
  'list-users',
  'mark-channel-read',
  'open-dm',
  'pin-message',
  'remove-bookmark',
  'remove-call-participants',
  'remove-emoji',
  'remove-reaction',
  'remove-remote-file',
  'rename-channel',
  'revoke-auth',
  'revoke-file-public',
  'schedule-message',
  'search-files',
  'search-messages',
  'send-ephemeral',
  'send-me-message',
  'send-message',
  'send-thread-reply',
  'set-channel-purpose',
  'set-channel-topic',
  'set-dnd',
  'share-file-public',
  'share-remote-file',
  'star-item',
  'start-stream',
  'stop-stream',
  'unarchive-channel',
  'unfurl-link',
  'unpin-message',
  'unstar-item',
  'update-call',
  'update-list',
  'update-list-field',
  'update-list-item',
  'update-message',
  'update-remote-file',
  'update-user-profile',
  'upload-file',
];
/** Tools that pause for approval by default: exactly the ones that are not read-only. */
const SENSITIVE_TOOLS = [
  'accept-shared-invite',
  'add-bookmark',
  'add-call',
  'add-call-participants',
  'add-emoji',
  'add-reaction',
  'add-remote-file',
  'append-stream',
  'approve-shared-invite',
  'archive-channel',
  'complete-upload',
  'create-canvas',
  'create-channel',
  'create-channel-canvas',
  'create-list',
  'create-list-field',
  'create-list-item',
  'decline-shared-invite',
  'delete-canvas',
  'delete-file',
  'delete-list',
  'delete-list-field',
  'delete-list-item',
  'delete-message',
  'delete-scheduled-message',
  'delete-user-photo',
  'edit-bookmark',
  'edit-canvas',
  'end-call',
  'end-dnd',
  'invite-shared',
  'invite-to-channel',
  'join-channel',
  'kick-from-channel',
  'leave-channel',
  'mark-channel-read',
  'open-dm',
  'pin-message',
  'remove-bookmark',
  'remove-call-participants',
  'remove-emoji',
  'remove-reaction',
  'remove-remote-file',
  'rename-channel',
  'revoke-auth',
  'revoke-file-public',
  'schedule-message',
  'send-ephemeral',
  'send-me-message',
  'send-message',
  'send-thread-reply',
  'set-channel-purpose',
  'set-channel-topic',
  'set-dnd',
  'share-file-public',
  'share-remote-file',
  'star-item',
  'start-stream',
  'stop-stream',
  'unarchive-channel',
  'unfurl-link',
  'unpin-message',
  'unstar-item',
  'update-call',
  'update-list',
  'update-list-field',
  'update-list-item',
  'update-message',
  'update-remote-file',
  'update-user-profile',
  'upload-file',
];
/** Tools whose effect the app cannot undo. */
const DESTRUCTIVE_TOOLS = [
  'accept-shared-invite',
  'append-stream',
  'approve-shared-invite',
  'archive-channel',
  'complete-upload',
  'decline-shared-invite',
  'delete-canvas',
  'delete-file',
  'delete-list',
  'delete-list-field',
  'delete-list-item',
  'delete-message',
  'delete-scheduled-message',
  'delete-user-photo',
  'edit-canvas',
  'end-call',
  'invite-shared',
  'kick-from-channel',
  'leave-channel',
  'remove-bookmark',
  'remove-call-participants',
  'remove-emoji',
  'remove-remote-file',
  'revoke-auth',
  'revoke-file-public',
  'schedule-message',
  'send-ephemeral',
  'send-me-message',
  'send-message',
  'send-thread-reply',
  'share-remote-file',
  'start-stream',
  'upload-file',
];

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(APP_DIR, 'agentapp.json'), 'utf-8'));

describe('Slack: manifest', () => {
  it('passes the protocol schema', () => {
    const result = safeParseAppManifest(manifest);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
    expect(manifest.id).toBe('app.slack');
  });

  it('matches the createApp() config in src/app.ts', () => {
    const checkedIn = safeParseAppManifest(manifest);
    const generated = safeParseAppManifest(app.toManifest());
    expect(checkedIn.success && generated.success).toBe(true);
    if (!checkedIn.success || !generated.success) return;
    expect(generated.data).toEqual(checkedIn.data);
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

describe('Slack: tools', () => {
  it('lists exactly the expected tools', async () => {
    const tools = await listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(EXPECTED_TOOLS);
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
      expect(t.annotations?.sensitive, t.name).toBe(!t.annotations?.readOnlyHint);
    }
  });
});
