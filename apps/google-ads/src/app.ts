import { createApp } from '@agentapps/sdk';
import { adsRequest, getCredentials } from './lib/client.js';
import { registerTools } from './tools/index.js';

// Exported (not only wrapped in `factory`) so the tests can compare `app.toManifest()` with
// agentapp.json: both describe the same app and must not drift apart.
export const app = createApp({
  id: 'app.google.ads',
  name: 'Google Ads',
  version: '1.0.0',
  description:
    'Google Ads API (REST, v26): list the accounts a Google user can reach (including through manager accounts), report on account, campaign, ad group, ad, keyword and search term performance, run read-only GAQL queries, pause or enable campaigns and ad groups, change campaign budgets and add negative keywords. Writes that can spend money are marked destructive.',
  tagline: 'Report on Google Ads performance and manage campaigns, budgets and negative keywords',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  logo: 'assets/logo.svg',
  logoMono: 'assets/logo-mono.svg',
  terms: 'https://agentapps.tech/terms',
  category: 'google',
  keywords: [
    'google',
    'google-ads',
    'adwords',
    'ads',
    'ppc',
    'sem',
    'marketing',
    'advertising',
    'campaigns',
    'gaql',
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
    type: 'oauth2',
    // Must stay "google": the host only asks Google for offline access (a refresh token)
    // when the provider is named google.
    provider: 'google',
    systemSecrets: ['CLIENT_ID', 'CLIENT_SECRET', 'REDIRECT_URI', 'DEVELOPER_TOKEN'],
    installationSecrets: ['ACCESS_TOKEN', 'REFRESH_TOKEN', 'EMAIL', 'EXPIRY_DATE'],
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/adwords',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    pkce: false,
  },
});

app.health(async (ctx) => {
  try {
    await getCredentials(ctx);
  } catch (err) {
    const message = (err as Error).message;
    return {
      status: 'not_ready' as const,
      message,
      issues: [{ code: 'MISSING_SECRET', message, severity: 'error' as const }],
    };
  }
  try {
    // The cheapest call that proves the token, the developer token and the network.
    const list = await adsRequest<{ resourceNames?: string[] }>(
      'GET',
      '/customers:listAccessibleCustomers',
      ctx,
      { timeoutMs: 5_000 },
    );
    const count = list?.resourceNames?.length ?? 0;
    return {
      status: 'ready' as const,
      message: `Google Ads reachable; ${count} account${count === 1 ? '' : 's'} accessible`,
    };
  } catch (err) {
    const message = (err as Error).message;
    const auth = /^\[(AUTH_EXPIRED|AUTH_REQUIRED|PERMISSION_DENIED)\]/.test(message);
    return {
      status: (auth ? 'not_ready' : 'degraded') as 'not_ready' | 'degraded',
      message,
      issues: [
        {
          code: auth ? 'AUTH_REQUIRED' : 'DEPENDENCY_UNAVAILABLE',
          message,
          severity: (auth ? 'error' : 'warning') as 'error' | 'warning',
        },
      ],
    };
  }
});

registerTools(app);

export const factory = app.toFactory();
export default factory;
