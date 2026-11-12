import { createApp } from '@agentapps/sdk';
import { ApiError, apiRequest, getInstallationSecrets } from './lib/client.js';
import { registerTools } from './tools/index.js';

// Exported (not only wrapped in `factory`) so the tests can compare `app.toManifest()` with
// agentapp.json: both describe the same app and must not drift apart.
export const app = createApp({
  id: 'app.linkedin-ads',
  name: 'LinkedIn Ads',
  version: '1.0.0',
  description:
    'LinkedIn Marketing API (Advertising): list ad accounts, campaign groups, campaigns and creatives, report performance with adAnalytics, and pause, activate or re-budget campaigns.',
  tagline: 'Report on LinkedIn ad campaigns and pause, activate or re-budget them',
  author: { name: 'Pablo Lopez Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  logo: 'assets/logo.svg',
  logoMono: 'assets/logo-mono.svg',
  terms: 'https://agentapps.tech/terms',
  category: 'marketing',
  keywords: [
    'linkedin',
    'linkedin-ads',
    'advertising',
    'ads',
    'campaigns',
    'marketing',
    'b2b',
    'analytics',
    'reporting',
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
    provider: 'linkedin',
    systemSecrets: ['CLIENT_ID', 'CLIENT_SECRET'],
    installationSecrets: ['ACCESS_TOKEN', 'REFRESH_TOKEN', 'EXPIRY_DATE'],
    authorizeUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    // Least privilege for the tools: read accounts, read reporting, edit campaigns.
    scopes: ['r_ads', 'r_ads_reporting', 'rw_ads'],
    pkce: false,
  },
});

app.health(async (ctx) => {
  try {
    await getInstallationSecrets(ctx);
  } catch (err) {
    const message = (err as Error).message;
    return {
      status: 'not_ready' as const,
      message,
      issues: [{ code: 'MISSING_SECRET', message, severity: 'error' as const }],
    };
  }
  try {
    // The cheapest call that proves the token works: the member's ad account roles. No
    // token refresh here, so the check stays inside its 5 s budget.
    const roles = await apiRequest<{ elements?: unknown[] }>('GET', '/adAccountUsers', ctx, {
      query: [['q', 'authenticatedUser']],
      timeoutMs: 5_000,
      refresh: false,
      scope: 'r_ads',
    });
    const count = roles.elements?.length ?? 0;
    return {
      status: 'ready' as const,
      message: `LinkedIn Ads connected: ${count} ad account role(s) for this member`,
    };
  } catch (err) {
    const message = (err as Error).message;
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      return {
        status: 'not_ready' as const,
        message,
        issues: [{ code: 'AUTH_INVALID', message, severity: 'error' as const }],
      };
    }
    return {
      status: 'degraded' as const,
      message,
      issues: [{ code: 'DEPENDENCY_UNAVAILABLE', message, severity: 'warning' as const }],
    };
  }
});

registerTools(app);

export const factory = app.toFactory();
export default factory;
