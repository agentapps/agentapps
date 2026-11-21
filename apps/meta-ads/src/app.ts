import { createApp } from '@agentapps/sdk';
import { apiRequest, getSecrets } from './lib/client.js';
import { registerTools } from './tools/index.js';

// Exported (not only wrapped in `factory`) so the tests can compare `app.toManifest()` with
// agentapp.json: both describe the same app and must not drift apart.
export const app = createApp({
  id: 'app.meta-ads',
  name: 'Meta Ads',
  version: '1.0.0',
  description:
    'Meta (Facebook and Instagram) ads through the Marketing API: list ad accounts, campaigns, ad sets, ads and creatives, run performance reports with breakdowns, pause or activate delivery, change budgets, and create campaigns and ad sets (always paused)',
  tagline: 'Report on Meta ad performance and manage campaigns, ad sets, ads and budgets',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  logo: 'assets/logo.svg',
  logoMono: 'assets/logo-mono.svg',
  homepage: 'https://developers.facebook.com/docs/marketing-api',
  terms: 'https://agentapps.tech/terms',
  category: 'marketing',
  keywords: [
    'meta',
    'facebook',
    'instagram',
    'ads',
    'advertising',
    'marketing',
    'campaigns',
    'insights',
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
    installationSecrets: ['META_ACCESS_TOKEN'],
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
  try {
    // The cheapest call that proves the token is valid: who it belongs to.
    const me = await apiRequest<{ id: string; name?: string }>('GET', '/me', ctx, {
      params: { fields: 'id,name' },
      timeoutMs: 5_000,
    });
    return {
      status: 'ready' as const,
      message: `Meta Graph API reachable; token belongs to ${me.name ?? 'user'} (${me.id})`,
    };
  } catch (err) {
    const message = (err as Error).message;
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
