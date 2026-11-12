/**
 * GitHub user-to-server token resolver.
 *
 * Each user obtains their own `user_access_token` via OAuth at install time.
 * Token lifetime: 8h access + 6 months refresh.
 */

import type { ToolContext } from '@agentapps/sdk';

export class GitHubUserNotAuthenticatedError extends Error {
  readonly code = 'USER_NOT_AUTHENTICATED' as const;
  readonly installUrl: string;

  constructor(installUrl: string) {
    super(`GitHub account not connected. Reconnect at ${installUrl} to continue.`);
    this.name = 'GitHubUserNotAuthenticatedError';
    this.installUrl = installUrl;
  }
}

/**
 * Resolve the user access token for an outgoing request.
 * Throws `GitHubUserNotAuthenticatedError` if no token is available.
 */
export async function resolveUserToken(ctx: ToolContext): Promise<string> {
  const user = await ctx.secrets.getInstallation();
  const token = user?.USER_ACCESS_TOKEN;
  if (token) return token;

  const sys = await ctx.secrets.getSystem();
  const slug = sys?.GITHUB_APP_SLUG ?? 'agentapps';
  throw new GitHubUserNotAuthenticatedError(`https://github.com/apps/${slug}/installations/new`);
}

/**
 * Read the install URL — used by error messages.
 */
export async function getInstallUrl(ctx: ToolContext): Promise<string> {
  const sys = await ctx.secrets.getSystem();
  const slug = sys?.GITHUB_APP_SLUG ?? 'agentapps';
  return `https://github.com/apps/${slug}/installations/new`;
}
