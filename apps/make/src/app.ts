import { createApp } from '@agentapps/sdk';
import { accountApiRaw, DEFAULT_REGION, MAKE_REGIONS } from './lib/make-client.js';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.make',
  version: '2.0.2',
  name: 'Make',
  description:
    'Make.com automation — trigger scenarios via webhooks (no token needed) and manage scenarios via the account API: create, read, update, delete, clone, start, stop, list, run, and inspect blueprints.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'productivity',
  keywords: [
    'make',
    'make.com',
    'integromat',
    'automation',
    'webhook',
    'scenario',
    'no-code',
    'integration',
    'blueprint',
  ],
  runtime: { transport: 'stdio', command: 'node', args: ['dist/app.js'] },
  capabilities: { tools: true, health: true },
  auth: { type: 'api-key', installationSecrets: ['MAKE_API_TOKEN', 'MAKE_REGION'] },
});

app.health(async (ctx) => {
  const installationSecrets = (await ctx.secrets.getInstallation()) ?? {};
  const token = installationSecrets.MAKE_API_TOKEN ?? installationSecrets.make_api_token;

  // No token -> webhook-only mode is fully functional. Healthy, no issue.
  if (!token || token.trim().length === 0) {
    return {
      status: 'ready' as const,
      message: 'Make webhook-only mode (no API token configured)',
    };
  }

  // Token present -> validate region config first.
  const rawRegion = (installationSecrets.MAKE_REGION ?? '').trim().toLowerCase();
  if (rawRegion.length > 0 && !(MAKE_REGIONS as readonly string[]).includes(rawRegion)) {
    throw new Error(
      `Invalid MAKE_REGION "${installationSecrets.MAKE_REGION}" (expected ${MAKE_REGIONS.join(', ')})`,
    );
  }
  const region = (rawRegion as typeof DEFAULT_REGION) || DEFAULT_REGION;

  const { status } = await accountApiRaw('GET', '/users/me', {
    apiKey: token.trim(),
    region,
    timeoutMs: 5000,
  });

  if (status === 401) {
    throw new Error('Make API token is invalid or expired');
  } else if (status === 429) {
    throw new Error('Make API rate limit reached');
  } else if (status >= 400 && status !== 403) {
    // 403 is treated as healthy on purpose: the token authenticated fine but
    // lacks the `organization:read` scope that /users/me needs. A token scoped
    // only to `scenarios:*` is fully usable by this app's tools.
    throw new Error(`Make API returned ${status}`);
  }
  return { status: 'ready' as const, message: 'Make API token is valid' };
});

registerTools(app);

export const factory = app.toFactory();
