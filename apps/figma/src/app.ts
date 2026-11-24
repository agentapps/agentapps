/**
 * Figma Agent App — entry point.
 *
 * 13 tools: inspect files, extract design tokens, export images, manage comments.
 */
import { createApp } from '@agentapps/sdk';
import { classifyFigmaError, FIGMA_API_BASE, loadFigmaSecrets } from './lib/index.js';
import { registerTools } from './tools/index.js';

// Exported (not only wrapped in `factory`) so the tests can compare `app.toManifest()` with
// agentapp.json: both describe the same app and must not drift apart.
export const app = createApp({
  id: 'app.figma',
  version: '2.0.3',
  name: 'Figma',
  description:
    'Access Figma design files, extract styles, components, design tokens, and export assets. Works directly with files via file key. Perfect for design-to-code workflows.',
  tagline: 'Inspect Figma files, extract design tokens, and export assets',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  logo: 'assets/logo.svg',
  logoMono: 'assets/logo-mono.svg',
  terms: 'https://agentapps.tech/terms',
  category: 'design',
  keywords: ['figma', 'design', 'ui', 'ux', 'styles', 'components', 'tokens', 'css', 'tailwind'],
  entrypoint: { type: 'module', path: 'src/app.ts', export: 'factory' },
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'oauth2',
    provider: 'figma',
    authorizeUrl: 'https://www.figma.com/oauth',
    tokenUrl: 'https://api.figma.com/v1/oauth/token',
    scopes: [
      'current_user:read',
      'file_content:read',
      'file_metadata:read',
      'file_comments:read',
      'file_comments:write',
      'file_versions:read',
      'library_assets:read',
      'library_content:read',
      'team_library_content:read',
      'file_dev_resources:read',
      'file_dev_resources:write',
      'file_variables:read',
      'webhooks:read',
      'webhooks:write',
    ],
    pkce: false,
    systemSecrets: ['CLIENT_ID', 'CLIENT_SECRET'],
    installationSecrets: ['ACCESS_TOKEN', 'REFRESH_TOKEN', 'EXPIRY_DATE'],
  },
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.health(async (ctx) => {
  try {
    const secrets = await loadFigmaSecrets(ctx);

    if (!secrets.CLIENT_ID || !secrets.CLIENT_SECRET) {
      return {
        status: 'not_ready' as const,
        message: 'Figma OAuth not configured by admin',
        issues: [
          {
            code: 'SYSTEM_NOT_CONFIGURED',
            message: 'Configure CLIENT_ID and CLIENT_SECRET in system secrets.',
            severity: 'error' as const,
          },
        ],
      };
    }

    if (!secrets.ACCESS_TOKEN) {
      return {
        status: 'not_ready' as const,
        message: 'Figma account not connected',
        issues: [
          {
            code: 'USER_NOT_AUTHENTICATED',
            message: 'Connect your Figma account in app settings.',
            severity: 'warning' as const,
          },
        ],
      };
    }

    // Quick connectivity probe
    try {
      const response = await fetch(`${FIGMA_API_BASE}/me`, {
        headers: { Authorization: `Bearer ${secrets.ACCESS_TOKEN}` },
      });
      if (response.status === 401 || response.status === 403) {
        return {
          status: 'not_ready' as const,
          message: 'Figma access token expired or revoked',
          issues: [
            {
              code: 'AUTH_EXPIRED',
              message: 'Reconnect your Figma account to refresh credentials.',
              severity: 'warning' as const,
            },
          ],
        };
      }
      if (!response.ok) {
        return {
          status: 'degraded' as const,
          message: `Figma API error: ${response.status}`,
          issues: [
            {
              code: 'DEPENDENCY_UNAVAILABLE',
              message: 'Figma API temporarily unavailable.',
              severity: 'warning' as const,
            },
          ],
        };
      }
    } catch (error: any) {
      return {
        status: 'degraded' as const,
        message: `Failed to reach Figma: ${error.message}`,
        issues: [
          {
            code: 'DEPENDENCY_UNAVAILABLE',
            message: 'Network error connecting to Figma API.',
            severity: 'warning' as const,
          },
        ],
      };
    }

    return { status: 'ready' as const, message: 'Figma connected' };
  } catch (error) {
    const classified = classifyFigmaError(500, String(error), 'GET', '/health');
    return {
      status: 'not_ready' as const,
      message: classified.upstreamMessage,
      issues: [
        {
          code: classified.code,
          message: classified.upstreamMessage,
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
