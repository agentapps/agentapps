/**
 * Dropbox Agent App — entry point.
 *
 * Dropbox file storage: list, search, upload, download, and share files
 * and folders via the Dropbox REST API (OAuth2).
 */

import { createApp } from '@agentapps/sdk';
import { dropboxRequest } from './lib/dropbox-client.js';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.dropbox',
  version: '2.1.0',
  name: 'Dropbox',
  description:
    'Dropbox file storage — list, search, upload, download, and share files and folders.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'storage',
  keywords: ['dropbox', 'files', 'storage', 'cloud', 'sharing'],
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'oauth2',
    provider: 'dropbox',
    authorizeUrl: 'https://www.dropbox.com/oauth2/authorize',
    tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
    scopes: [
      'files.content.read',
      'files.content.write',
      'files.metadata.read',
      'sharing.read',
      'sharing.write',
      'account_info.read',
    ],
    pkce: false,
    systemSecrets: ['CLIENT_ID', 'CLIENT_SECRET'],
    installationSecrets: ['ACCESS_TOKEN', 'REFRESH_TOKEN'],
  },
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.health(async (ctx) => {
  const installationSecrets = await ctx.secrets.getInstallation().catch(() => null);

  if (!installationSecrets?.ACCESS_TOKEN) {
    return {
      status: 'not_ready' as const,
      message: 'Dropbox account not connected',
      issues: [
        {
          code: 'USER_NOT_AUTHENTICATED',
          message: 'Connect your Dropbox account to use this app.',
          severity: 'warning' as const,
        },
      ],
    };
  }

  // Validate the token by calling the account info endpoint.
  try {
    await dropboxRequest('users/get_current_account', null, {
      installationSecret: async (key) => installationSecrets[key] ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: 'not_ready' as const,
      message: `Dropbox: ${message}`,
      issues: [
        {
          code: 'AUTH_FAILED',
          message,
          severity: 'error' as const,
        },
      ],
    };
  }

  return { status: 'ready' as const, message: 'Dropbox connected' };
});

// ---------------------------------------------------------------------------
// Register all tools
// ---------------------------------------------------------------------------

registerTools(app);

export const factory = app.toFactory();
export default factory;
