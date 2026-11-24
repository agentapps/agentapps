import { createApp } from '@agentapps/sdk';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.browserbase',
  version: '2.0.2',
  name: 'Browserbase',
  description:
    'Cloud browser automation at scale. Anti-bot bypass, CAPTCHA solving, residential proxies, session recording, and parallel browsers.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'development',
  keywords: [
    'browser',
    'browserbase',
    'automation',
    'scraping',
    'headless',
    'cloud',
    'stealth',
    'captcha',
  ],
  runtime: { transport: 'stdio', command: 'node', args: ['dist/app.js'] },
  capabilities: { tools: true, health: true },
  auth: { type: 'api-key', installationSecrets: ['BROWSERBASE_API_KEY', 'BROWSERBASE_PROJECT_ID'] },
});

app.health(async (ctx) => {
  const installationSecrets = (await ctx.secrets.getInstallation()) ?? {};
  if (!installationSecrets.BROWSERBASE_API_KEY || !installationSecrets.BROWSERBASE_PROJECT_ID) {
    throw new Error('Browserbase API key or project ID not configured.');
  }
  return { status: 'ready' as const, message: 'Browserbase configured' };
});

registerTools(app);

export const factory = app.toFactory();
