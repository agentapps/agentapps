/**
 * Perplexity AI Agent App — web search and multi-turn chat with citations.
 *
 * Migrated from mca.perplexity (the legacy MCA).
 *
 * This app demonstrates:
 * - API-key authentication via system secrets
 * - Health check with secret validation
 * - Two read-only tools: search (one-shot) and chat (multi-turn)
 * - Structured logging
 */

import { createApp } from '@agentapps/sdk';
import { registerTools } from './tools/index.js';

// ---------------------------------------------------------------------------
// Create the app
// ---------------------------------------------------------------------------

const app = createApp({
  id: 'app.perplexity',
  version: '1.0.0',
  name: 'Perplexity AI',
  description:
    'AI-powered web search and multi-turn chat via the Perplexity API. Provides real-time answers with source citations.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'ai',
  keywords: ['perplexity', 'search', 'ai', 'citations', 'chat'],
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'api-key',
    systemSecrets: ['APIKEY'],
  },
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.health(async (ctx) => {
  ctx.log('debug', 'Running health check');

  const secrets = await ctx.secrets.getSystem();
  if (!secrets?.APIKEY) {
    return {
      status: 'not_ready',
      message: 'Missing Perplexity API key',
      issues: [
        {
          code: 'MISSING_SECRET',
          message:
            'APIKEY system secret is required — get one at https://perplexity.ai/settings/api',
          severity: 'error' as const,
        },
      ],
    };
  }

  return { status: 'ready', message: 'Perplexity AI ready' };
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
