import { createApp } from '@agentapps/sdk';
import { calendlyRequest } from './lib/calendly-client.js';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.calendly',
  version: '2.0.3',
  name: 'Calendly',
  description:
    'Calendly scheduling — manage event types, scheduled events, invitees, and availability.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'scheduling',
  keywords: ['calendly', 'scheduling', 'calendar', 'meetings', 'appointments'],
  runtime: { transport: 'stdio', command: 'node', args: ['dist/app.js'] },
  capabilities: { tools: true, health: true },
  auth: { type: 'api-key', installationSecrets: ['ACCESS_TOKEN'] },
});

app.health(async (ctx) => {
  const installationSecrets = await ctx.secrets.getInstallation().catch((err: Error) => {
    if (/no user credentials/i.test(err.message)) return null;
    throw err;
  });
  const token = installationSecrets?.ACCESS_TOKEN;

  if (!token) {
    return {
      status: 'not_ready' as const,
      message: 'Calendly access token not configured',
      issues: [
        {
          code: 'USER_NOT_AUTHENTICATED',
          message: 'Configure your Calendly personal access token in app settings.',
          severity: 'warning' as const,
        },
      ],
    };
  }

  try {
    await calendlyRequest('GET', '/users/me', undefined, ctx);
  } catch (error: any) {
    const msg = String(error?.message ?? '');
    if (/401|403|unauthori[sz]ed/i.test(msg)) {
      return {
        status: 'not_ready' as const,
        message: 'Calendly access token is invalid',
        issues: [
          {
            code: 'AUTH_INVALID',
            message: 'The configured access token is invalid or expired.',
            severity: 'error' as const,
          },
        ],
      };
    }
    return {
      status: 'degraded' as const,
      message: `Calendly API error: ${msg}`,
      issues: [
        {
          code: 'DEPENDENCY_UNAVAILABLE',
          message: msg,
          severity: 'warning' as const,
        },
      ],
    };
  }

  return { status: 'ready' as const, message: 'Calendly connected' };
});

registerTools(app);

export const factory = app.toFactory();
