/**
 * Freshdesk Agent App — customer support management.
 *
 * Manage tickets, contacts, agents, and companies via the Freshdesk REST API.
 * Auth: Basic auth (API key as username, "X" as password).
 */

import { createApp } from '@agentapps/sdk';
import { freshdeskRequest } from './lib/freshdesk-client.js';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.freshdesk',
  version: '2.0.0',
  name: 'Freshdesk',
  description:
    'Freshdesk customer support — manage tickets, contacts, agents, companies, and ticket fields.',
  author: { name: 'Pablo Lopez Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'support',
  keywords: ['freshdesk', 'support', 'tickets', 'helpdesk', 'customer-service'],
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
  capabilities: { tools: true, health: true },
  auth: { type: 'api-key', installationSecrets: ['DOMAIN', 'API_KEY'] },
});

app.health(async (ctx) => {
  const installationSecrets = await ctx.secrets.getInstallation().catch((err: Error) => {
    if (/no user credentials/i.test(err.message)) return null;
    throw err;
  });

  if (!installationSecrets?.API_KEY || !installationSecrets?.DOMAIN) {
    return {
      status: 'not_ready' as const,
      message: 'Freshdesk credentials not configured',
      issues: [
        {
          code: 'USER_NOT_AUTHENTICATED',
          message:
            'Configure your Freshdesk API key and domain in the app settings ' +
            '(Profile Settings → Your API Key; domain is "mycompany" from mycompany.freshdesk.com).',
          severity: 'warning' as const,
        },
      ],
    };
  }

  try {
    await freshdeskRequest('GET', '/agents/me', undefined, ctx);
  } catch (error: any) {
    const msg = String(error?.message ?? '');
    if (/401|403|unauthori[sz]ed/i.test(msg)) {
      return {
        status: 'not_ready' as const,
        message: 'Freshdesk API key is invalid',
        issues: [
          {
            code: 'AUTH_INVALID',
            message: 'The configured API key or domain is invalid.',
            severity: 'error' as const,
          },
        ],
      };
    }
    return {
      status: 'degraded' as const,
      message: `Freshdesk API error: ${msg}`,
      issues: [
        {
          code: 'DEPENDENCY_UNAVAILABLE',
          message: msg,
          severity: 'warning' as const,
        },
      ],
    };
  }

  return { status: 'ready' as const, message: 'Freshdesk connected' };
});

registerTools(app);

export const factory = app.toFactory();
