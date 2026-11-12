/**
 * Context7 Agent App — up-to-date library documentation with real code examples.
 *
 * Migrated from mca.context7 (the legacy MCA).
 *
 * This app demonstrates:
 * - API-key authentication via installation secrets
 * - Health check with Context7 connectivity validation
 * - Two read-only tools: resolve-library and get-docs
 */

import { createApp } from '@agentapps/sdk';
import { fetchContext7Raw } from './lib/client.js';
import { Context7AuthError, Context7RateLimitError } from './lib/errors.js';
import { registerTools } from './tools/index.js';

// ---------------------------------------------------------------------------
// Create the app
// ---------------------------------------------------------------------------

const app = createApp({
  id: 'app.context7',
  version: '2.0.0',
  name: 'Context7',
  description:
    'Up-to-date library and framework documentation via Context7 (Upstash). Resolves library identifiers and fetches structured doc snippets with code examples.',
  author: { name: 'Pablo Lopez Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'development',
  keywords: ['docs', 'documentation', 'context7', 'upstash', 'library', 'research', 'snippets'],
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'api-key',
    // CONTEXT7_API_KEY is optional — the app works in anonymous mode without it.
    // Not listed in installationSecrets so the SDK won't reject tool calls when absent.
  },
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.health(async (ctx) => {
  ctx.log('debug', 'Running health check');

  let installationSecrets: Record<string, string> | null = null;
  try {
    installationSecrets = (await ctx.secrets.getInstallation()) ?? null;
  } catch {
    installationSecrets = null;
  }

  const apiKey = installationSecrets?.CONTEXT7_API_KEY ?? installationSecrets?.context7_api_key;

  const issues: Array<{ code: string; message: string; severity: 'error' | 'warning' | 'info' }> =
    [];

  try {
    await fetchContext7Raw('/v2/libs/search', {
      apiKey,
      searchParams: { libraryName: 'react', query: 'ping' },
      timeoutMs: 5000,
    });
  } catch (err) {
    if (err instanceof Context7AuthError) {
      issues.push({
        code: 'AUTH_INVALID',
        message:
          'Context7 API key is invalid or expired. Replace CONTEXT7_API_KEY in installation secrets with a valid key from context7.com/dashboard.',
        severity: 'error',
      });
    } else if (err instanceof Context7RateLimitError) {
      issues.push({
        code: 'RATE_LIMITED',
        message:
          'Anonymous Context7 quota exhausted. Add CONTEXT7_API_KEY in installation secrets to use your own quota.',
        severity: 'error',
      });
    } else {
      issues.push({
        code: 'DEPENDENCY_UNAVAILABLE',
        message: err instanceof Error ? err.message : 'Context7 unreachable',
        severity: 'error',
      });
    }
  }

  if (!apiKey) {
    issues.push({
      code: 'AUTH_REQUIRED',
      message:
        'No CONTEXT7_API_KEY configured — using anonymous shared pool (heavily rate-limited). Add CONTEXT7_API_KEY in installation secrets for higher quota.',
      severity: 'warning',
    });
  }

  if (issues.some((i) => i.severity === 'error')) {
    return { status: 'not_ready', message: issues[0].message, issues };
  }

  return {
    status: 'ready',
    message: apiKey ? 'Context7 ready (authenticated)' : 'Context7 ready (anonymous)',
    issues: issues.length > 0 ? issues : undefined,
  };
});

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

registerTools(app);

// ---------------------------------------------------------------------------
// Export factory
// ---------------------------------------------------------------------------

export const factory = app.toFactory();
export default factory;
