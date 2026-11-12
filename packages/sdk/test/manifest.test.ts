/**
 * Tests for manifest and tools generation in @agentapps/sdk.
 *
 * Validates that `toManifest()` and `toTools()` produce protocol v2.0
 * compatible artifacts, including inference of capabilities and auth.
 */

import { describe, expect, it } from 'vitest';
import { createApp } from '../src/index.js';

const minimalConfig = {
  id: 'app.hello' as const,
  version: '1.0.0' as const,
  name: 'Hello',
  description: 'A minimal example app for testing manifest generation.',
  author: { name: 'Alice Evergreen', email: 'alice@teros.ai' },
  category: 'samples' as const,
  runtime: { transport: 'stdio' as const, command: 'node', args: ['dist/app.js'] },
};

const oauthConfig = {
  id: 'app.google.calendar' as const,
  version: '1.0.0' as const,
  name: 'Google Calendar',
  description: 'Manage Google Calendar events and availability via OAuth2.',
  author: { name: 'Teros Team', email: 'team@teros.ai' },
  category: 'productivity' as const,
  keywords: ['calendar', 'google', 'events'],
  runtime: {
    transport: 'http' as const,
    url: 'http://localhost:3000',
    healthCheck: '/health',
  },
  auth: {
    type: 'oauth2' as const,
    provider: 'google',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    optionalScopes: ['https://www.googleapis.com/auth/calendar.events'],
    systemSecrets: ['CLIENT_ID', 'CLIENT_SECRET'],
    installationSecrets: ['ACCESS_TOKEN', 'REFRESH_TOKEN'],
  },
};

const httpConfig = {
  id: 'app.whatsapp' as const,
  version: '1.0.0' as const,
  name: 'WhatsApp Business',
  description: 'Send and receive WhatsApp messages through an HTTP-transport app.',
  author: { name: 'Teros Team', email: 'team@teros.ai' },
  category: 'communication' as const,
  capabilities: { events: true },
  runtime: {
    transport: 'http' as const,
    url: 'http://localhost:3000',
    healthCheck: '/health',
  },
  auth: {
    type: 'api-key' as const,
    systemSecrets: ['WAHA_API_KEY'],
  },
};

