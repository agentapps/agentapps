/**
 * Canva Agent App — entry point.
 *
 * 31 tools: users, designs, exports, resizes, imports, folders, assets,
 * brand templates, autofill, and comments via the Canva Connect API.
 */
import { createApp } from '@agentapps/sdk';
import { classifyCanvaApiError, loadCanvaSecrets } from './lib/index.js';
import { registerTools } from './tools/index.js';

const CANVA_API_BASE = 'https://api.canva.com/rest/v1';

const app = createApp({
  id: 'app.canva',
  version: '2.0.0',
  name: 'Canva',
  description:
    'Canva design management — designs, exports, resizes, folders, assets, brand templates, autofill, and comments via the Canva Connect API.',
  author: { name: 'Pablo Lopez Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'design',
  keywords: ['canva', 'design', 'graphics', 'templates', 'export', 'resize', 'comments'],
  runtime: { transport: 'stdio', command: 'node', args: ['dist/app.js'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'oauth2',
    provider: 'canva',
    authorizeUrl: 'https://www.canva.com/api/oauth/authorize',
    tokenUrl: 'https://api.canva.com/rest/v1/oauth/token',
    scopes: [
      'design:content:read',
      'design:content:write',
      'design:meta:read',
      'design:permission:read',
      'design:permission:write',
      'folder:read',
      'folder:write',
      'folder:permission:read',
      'folder:permission:write',
      'asset:read',
      'asset:write',
      'brandtemplate:meta:read',
      'brandtemplate:content:read',
      'comment:read',
      'comment:write',
      'profile:read',
    ],
    pkce: true,
    systemSecrets: ['CLIENT_ID', 'CLIENT_SECRET'],
    installationSecrets: ['ACCESS_TOKEN', 'REFRESH_TOKEN'],
  },
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.health(async (ctx) => {
  try {
    const secrets = await loadCanvaSecrets(ctx);

    if (!secrets.CLIENT_ID || !secrets.CLIENT_SECRET) {
      return {
        status: 'not_ready' as const,
        message: 'Canva OAuth not configured by admin',
        issues: [
          {
            code: 'SYSTEM_NOT_CONFIGURED',
            message: 'Configure CLIENT_ID and CLIENT_SECRET in system secrets.',
            severity: 'error' as const,
          },
        ],
      };
    }

    if (!secrets.ACCESS_TOKEN || !secrets.REFRESH_TOKEN) {
      return {
        status: 'not_ready' as const,
        message: 'Canva account not connected',
        issues: [
          {
            code: 'USER_NOT_AUTHENTICATED',
            message: 'Connect your Canva account in app settings.',
            severity: 'warning' as const,
          },
        ],
      };
    }

    // Quick connectivity probe
    try {
      const response = await fetch(`${CANVA_API_BASE}/users/me`, {
        headers: { Authorization: `Bearer ${secrets.ACCESS_TOKEN}` },
      });
      if (response.status === 401 || response.status === 403) {
        return {
          status: 'not_ready' as const,
          message: 'Canva access token expired or revoked',
          issues: [
            {
              code: 'AUTH_EXPIRED',
              message: 'Reconnect your Canva account to refresh credentials.',
              severity: 'warning' as const,
            },
          ],
        };
      }
      if (!response.ok) {
        return {
          status: 'degraded' as const,
          message: `Canva API error: ${response.status}`,
          issues: [
            {
              code: 'DEPENDENCY_UNAVAILABLE',
              message: 'Canva API temporarily unavailable.',
              severity: 'warning' as const,
            },
          ],
        };
      }
    } catch (error: any) {
      return {
        status: 'degraded' as const,
        message: `Failed to reach Canva: ${error.message}`,
        issues: [
          {
            code: 'DEPENDENCY_UNAVAILABLE',
            message: 'Network error connecting to Canva API.',
            severity: 'warning' as const,
          },
        ],
      };
    }

    return { status: 'ready' as const, message: 'Canva connected' };
  } catch (error) {
    const classified = classifyCanvaApiError(500, String(error), 'Health check failed');
    return {
      status: 'not_ready' as const,
      message: classified.message,
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
export default factory;
