import { createApp } from '@agentapps/sdk';
import { googlePeopleRequest } from './lib/google-client.js';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.google.contacts',
  version: '2.0.2',
  name: 'Google Contacts',
  description:
    'Manage Google Contacts — list, search, create, update, and delete contacts, plus organize them into groups and labels via the Google People API.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'productivity',
  keywords: ['google', 'contacts', 'people', 'crm'],
  runtime: { transport: 'stdio', command: 'node', args: ['dist/app.js'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'oauth2',
    provider: 'google',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/contacts',
      'https://www.googleapis.com/auth/contacts.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    systemSecrets: ['CLIENT_ID', 'CLIENT_SECRET'],
    installationSecrets: ['ACCESS_TOKEN', 'REFRESH_TOKEN'],
  },
});

app.health(async (ctx) => {
  const system = await ctx.secrets.getSystem();
  if (!system?.CLIENT_ID || !system?.CLIENT_SECRET) {
    return {
      status: 'not_ready',
      message: 'Missing Google OAuth system secrets (CLIENT_ID / CLIENT_SECRET)',
      issues: [
        {
          code: 'MISSING_SECRET',
          message: 'CLIENT_ID and CLIENT_SECRET are required for Google OAuth',
          severity: 'error' as const,
        },
      ],
    };
  }

  const user = await ctx.secrets.getInstallation();
  if (!user?.ACCESS_TOKEN || !user?.REFRESH_TOKEN) {
    return {
      status: 'not_ready',
      message: 'Google account not connected',
      issues: [
        {
          code: 'AUTH_REQUIRED',
          message: 'Connect your Google account to use Contacts',
          severity: 'error' as const,
        },
      ],
    };
  }

  // Validate the token by making a lightweight API call.
  try {
    await googlePeopleRequest(ctx, '/people/me', {
      query: { personFields: 'names' },
    });
  } catch {
    return {
      status: 'not_ready',
      message: 'Google API connectivity check failed',
      issues: [
        {
          code: 'API_ERROR',
          message: 'Could not reach the Google People API — token may be expired or revoked',
          severity: 'error' as const,
        },
      ],
    };
  }
  return { status: 'ready' as const, message: 'Google Contacts connected' };
});

registerTools(app);

export const factory = app.toFactory();