describe('toManifest', () => {
  it('generates a valid manifest for a minimal app', () => {
    const app = createApp(minimalConfig).tool('greet', {
      description: 'Greets someone by name',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      },
      handler: async (args) => ({ greeting: `Hello, ${args.name}!` }),
    });

    const manifest = app.toManifest();

    expect(manifest.id).toBe('app.hello');
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.name).toBe('Hello');
    expect(manifest.category).toBe('samples');
    expect(manifest.runtime).toEqual(minimalConfig.runtime);
    expect(manifest.entrypoint).toEqual({
      type: 'module',
      path: './src/index.ts',
      export: 'default',
    });
    expect(manifest.capabilities).toEqual({
      tools: true,
      events: false,
      health: true,
      streaming: false,
    });
    expect(manifest.auth).toBe(false);
    expect(manifest.installation).toEqual({
      singleton: false,
      requiresUserConsent: false,
    });
  });

  it('generates a valid manifest for an OAuth2 app', () => {
    const app = createApp(oauthConfig).tool('list_events', {
      description: 'List upcoming calendar events',
      parameters: {
        type: 'object',
        properties: { maxResults: { type: 'number' } },
      },
      handler: async () => ({ events: [] }),
    });

    const manifest = app.toManifest();

    expect(manifest.id).toBe('app.google.calendar');
    expect(manifest.auth).toEqual({
      type: 'oauth2',
      provider: 'google',
      authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
      optionalScopes: ['https://www.googleapis.com/auth/calendar.events'],
      systemSecrets: ['CLIENT_ID', 'CLIENT_SECRET'],
      installationSecrets: ['ACCESS_TOKEN', 'REFRESH_TOKEN'],
    });
    expect(manifest.runtime).toEqual(oauthConfig.runtime);
    expect(manifest.keywords).toEqual(['calendar', 'google', 'events']);
  });

  it('generates a valid manifest for an HTTP transport app', () => {
    const app = createApp(httpConfig).event('message_received', {
      description: 'Fired when a new WhatsApp message arrives',
    });

    const manifest = app.toManifest();

    expect(manifest.id).toBe('app.whatsapp');
    expect(manifest.capabilities.events).toBe(true);
    expect(manifest.auth).toEqual({
      type: 'api-key',
      systemSecrets: ['WAHA_API_KEY'],
    });
    expect(manifest.runtime).toEqual(httpConfig.runtime);
  });

  it('infers events capability when events are registered', () => {
    const app = createApp(minimalConfig)
      .tool('noop', {
        description: 'No-op',
        parameters: { type: 'object', properties: {} },
        handler: async () => null,
      })
      .event('something', { description: 'Something happened' });

    const manifest = app.toManifest();
    expect(manifest.capabilities.events).toBe(true);
  });

  it('normalizes a plain string entrypoint', () => {
    const app = createApp({
      ...minimalConfig,
      entrypoint: './src/app.ts',
    }).tool('noop', {
      description: 'No-op',
      parameters: { type: 'object', properties: {} },
      handler: async () => null,
    });

    const manifest = app.toManifest();
    expect(manifest.entrypoint).toEqual({
      type: 'module',
      path: './src/app.ts',
      export: 'default',
    });
  });

  it('preserves a structured entrypoint', () => {
    const app = createApp({
      ...minimalConfig,
      entrypoint: { type: 'module' as const, path: 'dist/app.js', export: 'factory' },
    }).tool('noop', {
      description: 'No-op',
      parameters: { type: 'object', properties: {} },
      handler: async () => null,
    });

    const manifest = app.toManifest();
    expect(manifest.entrypoint).toEqual({ type: 'module', path: 'dist/app.js', export: 'factory' });
  });

  it('honors explicit capability overrides', () => {
    const app = createApp({
      ...minimalConfig,
      capabilities: { tools: false, health: false },
      auth: { type: 'api-key', systemSecrets: ['KEY'] },
    }).tool('noop', {
      description: 'No-op',
      parameters: { type: 'object', properties: {} },
      handler: async () => null,
    });

    const manifest = app.toManifest();
    expect(manifest.capabilities.tools).toBe(false);
    expect(manifest.capabilities.health).toBe(false);
  });

  it('rejects an invalid manifest at runtime', () => {
    const app = createApp({
      ...minimalConfig,
      id: 'invalid-id',
    });

    expect(() => app.toManifest()).toThrow();
  });

  it('serializes keys in stable RFC order', () => {
    const app = createApp({
      ...minimalConfig,
      license: 'MIT',
      icon: './icon.png',
      keywords: ['hello', 'world'],
    }).tool('noop', {
      description: 'No-op',
      parameters: { type: 'object', properties: {} },
      handler: async () => null,
    });

    const manifest = app.toManifest();
    const keys = Object.keys(manifest);
    expect(keys).toEqual([
      'id',
      'version',
      'name',
      'description',
      'tagline',
      'author',
      'license',
      'logo',
      'logoMono',
      'icon',
      'terms',
      'category',
      'keywords',
      'entrypoint',
      'runtime',
      'capabilities',
      'auth',
      'installation',
    ]);
  });

  it('serializes auth type none explicitly', () => {
    const app = createApp({
      ...minimalConfig,
      auth: { type: 'none' },
    }).tool('noop', {
      description: 'No-op',
      parameters: { type: 'object', properties: {} },
      handler: async () => null,
    });

    const manifest = app.toManifest();
    expect(manifest.auth).toEqual({ type: 'none' });
  });

  it('allows explicit capabilities to override event inference', () => {
    const app = createApp({
      ...minimalConfig,
      capabilities: { events: false },
    })
      .tool('noop', {
        description: 'No-op',
        parameters: { type: 'object', properties: {} },
        handler: async () => null,
      })
      .event('something', { description: 'Something happened' });

    const manifest = app.toManifest();
    expect(manifest.capabilities.events).toBe(false);
  });

  it('rejects an invalid runtime at manifest generation time', () => {
    const app = createApp({
      ...minimalConfig,
      runtime: { transport: 'http' } as unknown as typeof minimalConfig.runtime,
    }).tool('noop', {
      description: 'No-op',
      parameters: { type: 'object', properties: {} },
      handler: async () => null,
    });

    expect(() => app.toManifest()).toThrow();
  });

  it('passes permissions through to manifest', () => {
    const app = createApp({
      ...minimalConfig,
      permissions: {
        profile: 'basic',
        network: { egress: ['api.example.com'] },
      },
    }).tool('noop', {
      description: 'No-op',
      parameters: { type: 'object', properties: {} },
      handler: async () => null,
    });

    const manifest = app.toManifest();
    expect(manifest.permissions).toEqual({
      profile: 'basic',
      network: { egress: ['api.example.com'] },
    });
  });

  it('passes requires through to manifest', () => {
    const app = createApp({
      ...minimalConfig,
      requires: [
        {
          name: 'messenger',
          tools: ['send_message', 'list_chats'],
          suggest: 'app.whatsapp.messenger',
        },
      ],
    }).tool('noop', {
      description: 'No-op',
      parameters: { type: 'object', properties: {} },
      handler: async () => null,
    });

    const manifest = app.toManifest();
    expect(manifest.requires).toHaveLength(1);
    expect(manifest.requires![0].name).toBe('messenger');
    expect(manifest.requires![0].tools).toEqual(['send_message', 'list_chats']);
    expect(manifest.requires![0].optional).toBe(false);
  });

  it('passes hooks through to manifest', () => {
    const app = createApp({
      ...minimalConfig,
      hooks: ['pre-turn', 'pre-compaction'],
    }).tool('noop', {
      description: 'No-op',
      parameters: { type: 'object', properties: {} },
      handler: async () => null,
    });

    const manifest = app.toManifest();
    expect(manifest.hooks).toEqual(['pre-turn', 'pre-compaction']);
  });

  it('omits permissions/requires/hooks from manifest when not set', () => {
    const app = createApp(minimalConfig).tool('noop', {
      description: 'No-op',
      parameters: { type: 'object', properties: {} },
      handler: async () => null,
    });

    const manifest = app.toManifest();
    expect(manifest.permissions).toBeUndefined();
    expect(manifest.requires).toBeUndefined();
    expect(manifest.hooks).toBeUndefined();
  });

  it('includes permissions/requires/hooks in stable field order', () => {
    const app = createApp({
      ...minimalConfig,
      permissions: { profile: 'basic' },
      requires: [{ name: 'x', tools: ['t'] }],
      hooks: ['pre-turn'],
    }).tool('noop', {
      description: 'No-op',
      parameters: { type: 'object', properties: {} },
      handler: async () => null,
    });

    const manifest = app.toManifest();
    const keys = Object.keys(manifest);
    const capIdx = keys.indexOf('capabilities');
    const grantsIdx = keys.indexOf('permissions');
    const requiresIdx = keys.indexOf('requires');
    const hooksIdx = keys.indexOf('hooks');
    const authIdx = keys.indexOf('auth');

    expect(grantsIdx).toBeGreaterThan(capIdx);
    expect(requiresIdx).toBeGreaterThan(grantsIdx);
    expect(hooksIdx).toBeGreaterThan(requiresIdx);
    expect(authIdx).toBeGreaterThan(hooksIdx);
  });
});

