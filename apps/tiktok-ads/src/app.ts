import { createApp } from '@agentapps/sdk';
import { apiRequest, getAppCredentials, getSecrets } from './lib/client.js';
import { registerTools } from './tools/index.js';

// Exported (not only wrapped in `factory`) so the tests can compare `app.toManifest()` with
// agentapp.json: both describe the same app and must not drift apart.
export const app = createApp({
  id: 'app.tiktok-ads',
  name: 'TikTok Ads',
  version: '1.0.0',
  description:
    'TikTok Ads through the TikTok API for Business (Marketing API v1.3): list ad accounts, campaigns, ad groups and ads, run performance and audience reports, pause or enable delivery and change campaign or ad group budgets. Enabling delivery and budget changes affect spend and ask for approval.',
  tagline: 'Report on TikTok ad campaigns and pause, enable or re-budget them',
  author: { name: 'Pablo Lopez Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  logo: 'assets/logo.png',
  logoMono: 'assets/logo-mono.svg',
  terms: 'https://agentapps.tech/terms',
  category: 'marketing',
  keywords: [
    'tiktok',
    'tiktok-ads',
    'ads',
    'advertising',
    'marketing',
    'campaigns',
    'reports',
    'ppc',
  ],
  entrypoint: {
    type: 'module',
    path: 'src/app.ts',
    export: 'factory',
  },
  runtime: {
    transport: 'stdio',
    command: 'tsx',
    args: ['src/app.ts'],
  },
  capabilities: {
    tools: true,
    health: true,
  },
  auth: {
    type: 'api-key',
    // The developer app's credentials, shared by every installation; only list-advertisers
    // (and the health check) need them.
    systemSecrets: ['TIKTOK_APP_ID', 'TIKTOK_APP_SECRET'],
    installationSecrets: ['TIKTOK_ACCESS_TOKEN'],
  },
});

app.health(async (ctx) => {
  try {
    await getSecrets(ctx);
  } catch (err) {
    const message = (err as Error).message;
    return {
      status: 'not_ready' as const,
      message,
      issues: [{ code: 'MISSING_SECRET', message, severity: 'error' as const }],
    };
  }
  let credentials: { appId: string; appSecret: string };
  try {
    credentials = await getAppCredentials(ctx);
  } catch (err) {
    // Without the developer app's credentials only list-advertisers fails, and no other
    // endpoint proves the token works without an advertiser id, so report degraded.
    const message = (err as Error).message;
    return {
      status: 'degraded' as const,
      message,
      issues: [{ code: 'MISSING_SECRET', message, severity: 'warning' as const }],
    };
  }
  try {
    // The cheapest request that proves the host is reachable and the token and app work.
    await apiRequest('GET', '/oauth2/advertiser/get/', ctx, {
      params: { app_id: credentials.appId, secret: credentials.appSecret },
      timeoutMs: 5_000,
    });
    return { status: 'ready' as const, message: 'TikTok API for Business reachable, token valid' };
  } catch (err) {
    const message = (err as Error).message;
    const auth = message.startsWith('[AUTH_REQUIRED]') || message.startsWith('[FORBIDDEN]');
    return {
      status: auth ? ('not_ready' as const) : ('degraded' as const),
      message,
      issues: [
        auth
          ? { code: 'AUTH_FAILED', message, severity: 'error' as const }
          : { code: 'DEPENDENCY_UNAVAILABLE', message, severity: 'warning' as const },
      ],
    };
  }
});

registerTools(app);

export const factory = app.toFactory();
export default factory;
