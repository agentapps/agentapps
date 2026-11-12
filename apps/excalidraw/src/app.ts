/**
 * Excalidraw Agent App — entry point.
 *
 * 24 tools: manage scenes, collections, workspaces, users, invites, and audit logs
 * in Excalidraw Plus.
 */
import { createApp } from '@agentapps/sdk';
import { getExcalidrawClient } from './lib/index.js';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.excalidraw',
  version: '2.0.0',
  name: 'Excalidraw',
  description:
    'Integrate with Excalidraw Plus to manage scenes, collections, workspaces, users, and invites programmatically.',
  author: { name: 'Pablo Lopez Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'design',
  keywords: [
    'excalidraw',
    'whiteboard',
    'diagrams',
    'wireframes',
    'design',
    'collaboration',
    'scenes',
    'drawings',
  ],
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'api-key',
    installationSecrets: ['EXCALIDRAW_API_KEY'],
  },
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.health(async (ctx) => {
  try {
    const installationSecrets = await ctx.secrets.getInstallation();

    if (!installationSecrets?.EXCALIDRAW_API_KEY) {
      return {
        status: 'not_ready' as const,
        message: 'EXCALIDRAW_API_KEY is not configured',
        issues: [
          {
            code: 'AUTH_REQUIRED',
            message:
              'Generate an API key in your Excalidraw Plus workspace settings at app.excalidraw.com. ' +
              'Go to Settings -> API Keys -> Create new key.',
            severity: 'error' as const,
          },
        ],
      };
    }

    // Live connectivity check — fetch workspace info
    try {
      const client = await getExcalidrawClient(ctx);
      const workspace = (await client.getWorkspace()) as Record<string, unknown>;

      return {
        status: 'ready' as const,
        message: `Connected to Excalidraw Plus. Workspace: ${workspace?.name ?? workspace?.id ?? 'unknown'}`,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);

      if (message.includes('401') || message.toLowerCase().includes('authentication failed')) {
        return {
          status: 'not_ready' as const,
          message: 'Excalidraw API key is invalid or expired',
          issues: [
            {
              code: 'AUTH_EXPIRED',
              message: 'Regenerate your API key at app.excalidraw.com -> Settings -> API Keys.',
              severity: 'error' as const,
            },
          ],
        };
      }

      if (message.includes('403')) {
        return {
          status: 'not_ready' as const,
          message: 'Excalidraw API key lacks workspace permissions',
          issues: [
            {
              code: 'AUTH_REQUIRED',
              message:
                'Ensure your API key has "full" permissions or access to the workspace endpoint.',
              severity: 'error' as const,
            },
          ],
        };
      }

      if (message.includes('timed out')) {
        return {
          status: 'degraded' as const,
          message: `Excalidraw API unreachable: ${message}`,
          issues: [
            {
              code: 'DEPENDENCY_UNAVAILABLE',
              message: 'Check your network connectivity and that api.excalidraw.com is reachable.',
              severity: 'warning' as const,
            },
          ],
        };
      }

      return {
        status: 'degraded' as const,
        message: `Excalidraw API error: ${message}`,
        issues: [
          {
            code: 'DEPENDENCY_UNAVAILABLE',
            message: 'Verify your API key is valid and the Excalidraw Plus service is available.',
            severity: 'warning' as const,
          },
        ],
      };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: 'not_ready' as const,
      message,
      issues: [
        {
          code: 'DEPENDENCY_UNAVAILABLE',
          message,
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
export default factory;
