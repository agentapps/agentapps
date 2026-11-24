/**
 * Playwright Agent App — browser automation and web scraping via Playwright.
 *
 * Migrated from the legacy MCA runtime.
 */

import { createApp } from '@agentapps/sdk';
import { registerTools } from './tools/index.js';

// Exported (not just wrapped in `factory`) so tests can compare `app.toManifest()`
// with `agentapp.json`: the two describe the same app and must change together.
export const app = createApp({
  id: 'app.playwright',
  version: '1.0.2',
  name: 'Playwright',
  description:
    'Browser automation and web scraping via Playwright. Navigate, interact, take screenshots, and extract data from web pages.',
  tagline: 'Automate browsers and scrape web pages with Playwright',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  icon: 'icon.svg',
  logo: 'assets/logo.svg',
  logoMono: 'assets/logo-mono.svg',
  terms: 'https://agentapps.tech/terms',
  category: 'development',
  keywords: ['browser', 'playwright', 'automation', 'web', 'scraping', 'screenshot'],
  entrypoint: { type: 'module', path: 'src/app.ts', export: 'factory' },
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
  capabilities: { tools: true, health: true },
  permissions: { volume: true },
  auth: { type: 'none' },
});

app.health(async (ctx) => {
  ctx.log('debug', 'Running health check');
  // Try to verify Playwright/Chromium availability
  try {
    const { chromium } = await import('playwright');
    const testBrowser = await chromium.launch({ headless: true });
    await testBrowser.close();
    return { status: 'ready', message: 'Playwright ready — Chromium available' };
  } catch (error) {
    return {
      status: 'not_ready',
      message: 'Chromium browser not available',
      issues: [
        {
          code: 'BROWSER_NOT_AVAILABLE',
          message: error instanceof Error ? error.message : 'Failed to launch browser',
          severity: 'error',
        },
      ],
    };
  }
});

registerTools(app);

export const factory = app.toFactory();
export default factory;
