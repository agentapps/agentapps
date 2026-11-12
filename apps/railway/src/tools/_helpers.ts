/**
 * Shared helpers for Railway tools.
 *
 * Provides the `createClient` factory that reads the RAILWAY_TOKEN from user
 * secrets via `ctx.secrets.getInstallation()` and returns a configured RailwayClient.
 */

import { RailwayClient } from '../lib/railway-client.js';

export interface SecretsContext {
  secrets: {
    getSystem: () => Promise<Record<string, string> | null>;
    getInstallation: () => Promise<Record<string, string> | null>;
  };
}

/**
 * Get Railway token from installation secrets
 */
function getToken(secrets: Record<string, string>): string | null {
  return secrets.RAILWAY_TOKEN || secrets.railwayToken || null;
}

/**
 * Create a Railway client from the new SDK context
 */
export async function createClient(ctx: SecretsContext): Promise<RailwayClient> {
  const secrets = await ctx.secrets.getInstallation();
  const token = secrets ? getToken(secrets) : null;

  if (!token) {
    throw new Error(
      'Railway API token not configured. Please add your RAILWAY_TOKEN in the app settings. Get your token from https://railway.app/account/tokens',
    );
  }

  return new RailwayClient(token);
}

/**
 * Format project for display
 */
export function formatProject(project: any): string {
  const envList = project.environments?.map((e: any) => e.name).join(', ') || 'none';
  const svcList = project.services?.map((s: any) => s.name).join(', ') || 'none';

  return `**${project.name}** (${project.id})
  - Environments: ${envList}
  - Services: ${svcList}
  - Created: ${project.createdAt}`;
}
