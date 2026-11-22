import { createApp } from '@agentapps/sdk';
import { classifyAccountsProbe, createAnalyticsClients, getAnalyticsSecrets } from './lib/index.js';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.google.analytics',
  version: '3.0.0',
  name: 'Google Analytics',
  description:
    'Google Analytics 4 (GA4) — run reports, query realtime data, and manage properties and data streams',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'google',
  keywords: [
    'google',
    'analytics',
    'ga4',
    'reports',
    'metrics',
    'dimensions',
    'events',
    'realtime',
  ],
  runtime: { transport: 'stdio', command: 'node', args: ['dist/app.js'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'oauth2',
    provider: 'google',
    systemSecrets: ['CLIENT_ID', 'CLIENT_SECRET', 'REDIRECT_URI'],
    installationSecrets: ['ACCESS_TOKEN', 'REFRESH_TOKEN', 'EMAIL', 'EXPIRY_DATE'],
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/analytics.readonly',
      'https://www.googleapis.com/auth/analytics.edit',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    pkce: false,
  },
});

app.health(async (ctx) => {
  const secrets = await getAnalyticsSecrets(ctx);

  if (!secrets.CLIENT_ID || !secrets.CLIENT_SECRET) {
    throw new Error('Google OAuth credentials not configured. Missing CLIENT_ID or CLIENT_SECRET.');
  }

  if (!secrets.ACCESS_TOKEN || !secrets.REFRESH_TOKEN) {
    throw new Error('Google account not connected. Please connect your Google account.');
  }

  // Probe the Admin API to verify connectivity.
  const { admin } = await createAnalyticsClients(secrets);
  const probe = await admin.accounts.list({ pageSize: 1 });
  const issue = classifyAccountsProbe({ accountCount: probe.data.accounts?.length ?? 0 });
  if (issue) {
    throw new Error(issue.message);
  }
  return { status: 'ready' as const, message: 'Google Analytics connected' };
});

registerTools(app);

export const factory = app.toFactory();
