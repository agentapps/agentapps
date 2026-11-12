import type { AgentApp } from '@agentapps/sdk';
import { validateCredentials } from '../lib/index.js';
import { classifySlackApiError } from './_slack-error.js';

export function registerHealthCheckTool(app: AgentApp): void {
  app.tool('-health-check', {
    description:
      'Internal health check. Probes Slack OAuth credentials and API reachability via auth.test.',
    parameters: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    handler: async (_args, ctx) => {
      const issues: Array<{
        code: string;
        message: string;
        action: { type: string; description: string };
      }> = [];

      try {
        const systemSecrets = await ctx.secrets.getSystem();
        const installationSecrets = await ctx.secrets.getInstallation();

        if (!systemSecrets?.CLIENT_ID || !systemSecrets?.CLIENT_SECRET) {
          issues.push({
            code: 'SYSTEM_CONFIG_MISSING',
            message: 'Slack OAuth client credentials not configured',
            action: {
              type: 'admin_action',
              description: 'Configure CLIENT_ID and CLIENT_SECRET in system secrets.',
            },
          });
        }
        if (!installationSecrets?.ACCESS_TOKEN) {
          issues.push({
            code: 'AUTH_REQUIRED',
            message: 'Slack workspace not connected',
            action: {
              type: 'user_action',
              description: 'Connect your Slack workspace from app settings.',
            },
          });
        } else {
          try {
            await validateCredentials(ctx);
          } catch (apiError: unknown) {
            const classified = classifySlackApiError(apiError);
            issues.push({
              code: classified.code,
              message: classified.upstreamMessage,
              action: {
                type:
                  classified.action.type === 'reconnect' ? 'user_action' : classified.action.type,
                description: classified.action.description,
              },
            });
          }
        }
      } catch (error) {
        issues.push({
          code: 'SYSTEM_CONFIG_MISSING',
          message: error instanceof Error ? error.message : 'Failed to load secrets',
          action: {
            type: 'admin_action',
            description: 'Ensure callbackUrl is reachable and secrets are configured.',
          },
        });
      }

      return {
        version: '2.0.0',
        uptime: Math.floor(process.uptime()),
        status: issues.length === 0 ? 'healthy' : 'unhealthy',
        issues,
      };
    },
  });
}
