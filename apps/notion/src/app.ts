/**
 * Notion Agent App — entry point.
 *
 * OAuth2 auth with auto-refresh, health check, and 31 tools for pages,
 * databases, blocks, users, comments, search, and file uploads.
 */

import { createApp } from '@agentapps/sdk';
import { validateCredentials } from './lib/notion-client.js';
import { NotionApiError } from './lib/notion-error.js';
import { registerTools } from './tools/index.js';

// Exported (not just wrapped in `factory`) so tests can compare `app.toManifest()`
// with `agentapp.json`: the two describe the same app and must change together.
export const app = createApp({
  id: 'app.notion',
  version: '2.0.3',
  name: 'Notion',
  description: 'Notion workspace - pages, databases, blocks, search, comments, file uploads',
  tagline: 'Manage Notion pages, databases, and content',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  logo: 'assets/logo.svg',
  logoMono: 'assets/logo-mono.svg',
  terms: 'https://agentapps.tech/terms',
  category: 'productivity',
  keywords: ['notion', 'notes', 'wiki', 'documentation', 'knowledge-base', 'databases'],
  entrypoint: { type: 'module', path: 'src/app.ts', export: 'factory' },
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'oauth2',
    provider: 'notion',
    authorizeUrl: 'https://api.notion.com/v1/oauth/authorize',
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
    scopes: ['read_content', 'update_content'],
    pkce: false,
    systemSecrets: ['CLIENT_ID', 'CLIENT_SECRET'],
    installationSecrets: ['ACCESS_TOKEN', 'REFRESH_TOKEN', 'EXPIRY_DATE'],
  },
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.health(async (ctx) => {
  try {
    const installationSecrets = await ctx.secrets.getInstallation().catch((err: Error) => {
      if (/no user credentials configured/i.test(err.message)) return null;
      throw err;
    });

    if (!installationSecrets?.ACCESS_TOKEN) {
      return {
        status: 'degraded',
        message: 'Notion account not connected',
        details: { action: 'Connect your Notion account via OAuth.' },
      };
    }

    try {
      await validateCredentials(ctx);
      return { status: 'ok', message: 'Notion connected' };
    } catch (apiError) {
      if (apiError instanceof NotionApiError) {
        const { code, message } = apiError.classified;
        return {
          status: code === 'RATE_LIMITED' ? 'degraded' : 'error',
          message: `Notion: ${message}`,
          details: { code, action: apiError.classified.action },
        };
      }
      return {
        status: 'degraded',
        message: `Notion API error: ${apiError instanceof Error ? apiError.message : String(apiError)}`,
      };
    }
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to get secrets',
      details: { action: 'Ensure callbackUrl is provided and backend is reachable' },
    };
  }
});

// ---------------------------------------------------------------------------
// Register all tools
// ---------------------------------------------------------------------------

registerTools(app);

export const factory = app.toFactory();
