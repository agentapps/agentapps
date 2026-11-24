import { createApp } from '@agentapps/sdk';
import { apiRequest, getSecrets } from './lib/client.js';
import { registerTools } from './tools/index.js';

// Exported (not only wrapped in `factory`) so the tests can compare `app.toManifest()` with
// agentapp.json: both describe the same app and must not drift apart.
export const app = createApp({
  id: 'app.metricool',
  name: 'Metricool',
  version: '1.0.0',
  description:
    'Schedule social posts and drafts through a Metricool account, list and delete what is scheduled, and read analytics: metric timelines, published posts with their metrics and the best times to post.',
  tagline: 'Schedule social posts and read analytics for the brands of a Metricool account',
  author: {
    name: 'Pablo López Torres',
    email: 'pablolopeztorres@gmail.com',
  },
  license: 'MIT',
  logo: 'assets/logo.svg',
  logoMono: 'assets/logo-mono.svg',
  terms: 'https://agentapps.tech/terms',
  category: 'marketing',
  keywords: ['metricool', 'social media', 'scheduling', 'analytics', 'instagram', 'linkedin', 'x'],
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
    installationSecrets: ['METRICOOL_USER_TOKEN', 'METRICOOL_USER_ID'],
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
    // One request that proves the API is reachable and the token works (METRICOOL-REQ-2).
    await apiRequest('GET', '/v2/settings/brands', ctx, { timeoutMs: 5_000 });
    return { status: 'ready' as const, message: 'Metricool reachable' };
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
