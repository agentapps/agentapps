/**
 * Twilio Agent App — send SMS, make calls, manage phone numbers,
 * and check message status via the Twilio API.
 */

import { createApp } from '@agentapps/sdk';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.twilio',
  version: '3.0.1',
  name: 'Twilio',
  description:
    'Twilio communications — send SMS, make calls, manage phone numbers, and check message status.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'communication',
  keywords: ['twilio', 'sms', 'voice', 'phone', 'messaging'],
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'api-key',
    systemSecrets: ['ACCOUNT_SID', 'AUTH_TOKEN'],
  },
});

app.health(async (ctx) => {
  ctx.log('debug', 'Running Twilio health check');

  const secrets = await ctx.secrets.getSystem();
  if (!secrets?.ACCOUNT_SID || !secrets?.AUTH_TOKEN) {
    return {
      status: 'not_ready',
      message: 'Missing Twilio credentials',
      issues: [
        {
          code: 'MISSING_SECRET',
          message:
            'ACCOUNT_SID and AUTH_TOKEN system secrets are required — find them in your Twilio console.',
          severity: 'error' as const,
        },
      ],
    };
  }

  const accountSid = secrets.ACCOUNT_SID;
  const authToken = secrets.AUTH_TOKEN;

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`, {
    headers: {
      Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Twilio API error: ${body?.message || res.statusText}`);
  }

  const result = (await res.json()) as Record<string, unknown>;
  return { status: 'ready' as const, message: `Twilio account ${result.friendly_name} connected` };
});

registerTools(app);

export const factory = app.toFactory();
export default factory;
