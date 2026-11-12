import { describe, expect, it } from 'vitest';
import {
  AppPermissionsSchema,
  ComponentDeclarationSchema,
  isLauncherScreen,
  isScreenDeclaration,
  PERMISSION_RISK_LEVELS,
  parseAppManifest,
  RendererDeclarationSchema,
  RendererOutputSchema,
  ScreenDeclarationSchema,
  safeParseAppManifest,
  UIComponentSchema,
  validateAppManifest,
} from '../src/app-manifest.js';

const minimalValidManifest = {
  id: 'app.hello',
  version: '1.0.0',
  name: 'Hello',
  description: 'A minimal example app for testing.',
  tagline: 'A minimal test app',
  author: { name: 'Alice', email: 'alice@example.com' },
  logo: 'assets/logo.svg',
  logoMono: 'assets/logo-mono.svg',
  terms: 'https://example.com/terms',
  category: 'samples',
  entrypoint: { type: 'module' as const, path: 'dist/app.js' },
  runtime: { transport: 'stdio' as const, command: 'node', args: ['dist/app.js'] },
};

const httpRuntimeManifest = {
  ...minimalValidManifest,
  id: 'app.hello-http',
  runtime: {
    transport: 'http' as const,
    url: 'http://localhost:3000',
    healthCheck: '/health',
  },
};

const websocketRuntimeManifest = {
  ...minimalValidManifest,
  id: 'app.hello-ws',
  runtime: {
    transport: 'websocket' as const,
    url: 'ws://localhost:3000',
    healthCheck: '/health',
  },
};