describe('toTools', () => {
  it('serializes registered tools with explicit annotations', () => {
    const app = createApp(minimalConfig)
      .tool('greet', {
        description: 'Greets someone by name',
        parameters: {
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name'],
        },
        annotations: { readOnlyHint: true },
        handler: async (args) => ({ greeting: `Hello, ${args.name}!` }),
      })
      .tool('delete-thing', {
        description: 'Deletes a thing',
        parameters: { type: 'object', properties: { id: { type: 'string' } } },
        annotations: { destructiveHint: true },
        handler: async () => ({ success: true }),
      });

    const tools = app.toTools();

    expect(tools).toHaveLength(2);
    expect(tools[0].name).toBe('delete-thing');
    expect(tools[0].annotations?.destructiveHint).toBe(true);
    expect(tools[1].name).toBe('greet');
    expect(tools[1].annotations).toMatchObject({ readOnlyHint: true });
  });

  it('returns an empty array when no tools are registered', () => {
    const app = createApp(minimalConfig);
    expect(app.toTools()).toEqual([]);
  });
});

// ============================================================================
// UI — renderers, components, screens
// ============================================================================

describe('renderer(), component(), screen() builders', () => {
  it('registers a renderer and includes it in the manifest', () => {
    const app = createApp(minimalConfig);
    app.tool('create_task', {
      description: 'Creates a task',
      parameters: { type: 'object', properties: {}, required: [] },
      handler: async () => ({ id: 't_1' }),
    });
    app.renderer('task-card', {
      boundTools: ['create_task'],
      formats: ['text', 'html'],
    });

    const manifest = app.toManifest();
    expect(manifest.renderers).toHaveLength(1);
    expect(manifest.renderers![0].name).toBe('task-card');
    expect(manifest.renderers![0].boundTools).toEqual(['create_task']);
    expect(manifest.renderers![0].formats).toEqual(['text', 'html']);
  });

  it('registers an app-defined component and includes it in the manifest', () => {
    const app = createApp(minimalConfig);
    app.component('task-list', {
      bundleUrl: 'https://cdn.example.com/task-list.js',
      propsSchema: { type: 'object', properties: { filter: { type: 'string' } } },
    });

    const manifest = app.toManifest();
    expect(manifest.components).toHaveLength(1);
    expect(manifest.components![0].name).toBe('task-list');
    expect(manifest.components![0].bundleUrl).toBe('https://cdn.example.com/task-list.js');
  });

  it('registers a composed screen and includes it in the manifest', () => {
    const app = createApp(minimalConfig);
    app.screen('dashboard', {
      title: 'Dashboard',
      components: [
        { component: 'tree', source: { tool: 'get_tree' } },
        { component: 'task-list', props: { filter: 'open' } },
      ],
    });

    const manifest = app.toManifest();
    expect(manifest.screens).toHaveLength(1);
    expect(manifest.screens![0].name).toBe('dashboard');
    expect(manifest.screens![0].title).toBe('Dashboard');
    expect(manifest.screens![0].components).toEqual([
      { component: 'tree', source: { tool: 'get_tree' } },
      { component: 'task-list', props: { filter: 'open' } },
    ]);
  });

  it('registers a bundle screen with launcher and condition', () => {
    const app = createApp(minimalConfig);
    app.screen('home', {
      title: 'Home',
      bundleUrl: './static/home.html',
      launcher: true,
      condition: 'authenticated',
    });

    const manifest = app.toManifest();
    expect(manifest.screens).toHaveLength(1);
    expect(manifest.screens![0].name).toBe('home');
    expect(manifest.screens![0].bundleUrl).toBe('./static/home.html');
    expect(manifest.screens![0].launcher).toBe(true);
    expect(manifest.screens![0].condition).toBe('authenticated');
  });

  it('defaults launcher to false when omitted', () => {
    const app = createApp(minimalConfig);
    app.screen('settings', {
      title: 'Settings',
      components: [{ component: 'form', source: { tool: 'get_settings' } }],
    });

    const manifest = app.toManifest();
    expect(manifest.screens![0].launcher).toBe(false);
    expect(manifest.screens![0].condition).toBeUndefined();
  });

  it('rejects a screen with neither components nor bundleUrl at manifest time', () => {
    const app = createApp(minimalConfig);
    app.screen('empty', { title: 'Empty' });
    expect(() => app.toManifest()).toThrow();
  });

  it('throws on duplicate renderer names', () => {
    const app = createApp(minimalConfig);
    app.renderer('r1', { boundTools: ['t1'] });
    expect(() => app.renderer('r1', { boundTools: ['t2'] })).toThrow(
      "Renderer 'r1' is already registered",
    );
  });

  it('throws on duplicate component names', () => {
    const app = createApp(minimalConfig);
    app.component('c1', { bundleUrl: 'https://x.com/c1.js' });
    expect(() => app.component('c1', { bundleUrl: 'https://x.com/c1b.js' })).toThrow(
      "Component 'c1' is already registered",
    );
  });

  it('throws on duplicate screen names', () => {
    const app = createApp(minimalConfig);
    app.screen('s1', { title: 'S1', bundleUrl: './s1.html' });
    expect(() => app.screen('s1', { title: 'S1 dup', bundleUrl: './s1.html' })).toThrow(
      "Screen 's1' is already registered",
    );
  });

  it('omits empty UI arrays from manifest', () => {
    const app = createApp(minimalConfig);
    const manifest = app.toManifest();
    expect(manifest.renderers).toBeUndefined();
    expect(manifest.components).toBeUndefined();
    expect(manifest.screens).toBeUndefined();
  });
});
