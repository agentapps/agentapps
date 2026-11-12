/**
 * Playwright Agent App — browser automation and web scraping via Playwright.
 *
 * Migrated from the legacy MCA runtime.
 */

import { createApp } from '@agentapps/sdk';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.playwright',
  version: '1.0.0',
  name: 'Playwright',
  description:
    'Browser automation and web scraping via Playwright. Navigate, interact, take screenshots, and extract data from web pages.',
  author: { name: 'Pablo Lopez Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'development',
  keywords: ['browser', 'playwright', 'automation', 'web', 'scraping', 'screenshot'],
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
  capabilities: { tools: true, health: true },
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
