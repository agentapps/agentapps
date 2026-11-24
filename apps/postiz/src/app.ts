import { createApp } from '@agentapps/sdk';
import { apiRequest, getSecrets } from './lib/client.js';
import { registerTools } from './tools/index.js';

// Exported (not only wrapped in `factory`) so the tests can compare `app.toManifest()` with
// agentapp.json: both describe the same app and must not drift apart.
export const app = createApp({
  id: 'app.postiz',
  name: 'Postiz',
  version: '1.0.0',
  description:
    'Draft, schedule and publish social posts through a Postiz account (cloud or self-hosted), list what is scheduled, delete posts, import media by URL and read channel and post analytics.',
  tagline: 'Draft, schedule and publish social posts across the channels connected in Postiz',
  author: {
    name: 'Pablo López Torres',
    email: 'pablolopeztorres@gmail.com',
  },
  license: 'MIT',
  logo: 'assets/logo.svg',
  logoMono: 'assets/logo-mono.svg',
  terms: 'https://agentapps.tech/terms',
  category: 'marketing',
  keywords: ['postiz', 'social media', 'publishing', 'scheduling', 'linkedin', 'x', 'instagram'],
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
    installationSecrets: ['POSTIZ_API_KEY', 'POSTIZ_API_URL'],
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
    // One cheap request that proves the instance is reachable and the key works (POSTIZ-REQ-2).
    await apiRequest('GET', '/is-connected', ctx, { timeoutMs: 5_000 });
    return { status: 'ready' as const, message: 'Postiz reachable' };
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
