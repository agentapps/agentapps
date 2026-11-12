/**
 * Slack Agent App — entry point.
 * 90+ tools for channels, messages, threads, reactions, files, users, search, and presence.
 */
import { createApp } from '@agentapps/sdk';
import { classifySlackApiError } from './tools/_slack-error.js';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.slack',
  version: '2.0.0',
  name: 'Slack',
  description: 'Full Slack workspace integration via Web API with OAuth 2.0',
  author: { name: 'Pablo Lopez Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'communication',
  keywords: ['slack', 'messaging', 'chat', 'workspace', 'collaboration'],
  runtime: { transport: 'stdio', command: 'node', args: ['dist/app.js'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'oauth2',
    provider: 'slack',
    authorizeUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    scopes: [
      'bookmarks:read',
      'bookmarks:write',
      'calls:read',
      'calls:write',
      'canvases:write',
      'channels:history',
      'channels:join',
      'channels:manage',
      'channels:read',
      'channels:write.invites',
      'channels:write.topic',
      'chat:write',
      'chat:write.customize',
      'commands',
      'conversations.connect:manage',
      'conversations.connect:read',
      'conversations.connect:write',
      'incoming-webhook',
      'dnd:read',
      'dnd:write',
      'emoji:read',
      'files:read',
      'files:write',
      'groups:history',
      'groups:read',
      'groups:write',
      'groups:write.invites',
      'im:history',
      'im:read',
      'im:write',
      'links:write',
      'lists:read',
      'lists:write',
      'mpim:history',
      'mpim:read',
      'mpim:write',
      'pins:read',
      'pins:write',
      'reactions:read',
      'reactions:write',
      'remote_files:read',
      'remote_files:share',
      'remote_files:write',
      'search:read',
      'search:read.files',
      'search:read.public',
      'stars:read',
      'stars:write',
      'team.preferences:read',
      'team:read',
      'users.profile:read',
      'users.profile:write',
      'users:read',
      'users:read.email',
    ],
    pkce: false,
    systemSecrets: ['CLIENT_ID', 'CLIENT_SECRET', 'REDIRECT_URI'],
    installationSecrets: [
      'ACCESS_TOKEN',
      'BOT_ACCESS_TOKEN',
      'REFRESH_TOKEN',
      'TEAM_ID',
      'TEAM_NAME',
      'USER_ID',
    ],
  },
});

app.health(async (ctx) => {
  try {
    const systemSecrets = await ctx.secrets.getSystem();
    const installationSecrets = await ctx.secrets.getInstallation().catch((err: Error) => {
      if (/no user credentials configured/i.test(err.message)) return null;
      throw err;
    });

    if (!systemSecrets?.CLIENT_ID || !systemSecrets?.CLIENT_SECRET) {
      return {
        status: 'not_ready' as const,
        message: 'Slack OAuth client credentials not configured',
        issues: [
          {
            code: 'SYSTEM_NOT_CONFIGURED',
            message: 'Configure CLIENT_ID and CLIENT_SECRET in system secrets.',
            severity: 'error' as const,
          },
        ],
      };
    }

    if (!installationSecrets?.ACCESS_TOKEN) {
      return {
        status: 'not_ready' as const,
        message: 'Slack workspace not connected',
        issues: [
          {
            code: 'USER_NOT_AUTHENTICATED',
            message: 'Connect your Slack workspace from app settings.',
            severity: 'warning' as const,
          },
        ],
      };
    }

    return { status: 'ready' as const, message: 'Slack connected' };
  } catch (error) {
    const classified = classifySlackApiError(error);
    return {
      status: 'not_ready' as const,
      message: `Slack: ${classified.upstreamMessage}`,
      issues: [
        { code: classified.code, message: classified.upstreamMessage, severity: 'error' as const },
      ],
    };
  }
});

registerTools(app);
export const factory = app.toFactory();
