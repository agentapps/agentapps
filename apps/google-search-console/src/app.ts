import { createApp } from '@agentapps/sdk';
import { ApiError, apiRequest, getAccessToken } from './lib/client.js';
import { registerTools } from './tools/index.js';

// Exported (not only wrapped in `factory`) so the tests can compare `app.toManifest()` with
// agentapp.json: both describe the same app and must not drift apart.
export const app = createApp({
  id: 'app.google.search-console',
  name: 'Google Search Console',
  version: '1.0.0',
  description:
    'Google Search Console: query search performance (clicks, impressions, CTR, position by query, page, country, device, date), compare periods, inspect URL index status, and manage sitemaps and properties through the Search Console API.',
  tagline: 'SEO performance, URL inspection and sitemaps from Google Search Console',
  author: { name: 'Pablo Lopez Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  logo: 'assets/logo.svg',
  logoMono: 'assets/logo-mono.svg',
  terms: 'https://agentapps.tech/terms',
  category: 'google',
  keywords: [
    'google',
    'search-console',
    'seo',
    'search-analytics',
    'sitemaps',
    'url-inspection',
    'indexing',
    'webmasters',
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
    provider: 'google',
    systemSecrets: ['CLIENT_ID', 'CLIENT_SECRET', 'REDIRECT_URI'],
    // Written by the host's OAuth flow; EXPIRY_DATE drives the host-side refresh.
    installationSecrets: ['ACCESS_TOKEN', 'REFRESH_TOKEN', 'EXPIRY_DATE'],
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    // Full webmasters scope: submit/delete sitemap and add/delete site need it
    // (webmasters.readonly covers only the reads).
    scopes: [
      'https://www.googleapis.com/auth/webmasters',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    pkce: false,
  },
});

app.health(async (ctx) => {
  try {
    await getAccessToken(ctx);
  } catch (err) {
    const message = (err as Error).message;
    return {
      status: 'not_ready' as const,
      message,
      issues: [{ code: 'MISSING_SECRET', message, severity: 'error' as const }],
    };
  }
  try {
    // The cheapest call that proves the token works: the property list.
    const data = await apiRequest<{ siteEntry?: unknown[] }>('GET', '/webmasters/v3/sites', ctx, {
      timeoutMs: 5_000,
    });
    const count = data?.siteEntry?.length ?? 0;
    return {
      status: 'ready' as const,
      message: `Google Search Console connected (${count} ${count === 1 ? 'property' : 'properties'})`,
    };
  } catch (err) {
    const message = (err as Error).message;
    // Auth and permission failures need the user; anything else is the service or network.
    const authProblem =
      (err instanceof ApiError && (err.status === 401 || err.status === 403)) ||
      /^\[(AUTH_EXPIRED|SYSTEM_CONFIG_MISSING)\]/.test(message);
    return authProblem
      ? {
          status: 'not_ready' as const,
          message,
          issues: [{ code: 'AUTH_EXPIRED', message, severity: 'error' as const }],
        }
      : {
          status: 'degraded' as const,
          message,
          issues: [{ code: 'DEPENDENCY_UNAVAILABLE', message, severity: 'warning' as const }],
        };
  }
});

registerTools(app);

export const factory = app.toFactory();
export default factory;
