/**
 * Telegram Agent App — send messages, manage chats, handle media,
 * and interact with Telegram users and groups via the Telegram Bot API.
 */

import { createApp } from '@agentapps/sdk';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.telegram',
  version: '2.0.1',
  name: 'Telegram',
  description:
    'Telegram Bot API — send messages, manage chats, handle media, and interact with Telegram users and groups.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'communication',
  keywords: ['telegram', 'messaging', 'bot', 'chat', 'notifications'],
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'api-key',
    systemSecrets: ['BOT_TOKEN'],
  },
});

app.health(async (ctx) => {
  ctx.log('debug', 'Running Telegram health check');

  const secrets = await ctx.secrets.getSystem();
  if (!secrets?.BOT_TOKEN) {
    return {
      status: 'not_ready',
      message: 'Missing Telegram bot token',
      issues: [
        {
          code: 'MISSING_SECRET',
          message: 'BOT_TOKEN system secret is required — use the token from @BotFather',
          severity: 'error' as const,
        },
      ],
    };
  }

  const res = await fetch(`https://api.telegram.org/bot${secrets.BOT_TOKEN}/getMe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  const data = (await res.json()) as {
    ok: boolean;
    result?: { username?: string };
    description?: string;
  };

  if (!data.ok) {
    throw new Error(`Telegram API error: ${data.description || res.statusText}`);
  }

  const result = data.result as { username?: string };
  return { status: 'ready' as const, message: `Telegram bot @${result.username} connected` };
});

registerTools(app);

export const factory = app.toFactory();
export default factory;
