/**
 * GitHub Agent App — entry point.
 *
 * GitHub App OAuth (user-to-server tokens) + local git CLI operations.
 * 71 tools across repos, issues, PRs, branches, commits, workflows,
 * releases, files, search, checks, clone, and 25 local git operations.
 */

import { createApp } from '@agentapps/sdk';
import { classifyGitHubError } from './tools/_github-error.js';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.github',
  version: '1.0.0',
  name: 'GitHub',
  description: 'GitHub REST API (user-to-server OAuth) + local git operations',
  author: { name: 'Pablo Lopez Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'developer-tools',
  keywords: ['github', 'git', 'repos', 'issues', 'pull-requests', 'actions', 'ci-cd'],
  runtime: { transport: 'stdio', command: 'node', args: ['dist/app.js'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'github-app',
    provider: 'github',
    appSlug: 'agentapps',
    setupUrl: 'https://github.com/apps/agentapps/installations/new',
    userOAuth: true,
    systemSecrets: [
      'GITHUB_APP_ID',
      'GITHUB_APP_PRIVATE_KEY',
      'GITHUB_APP_CLIENT_ID',
      'GITHUB_APP_CLIENT_SECRET',
      'GITHUB_APP_WEBHOOK_SECRET',
      'GITHUB_APP_SLUG',
    ],
    installationSecrets: [
      'INSTALLATION_ID',
      'USER_ACCESS_TOKEN',
      'USER_REFRESH_TOKEN',
      'USER_TOKEN_EXPIRES_AT',
      'USER_LOGIN',
    ],
  },
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.health(async (ctx) => {
  try {
    const installationSecrets = await ctx.secrets.getInstallation().catch((err: Error) => {
      if (/no user credentials configured/i.test(err.message)) return null;
      throw err;
    });
    const systemSecrets = await ctx.secrets.getSystem();

    if (!systemSecrets?.GITHUB_APP_ID || !systemSecrets?.GITHUB_APP_PRIVATE_KEY) {
      return {
        status: 'not_ready' as const,
        message: 'GitHub App not configured by admin',
        issues: [
          {
            code: 'SYSTEM_NOT_CONFIGURED',
            message:
              'GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, and GITHUB_APP_WEBHOOK_SECRET must be set in system secrets.',
            severity: 'error' as const,
          },
        ],
      };
    }

    if (!installationSecrets?.USER_ACCESS_TOKEN) {
      const slug = systemSecrets.GITHUB_APP_SLUG ?? 'agentapps';
      return {
        status: 'not_ready' as const,
        message: 'GitHub account not connected for this user',
        issues: [
          {
            code: 'USER_NOT_AUTHENTICATED',
            message: 'Connect your GitHub account so actions are signed with your identity.',
            severity: 'warning' as const,
            action: {
              type: 'link' as const,
              url: `https://github.com/apps/${slug}/installations/new`,
              label: 'Connect GitHub',
            },
          },
        ],
      };
    }

    // Token exists — we consider this ready. Full validation happens on
    // first tool call (the githubRequest helper handles 401/refresh).
    return { status: 'ready' as const, message: 'GitHub connected' };
  } catch (error) {
    const classified = classifyGitHubError(error);
    return {
      status: 'not_ready' as const,
      message: `GitHub: ${classified.message}`,
      issues: [
        {
          code: classified.code,
          message: classified.message,
          severity: 'error' as const,
        },
      ],
    };
  }
});

// ---------------------------------------------------------------------------
// Register all tools
// ---------------------------------------------------------------------------

registerTools(app);

export const factory = app.toFactory();
