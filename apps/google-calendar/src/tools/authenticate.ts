import type { AgentApp } from '@agentapps/sdk';

export function registerAuthenticateTool(app: AgentApp): void {
  app.tool('authenticate', {
    description: 'Authenticate with Google Calendar OAuth',
    parameters: {
      type: 'object',
      properties: {
        provider: {
          type: 'string',
          description: 'OAuth provider (default: google)',
        },
      },
    },
    handler: async (args, ctx) => {
      const provider = (args.provider as string) ?? 'google';

      ctx.log('info', `Requesting OAuth for provider: ${provider}`);

      const result = await ctx.requestAuth({
        provider,
        scopes: ['https://www.googleapis.com/auth/calendar'],
        timeoutMs: 300_000, // 5 min
      });

      const now = Date.now();
      const expiresAt = result.expiresAt ? result.expiresAt.getTime() : now + 3600 * 1000;

      await ctx.secrets.updateInstallation({
        ACCESS_TOKEN: result.accessToken,
        ...(result.refreshToken ? { REFRESH_TOKEN: result.refreshToken } : {}),
        expiresAt: String(expiresAt),
      });

      return {
        authenticated: true,
        provider,
        accessToken: `${result.accessToken.substring(0, 10)}...`, // mask
      };
    },
  });
}
