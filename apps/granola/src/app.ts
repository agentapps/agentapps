/**
 * Granola Agent App — meeting notes, transcripts, and AI summaries.
 *
 * Migrated from the legacy MCA runtime.
 */

import { createApp } from '@agentapps/sdk';
import { registerTools } from './tools/index.js';

// Exported (not only wrapped in `factory`) so the tests can compare `app.toManifest()` with
// agentapp.json: both describe the same app and must not drift apart.
export const app = createApp({
  id: 'app.granola',
  version: '2.0.3',
  name: 'Granola',
  description:
    'Access your Granola meeting notes, transcripts, AI summaries, and folders via the Granola public API.',
  tagline: 'Browse meeting notes, transcripts, and AI summaries from Granola',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  icon: 'icon.svg',
  logo: 'assets/logo.svg',
  logoMono: 'assets/logo-mono.svg',
  terms: 'https://agentapps.tech/terms',
  category: 'productivity',
  keywords: ['granola', 'meeting-notes', 'transcripts', 'ai-summary', 'productivity'],
  entrypoint: { type: 'module', path: 'src/app.ts', export: 'factory' },
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'api-key',
    // The API key is a Personal API Key tied to one Granola user account,
    // so it is strictly a per-user secret.
    installationSecrets: ['API_KEY'],
  },
});

app.health(async (ctx) => {
  ctx.log('debug', 'Running health check');

  const installationSecrets = await ctx.secrets.getInstallation();
  const apiKey = installationSecrets?.API_KEY;
  if (!apiKey) {
    return {
      status: 'not_ready',
      message: 'Missing Granola API key',
      issues: [
        {
          code: 'MISSING_SECRET',
          message:
            'API_KEY user secret is required — get your Personal API Key from Settings > Connectors > API keys in the Granola desktop app.',
          severity: 'error' as const,
        },
      ],
    };
  }

  // Live connectivity check — list notes with page_size=1
  try {
    const { GranolaClient } = await import('./lib/granola-client.js');
    const client = new GranolaClient(apiKey);
    const result = await client.listNotes({ page_size: 1 });

    return {
      status: 'ready',
      message: `Connected. ${result.notes.length} note(s) accessible (hasMore=${result.hasMore}).`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes('401') || message.toLowerCase().includes('authentication failed')) {
      return {
        status: 'not_ready',
        message: 'Granola API key is invalid or expired',
        issues: [
          {
            code: 'AUTH_EXPIRED',
            message:
              'Re-check your Personal API Key from the Granola desktop app and update API_KEY.',
            severity: 'error' as const,
          },
        ],
      };
    }

    return {
      status: 'not_ready',
      message: `Granola API error: ${message}`,
      issues: [
        {
          code: 'DEPENDENCY_UNAVAILABLE',
          message: `Granola API error: ${message}`,
          severity: 'error' as const,
        },
      ],
    };
  }
});

registerTools(app);

export const factory = app.toFactory();
export default factory;
