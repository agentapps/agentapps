/**
 * Google News Agent App — latest headlines via Google News RSS.
 *
 * No API key required — uses the public Google News RSS feed.
 */

import { createApp } from '@agentapps/sdk';
import { registerTools } from './tools/index.js';

// ---------------------------------------------------------------------------
// Create the app
// ---------------------------------------------------------------------------

const app = createApp({
  id: 'app.google-news',
  version: '1.0.2',
  name: 'Google News',
  description: 'Latest news headlines from Google News RSS. No API key required.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'information',
  keywords: ['news', 'google', 'headlines', 'rss'],
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
  capabilities: { tools: true, health: true },
});

// ---------------------------------------------------------------------------
// Health check — just verify we can reach Google News
// ---------------------------------------------------------------------------

app.health(async (_ctx) => {
  try {
    const res = await fetch('https://news.google.com/rss?hl=en&gl=US&ceid=US:en', {
      method: 'HEAD',
      headers: { 'User-Agent': 'AgentApps/1.0 (RSS Reader)' },
    });
    if (res.ok) return { status: 'ready', message: 'Google News RSS reachable' };
    return { status: 'not_ready', message: `Google News returned ${res.status}` };
  } catch (err) {
    return {
      status: 'not_ready',
      message: 'Cannot reach Google News RSS',
      issues: [{ code: 'NETWORK_ERROR', message: String(err), severity: 'error' as const }],
    };
  }
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
