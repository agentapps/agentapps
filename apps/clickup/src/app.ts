import { createApp } from '@agentapps/sdk';
import { clickupRequest } from './lib/clickup-client.js';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.clickup',
  version: '2.0.0',
  name: 'ClickUp',
  description:
    'ClickUp project management - manage tasks, lists, folders, spaces and workspaces via ClickUp API with OAuth2',
  author: { name: 'Pablo Lopez Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'productivity',
  keywords: ['clickup', 'tasks', 'project', 'management', 'productivity', 'kanban'],
  runtime: { transport: 'stdio', command: 'node', args: ['dist/app.js'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'oauth2',
    provider: 'clickup',
    authorizeUrl: 'https://app.clickup.com/api',
    tokenUrl: 'https://api.clickup.com/api/v2/oauth/token',
    scopes: ['read', 'write'],
    pkce: false,
    systemSecrets: ['CLIENT_ID', 'CLIENT_SECRET'],
    installationSecrets: [
      'ACCESS_TOKEN',
      'REFRESH_TOKEN',
      'TOKEN_TYPE',
      'USER_ID',
      'USER_EMAIL',
      'USER_USERNAME',
    ],
  },
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
      message: 'ClickUp account not connected',
      issues: [
        {
          code: 'USER_NOT_AUTHENTICATED',
          message: 'Connect your ClickUp account via OAuth to use this integration.',
          severity: 'warning' as const,
        },
      ],
    };
  }

  try {
    await clickupRequest(ctx, '/user');
  } catch (error: any) {
    const msg = String(error?.message ?? '');
    if (/401|403|unauthori[sz]ed/i.test(msg)) {
      return {
        status: 'not_ready' as const,
        message: 'ClickUp access token is invalid',
        issues: [
          {
            code: 'AUTH_INVALID',
            message: 'Reconnect your ClickUp account via OAuth.',
            severity: 'error' as const,
          },
        ],
      };
    }
    return {
      status: 'degraded' as const,
      message: `ClickUp API error: ${msg}`,
      issues: [
        {
          code: 'DEPENDENCY_UNAVAILABLE',
          message: msg,
          severity: 'warning' as const,
        },
      ],
    };
  }

  return { status: 'ready' as const, message: 'ClickUp connected' };
});

registerTools(app);

export const factory = app.toFactory();