describe('AppManifestSchema', () => {
  it('validates a minimal stdio manifest', () => {
    const result = safeParseAppManifest(minimalValidManifest);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.id).toBe('app.hello');
    expect(result.data.capabilities.tools).toBe(true);
    expect(result.data.capabilities.events).toBe(false);
    expect(result.data.auth).toBe(false);
    expect(result.data.installation.singleton).toBe(false);
  });

  it('validates a full manifest with capabilities and auth', () => {
    const manifest = {
      ...minimalValidManifest,
      capabilities: {
        tools: true,
        events: true,
        health: true,
        streaming: true,
      },
      auth: {
        type: 'api-key' as const,
        systemSecrets: ['API_KEY'],
      },
      installation: {
        singleton: true,
        requiresUserConsent: true,
        permissions: ['read', 'write'],
      },
    };

    const result = safeParseAppManifest(manifest);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.capabilities.streaming).toBe(true);
    expect(result.data.auth).toEqual({ type: 'api-key', systemSecrets: ['API_KEY'] });
    expect(result.data.installation.singleton).toBe(true);
  });

  it('validates OAuth2 auth', () => {
    const manifest = {
      ...minimalValidManifest,
      auth: {
        type: 'oauth2' as const,
        provider: 'google',
        authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        scopes: ['calendar.readonly'],
        systemSecrets: ['CLIENT_ID', 'CLIENT_SECRET'],
        installationSecrets: ['ACCESS_TOKEN', 'REFRESH_TOKEN'],
      },
    };

    const result = safeParseAppManifest(manifest);
    expect(result.success).toBe(true);
  });

  it('validates an HTTP runtime manifest', () => {
    const result = safeParseAppManifest(httpRuntimeManifest);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.runtime.transport).toBe('http');
    expect(result.data.runtime.url).toBe('http://localhost:3000');
    expect(result.data.runtime.healthCheck).toBe('/health');
  });

  it('rejects stdio runtime without command', () => {
    const result = safeParseAppManifest({
      ...minimalValidManifest,
      runtime: { transport: 'stdio' as const },
    });
    expect(result.success).toBe(false);
  });

  it('rejects http runtime without url', () => {
    const result = safeParseAppManifest({
      ...minimalValidManifest,
      id: 'app.hello-http',
      runtime: { transport: 'http' as const },
    });
    expect(result.success).toBe(false);
  });

  it('rejects http-specific fields in stdio runtime', () => {
    const result = safeParseAppManifest({
      ...minimalValidManifest,
      runtime: {
        transport: 'stdio' as const,
        command: 'node',
        url: 'http://localhost:3000',
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid app id', () => {
    const result = safeParseAppManifest({ ...minimalValidManifest, id: 'hello' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-semver version', () => {
    const result = safeParseAppManifest({ ...minimalValidManifest, version: '1.0' });
    expect(result.success).toBe(false);
  });

  it('rejects a description that is too short', () => {
    const result = safeParseAppManifest({ ...minimalValidManifest, description: 'Hi' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid transport', () => {
    const result = safeParseAppManifest({
      ...minimalValidManifest,
      runtime: { transport: 'grpc' as const },
    });
    expect(result.success).toBe(false);
  });

  it('rejects OAuth2 without scopes', () => {
    const result = safeParseAppManifest({
      ...minimalValidManifest,
      auth: {
        type: 'oauth2' as const,
        provider: 'google',
        authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        scopes: [],
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown top-level fields', () => {
    const result = safeParseAppManifest({
      ...minimalValidManifest,
      vendorExtension: 'should not be allowed',
    });
    expect(result.success).toBe(false);
  });

  it('reports the http runtime refine error on the runtime path', () => {
    const result = safeParseAppManifest({
      ...minimalValidManifest,
      id: 'app.hello-http',
      runtime: { transport: 'http' as const },
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(
      result.error.issues.some((issue) => issue.path.length > 0 && issue.path[0] === 'runtime'),
    ).toBe(true);
  });
});

describe('parseAppManifest', () => {
  it('returns the parsed manifest', () => {
    const manifest = parseAppManifest(minimalValidManifest);
    expect(manifest.id).toBe('app.hello');
  });

  it('throws on invalid manifest', () => {
    expect(() => parseAppManifest({ ...minimalValidManifest, id: 'bad' })).toThrow();
  });
});

describe('AppPermissionsSchema', () => {
  it('validates a full permissions object', () => {
    const result = AppPermissionsSchema.safeParse({
      profile: 'full',
      network: { egress: ['api.github.com', '*.googleapis.com'] },
      volume: true,
      intents: true,
      hooksContext: true,
      hooksVeto: true,
    });
    expect(result.success).toBe(true);
  });

  it('validates minimal permissions with only profile', () => {
    const result = AppPermissionsSchema.safeParse({ profile: 'basic' });
    expect(result.success).toBe(true);
  });

  it('rejects empty network egress array', () => {
    const result = AppPermissionsSchema.safeParse({ network: { egress: [] } });
    expect(result.success).toBe(false);
  });

  it('accepts network egress wildcard', () => {
    const result = AppPermissionsSchema.safeParse({ network: { egress: ['*'] } });
    expect(result.success).toBe(true);
  });

  it('rejects invalid profile level', () => {
    const result = AppPermissionsSchema.safeParse({ profile: 'admin' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown permission fields (strict)', () => {
    const result = AppPermissionsSchema.safeParse({ unknownGrant: true });
    expect(result.success).toBe(false);
  });
});

describe('PERMISSION_RISK_LEVELS', () => {
  it('marks profile as low risk', () => {
    expect(PERMISSION_RISK_LEVELS.profile).toBe('low');
  });

  it('marks hooksTransform as high risk', () => {
    expect(PERMISSION_RISK_LEVELS.hooksTransform).toBe('high');
  });

  it('marks hooksWorkspaceWide as high risk', () => {
    expect(PERMISSION_RISK_LEVELS.hooksWorkspaceWide).toBe('high');
  });

  it('marks volume and intents as high risk', () => {
    expect(PERMISSION_RISK_LEVELS.volume).toBe('high');
    expect(PERMISSION_RISK_LEVELS.intents).toBe('high');
  });

  it('has no entry for what the app offers (UI is a capability, not a permission)', () => {
    expect(PERMISSION_RISK_LEVELS['ui.screens']).toBeUndefined();
    expect(PERMISSION_RISK_LEVELS['ui.renderers']).toBeUndefined();
  });

  it('rejects the retired keys', () => {
    for (const key of ['files', 'volumes', 'uiScreens', 'uiRenderers']) {
      expect(AppPermissionsSchema.safeParse({ [key]: true }).success, key).toBe(false);
    }
  });
});

describe('manifest with permissions', () => {
  it('validates a manifest with permissions', () => {
    const result = safeParseAppManifest({
      ...minimalValidManifest,
      permissions: {
        profile: 'basic',
        network: { egress: ['api.example.com'] },
      },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.permissions?.profile).toBe('basic');
  });

  it('validates a manifest without permissions (optional)', () => {
    const result = safeParseAppManifest(minimalValidManifest);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.permissions).toBeUndefined();
  });
});

describe('manifest with requires (intent dependencies)', () => {
  it('validates a manifest with requires', () => {
    const result = safeParseAppManifest({
      ...minimalValidManifest,
      requires: [
        {
          name: 'messenger',
          tools: ['send_message', 'list_chats'],
          suggest: 'app.whatsapp.messenger',
          optional: false,
        },
      ],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.requires).toHaveLength(1);
    expect(result.data.requires![0].name).toBe('messenger');
    expect(result.data.requires![0].suggest).toBe('app.whatsapp.messenger');
  });

  it('rejects requires with empty tools array', () => {
    const result = safeParseAppManifest({
      ...minimalValidManifest,
      requires: [{ name: 'messenger', tools: [] }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects requires with invalid suggest app id', () => {
    const result = safeParseAppManifest({
      ...minimalValidManifest,
      requires: [{ name: 'messenger', tools: ['send'], suggest: 'not-an-app-id' }],
    });
    expect(result.success).toBe(false);
  });

  it('defaults optional to false', () => {
    const result = safeParseAppManifest({
      ...minimalValidManifest,
      requires: [{ name: 'messenger', tools: ['send'] }],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.requires![0].optional).toBe(false);
  });
});

describe('manifest with hooks', () => {
  it('validates a manifest with hooks', () => {
    const result = safeParseAppManifest({
      ...minimalValidManifest,
      hooks: ['pre-turn', 'post-turn'],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.hooks).toEqual(['pre-turn', 'post-turn']);
  });

  it('rejects invalid hook point', () => {
    const result = safeParseAppManifest({
      ...minimalValidManifest,
      hooks: ['on-login'],
    });
    expect(result.success).toBe(false);
  });

  it('validates all hook points', () => {
    const result = safeParseAppManifest({
      ...minimalValidManifest,
      hooks: [
        'session-start',
        'pre-turn',
        'post-turn',
        'pre-compaction',
        'post-compaction',
        'on-dream',
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe('validateAppManifest', () => {
  it('returns valid result with manifest', () => {
    const result = validateAppManifest(minimalValidManifest);
    expect(result.valid).toBe(true);
    expect(result.manifest).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('returns errors for invalid manifest', () => {
    const result = validateAppManifest({ ...minimalValidManifest, id: 'bad' });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.manifest).toBeUndefined();
  });
});

// ============================================================================
// UI Surfaces — Phase 6
// ============================================================================

describe('UIComponentSchema (6.2)', () => {
  it('validates text component', () => {
    expect(UIComponentSchema.safeParse({ type: 'text', content: 'hello' }).success).toBe(true);
  });

  it('validates text with style', () => {
    expect(
      UIComponentSchema.safeParse({ type: 'text', content: 'Title', style: 'heading' }).success,
    ).toBe(true);
  });

  it('validates table component', () => {
    expect(
      UIComponentSchema.safeParse({
        type: 'table',
        columns: [
          { key: 'name', label: 'Name' },
          { key: 'age', label: 'Age' },
        ],
        rows: [{ name: 'Alice', age: 30 }],
      }).success,
    ).toBe(true);
  });

  it('validates card component', () => {
    expect(
      UIComponentSchema.safeParse({
        type: 'card',
        title: 'Task',
        fields: [{ label: 'Status', value: 'done' }],
      }).success,
    ).toBe(true);
  });

  it('validates chart component', () => {
    expect(
      UIComponentSchema.safeParse({
        type: 'chart',
        chartType: 'bar',
        data: [
          { label: 'Q1', value: 100 },
          { label: 'Q2', value: 200 },
        ],
      }).success,
    ).toBe(true);
  });

  it('validates form component', () => {
    expect(
      UIComponentSchema.safeParse({
        type: 'form',
        fields: [{ name: 'email', label: 'Email', inputType: 'text', required: true }],
      }).success,
    ).toBe(true);
  });

  it('validates image component', () => {
    expect(
      UIComponentSchema.safeParse({ type: 'image', url: 'https://example.com/img.png' }).success,
    ).toBe(true);
  });

  it('validates divider component', () => {
    expect(UIComponentSchema.safeParse({ type: 'divider' }).success).toBe(true);
  });

  it('validates a tree component with nested nodes', () => {
    expect(
      UIComponentSchema.safeParse({
        type: 'tree',
        title: 'My Tasks',
        nodes: [
          { id: '1', label: 'Inbox', badge: 5 },
          {
            id: '2',
            label: 'Projects',
            collapsed: false,
            children: [{ id: '2a', label: 'Agent Apps', completed: true }],
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('validates a detail component with sections', () => {
    expect(
      UIComponentSchema.safeParse({
        type: 'detail',
        title: 'Task #42',
        sections: [
          { title: 'Info', fields: [{ label: 'Status', value: 'open', kind: 'code' }] },
          { fields: [{ label: 'Notes', value: '**bold**', kind: 'markdown' }] },
        ],
      }).success,
    ).toBe(true);
  });

  it('validates a list component', () => {
    expect(
      UIComponentSchema.safeParse({
        type: 'list',
        items: [{ label: 'One' }, { label: 'Two', description: 'second', icon: '2' }],
      }).success,
    ).toBe(true);
  });

  it('validates a form with a submit tool', () => {
    const result = UIComponentSchema.safeParse({
      type: 'form',
      fields: [{ name: 'title', label: 'Title', inputType: 'text', required: true }],
      submit: { tool: 'add_node' },
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === 'form') {
      expect(result.data.submit?.tool).toBe('add_node');
    }
  });

  it('rejects unknown component type', () => {
    expect(UIComponentSchema.safeParse({ type: 'unknown' }).success).toBe(false);
  });
});

describe('RendererOutputSchema (6.1)', () => {
  it('validates components-only output', () => {
    expect(
      RendererOutputSchema.safeParse({
        components: [{ type: 'text', content: 'Hello' }],
      }).success,
    ).toBe(true);
  });

  it('validates variants-only output', () => {
    expect(
      RendererOutputSchema.safeParse({
        variants: { text: 'Hello', html: '<p>Hello</p>' },
      }).success,
    ).toBe(true);
  });

  it('validates combined components + variants', () => {
    expect(
      RendererOutputSchema.safeParse({
        components: [{ type: 'card', title: 'Task', fields: [{ label: 'Done', value: true }] }],
        variants: { markdown: '## Task\n- Done: true' },
      }).success,
    ).toBe(true);
  });

  it('validates empty output (no components, no variants)', () => {
    expect(RendererOutputSchema.safeParse({}).success).toBe(true);
  });
});

describe('RendererDeclarationSchema (6.1/6.4)', () => {
  it('validates basic renderer', () => {
    expect(
      RendererDeclarationSchema.safeParse({
        name: 'task-card',
        boundTools: ['create_task'],
      }).success,
    ).toBe(true);
  });

  it('validates renderer with formats and bundleUrl', () => {
    expect(
      RendererDeclarationSchema.safeParse({
        name: 'chart-view',
        description: 'Renders chart data',
        boundTools: ['get_metrics'],
        formats: ['text', 'html'],
        bundleUrl: 'https://cdn.example.com/chart.js',
      }).success,
    ).toBe(true);
  });

  it('rejects renderer with empty boundTools', () => {
    expect(
      RendererDeclarationSchema.safeParse({
        name: 'bad',
        boundTools: [],
      }).success,
    ).toBe(false);
  });
});

describe('ComponentDeclarationSchema (app-defined UI Component)', () => {
  it('validates a basic component', () => {
    expect(
      ComponentDeclarationSchema.safeParse({
        name: 'task-list',
        bundleUrl: 'https://cdn.example.com/task-list.js',
      }).success,
    ).toBe(true);
  });

  it('validates a component with props schema', () => {
    expect(
      ComponentDeclarationSchema.safeParse({
        name: 'task-list',
        description: 'Lists tasks',
        bundleUrl: 'https://cdn.example.com/task-list.js',
        propsSchema: { type: 'object', properties: { filter: { type: 'string' } } },
      }).success,
    ).toBe(true);
  });

  it('requires a bundle URL', () => {
    expect(ComponentDeclarationSchema.safeParse({ name: 'task-list' }).success).toBe(false);
  });
});

describe('ScreenDeclarationSchema (6.6)', () => {
  it('validates a composed screen whose components are filled by tools', () => {
    const result = ScreenDeclarationSchema.safeParse({
      name: 'dashboard',
      title: 'Dashboard',
      components: [
        { component: 'tree', source: { tool: 'get_tree' } },
        { component: 'chart', source: { tool: 'get_stats', args: { range: '7d' } } },
        { component: 'task-list', props: { filter: 'open' } },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.components).toHaveLength(3);
      expect(result.data.components?.[1].source?.args).toEqual({ range: '7d' });
    }
  });

  it('rejects a screen with both components and bundleUrl', () => {
    expect(
      ScreenDeclarationSchema.safeParse({
        name: 'dashboard',
        title: 'Dashboard',
        components: [{ component: 'tree' }],
        bundleUrl: 'https://cdn.example.com/dashboard.js',
      }).success,
    ).toBe(false);
  });

  it('rejects a screen with neither components nor bundleUrl', () => {
    expect(
      ScreenDeclarationSchema.safeParse({ name: 'dashboard', title: 'Dashboard' }).success,
    ).toBe(false);
  });

  it('validates screen with bundleUrl', () => {
    expect(
      ScreenDeclarationSchema.safeParse({
        name: 'settings',
        title: 'Settings',
        bundleUrl: 'https://cdn.example.com/settings.js',
      }).success,
    ).toBe(true);
  });

  it('validates screen with launcher flag', () => {
    const result = ScreenDeclarationSchema.safeParse({
      name: 'home',
      title: 'Home',
      bundleUrl: 'https://cdn.example.com/home.js',
      launcher: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.launcher).toBe(true);
    }
  });

  it('defaults launcher to false when omitted', () => {
    const result = ScreenDeclarationSchema.safeParse({
      name: 'dashboard',
      title: 'Dashboard',
      components: [{ component: 'tree', source: { tool: 'get_tree' } }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.launcher).toBe(false);
    }
  });

  it('validates screen with condition', () => {
    expect(
      ScreenDeclarationSchema.safeParse({
        name: 'login',
        title: 'Login',
        bundleUrl: 'https://cdn.example.com/login.js',
        condition: '!authenticated',
      }).success,
    ).toBe(true);
  });

  it('validates screen with both launcher and condition', () => {
    const result = ScreenDeclarationSchema.safeParse({
      name: 'dashboard',
      title: 'Dashboard',
      components: [{ component: 'tree', source: { tool: 'get_tree' } }],
      launcher: true,
      condition: 'authenticated',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.launcher).toBe(true);
      expect(result.data.condition).toBe('authenticated');
    }
  });

  it('rejects non-boolean launcher', () => {
    expect(
      ScreenDeclarationSchema.safeParse({
        name: 'bad',
        title: 'Bad',
        bundleUrl: 'https://cdn.example.com/bad.js',
        launcher: 'yes',
      }).success,
    ).toBe(false);
  });
});

describe('Screen type guards', () => {
  it('isScreenDeclaration returns true for valid screen', () => {
    expect(
      isScreenDeclaration({
        name: 'dashboard',
        title: 'Dashboard',
        components: [{ component: 'tree' }],
        launcher: true,
        condition: 'authenticated',
      }),
    ).toBe(true);
  });

  it('isScreenDeclaration returns false for invalid data', () => {
    expect(isScreenDeclaration({ name: 123 })).toBe(false);
    expect(isScreenDeclaration(null)).toBe(false);
    expect(isScreenDeclaration('not a screen')).toBe(false);
  });

  it('isLauncherScreen returns true for launcher screen', () => {
    expect(
      isLauncherScreen({
        name: 'home',
        title: 'Home',
        bundleUrl: 'https://cdn.example.com/home.js',
        launcher: true,
      }),
    ).toBe(true);
  });

  it('isLauncherScreen returns false for non-launcher screen', () => {
    expect(
      isLauncherScreen({
        name: 'dashboard',
        title: 'Dashboard',
        components: [{ component: 'tree' }],
        launcher: false,
      }),
    ).toBe(false);
  });

  it('isLauncherScreen returns false when launcher is omitted (defaults to false)', () => {
    expect(
      isLauncherScreen({
        name: 'settings',
        title: 'Settings',
        bundleUrl: 'https://cdn.example.com/settings.js',
      }),
    ).toBe(false);
  });

  it('isLauncherScreen returns false for invalid data', () => {
    expect(isLauncherScreen({ name: 123 })).toBe(false);
    expect(isLauncherScreen(null)).toBe(false);
  });
});

describe('Manifest with UI surfaces', () => {
  it('accepts manifest with renderers, app-defined components and screens', () => {
    const manifest = {
      ...minimalValidManifest,
      renderers: [{ name: 'task-card', boundTools: ['create_task'] }],
      components: [{ name: 'task-list', bundleUrl: 'https://cdn.example.com/task-list.js' }],
      screens: [
        {
          name: 'dashboard',
          title: 'Dashboard',
          launcher: true,
          components: [
            { component: 'task-list', source: { tool: 'list_tasks' } },
            { component: 'text', props: { content: 'Open tasks' } },
          ],
        },
      ],
    };
    const result = safeParseAppManifest(manifest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.components?.[0].name).toBe('task-list');
      expect(result.data.screens?.[0].components?.[0].source?.tool).toBe('list_tasks');
    }
  });

  it('rejects the retired interfaces field', () => {
    const result = safeParseAppManifest({
      ...minimalValidManifest,
      interfaces: [{ name: 'task-list', bundleUrl: 'https://cdn.example.com/task-list.js' }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts manifest without UI surfaces (backward compatible)', () => {
    const result = safeParseAppManifest(minimalValidManifest);
    expect(result.success).toBe(true);
  });
});
