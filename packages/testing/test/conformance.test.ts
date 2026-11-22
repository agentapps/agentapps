/**
 * Tests for the conformance suite itself.
 */

import { createApp } from '@agentapps/sdk';
import { afterAll, describe, expect, it } from 'vitest';
import { runConformanceTests } from '../src/index.js';

function buildCompliantApp() {
  const app = createApp({ id: 'app.conformance', version: '1.0.0' });
  app.tool('noop', {
    description: 'Does nothing',
    parameters: { type: 'object', properties: {} },
    handler: async () => 'ok',
  });
  app.health(async () => ({ status: 'ready' }));
  return app.toFactory();
}

function buildAppWithoutHealth() {
  const app = createApp({ id: 'app.no-health', version: '1.0.0' });
  app.tool('noop', {
    description: 'Does nothing',
    parameters: { type: 'object', properties: {} },
    handler: async () => 'ok',
  });
  // No health handler registered — SDK will still return default 'ready'.
  return app.toFactory();
}

function buildAppWithoutTools() {
  const app = createApp({ id: 'app.no-tools', version: '1.0.0' });
  app.health(async () => ({ status: 'ready' }));
  return app.toFactory();
}

describe('runConformanceTests — compliant app', () => {
  runConformanceTests(buildCompliantApp());
});

describe('runConformanceTests — app without explicit health (SDK default)', () => {
  runConformanceTests(buildAppWithoutHealth());
});

describe('runConformanceTests — app without tools', () => {
  runConformanceTests(buildAppWithoutTools());
});

describe('runConformanceTests — an app whose tool has effects', () => {
  let ran = 0;
  const app = createApp({ id: 'app.effects', version: '1.0.0' });
  app.tool('send', {
    description: 'Sends something for real',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      ran++;
      return 'sent';
    },
  });
  runConformanceTests(app.toFactory());

  afterAll(() => {
    if (ran > 0) throw new Error(`the conformance suite ran the app's tool ${ran} time(s)`);
  });
  it('[DEVX-AC-3] the suite does not run the tool', () => {
    expect(ran).toBe(0);
  });
});
