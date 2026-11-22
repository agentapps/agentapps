import type { AgentApp } from '@agentapps/sdk';
import { githubRequest } from '../lib/github-client.js';

interface UserInstallation {
  id: number;
  account: { login: string; type: 'User' | 'Organization' } | null;
  repository_selection: 'all' | 'selected';
  permissions?: Record<string, string>;
  app_slug?: string;
}
interface UserInstallationsPayload {
  total_count: number;
  installations: UserInstallation[];
}
interface InstallationReposPayload {
  total_count: number;
  repositories: Array<{ full_name: string; private: boolean; owner?: { login: string } }>;
}

export function registerGetInstallationContextTool(app: AgentApp) {
  app.tool('get-installation-context', {
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    description:
      'List the GitHub App installations reachable by the current user, with accessible repos, granted permissions, and manage/install URLs.',
    parameters: { type: 'object', properties: {} },
    handler: async (_args, ctx) => {
      const sys = await ctx.secrets.getSystem();
      const slug = sys?.GITHUB_APP_SLUG ?? 'agentapps';
      const installUrl = `https://github.com/apps/${slug}/installations/new`;
      const installationsPayload = (await githubRequest(ctx, '/user/installations', {
        params: { per_page: 100 },
      })) as UserInstallationsPayload;
      const installations = installationsPayload.installations ?? [];
      if (installations.length === 0)
        return { app: { name: 'GitHub App', slug }, installations: [], install_url: installUrl };
      const enriched = await Promise.all(
        installations.map(async (inst) => {
          const repos = (await githubRequest(ctx, `/user/installations/${inst.id}/repositories`, {
            params: { per_page: 100 },
          })) as InstallationReposPayload;
          return {
            id: inst.id,
            account: inst.account?.login ?? null,
            account_type: inst.account?.type ?? null,
            repository_selection: inst.repository_selection,
            permissions: inst.permissions ?? {},
            repository_count: repos.total_count,
            repositories: repos.repositories.map((r) => ({
              full_name: r.full_name,
              private: r.private,
            })),
            manage_url: `https://github.com/settings/installations/${inst.id}`,
          };
        }),
      );
      return {
        app: { name: 'GitHub App', slug },
        installations: enriched,
        install_url: installUrl,
      };
    },
  });
}

/** Deprecated alias */
export function registerGetUserTool(app: AgentApp) {
  app.tool('get-user', {
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    description: 'Deprecated alias for get-installation-context.',
    parameters: { type: 'object', properties: {} },
    handler: async (_args, ctx) => {
      const sys = await ctx.secrets.getSystem();
      const slug = sys?.GITHUB_APP_SLUG ?? 'agentapps';
      const installUrl = `https://github.com/apps/${slug}/installations/new`;
      const installationsPayload = (await githubRequest(ctx, '/user/installations', {
        params: { per_page: 100 },
      })) as UserInstallationsPayload;
      const installations = installationsPayload.installations ?? [];
      if (installations.length === 0)
        return { app: { name: 'GitHub App', slug }, installations: [], install_url: installUrl };
      const enriched = await Promise.all(
        installations.map(async (inst) => {
          const repos = (await githubRequest(ctx, `/user/installations/${inst.id}/repositories`, {
            params: { per_page: 100 },
          })) as InstallationReposPayload;
          return {
            id: inst.id,
            account: inst.account?.login ?? null,
            account_type: inst.account?.type ?? null,
            repository_selection: inst.repository_selection,
            permissions: inst.permissions ?? {},
            repository_count: repos.total_count,
            repositories: repos.repositories.map((r) => ({
              full_name: r.full_name,
              private: r.private,
            })),
            manage_url: `https://github.com/settings/installations/${inst.id}`,
          };
        }),
      );
      return {
        app: { name: 'GitHub App', slug },
        installations: enriched,
        install_url: installUrl,
      };
    },
  });
}
