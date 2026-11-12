/**
 * Todo List Agent App — Screen registration tests
 *
 * Verifies that the app registers three screens with the correct launcher flags:
 * - tree-view: launcher=true (main entry point)
 * - node-detail: launcher=false (reachable via in-app navigation only)
 * - node-form: launcher=false, bundleUrl=./static/form.js (add/edit form)
 *
 * All three are full-page bundle screens; no app-defined components are declared.
 */

import { createApp } from '@agentapps/sdk';
import { describe, expect, it } from 'vitest';
import { TODO_EVENTS } from '../src/lib/events.js';
import { onInstall, onSessionOpen, onUninstall } from '../src/lifecycle.js';
import { detailRenderer, nodeCardRenderer, treeRenderer } from '../src/renderers/index.js';
import { registerTools } from '../src/tools/index.js';

// Rebuild the app with the same registrations as src/app.ts so we can
// inspect the internal _screens map via toManifest().
function buildApp() {
  const app = createApp({
    id: 'app.todo-list',
    version: '1.0.0',
    name: 'Todo List',
    description:
      'Workflowy-style hierarchical outliner. Single-tree architecture — no lists, every node is part of one tree.',
    tagline: 'Hierarchical outliner with markdown, logs, and tree operations',
    author: { name: 'Hexagon', email: 'pablo@hexagon.sh' },
    license: 'MIT',
    category: 'productivity',
    keywords: ['todo', 'list', 'outliner', 'workflowy'],
    runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
    capabilities: { tools: true, events: true, health: true },
  });

  app.health(async (ctx) => {
    try {
      await ctx.storage.kv.get('todo:health-check');
      return { status: 'ready', message: 'ok' };
    } catch {
      return { status: 'degraded', message: 'storage unavailable' };
    }
  });

  for (const evt of TODO_EVENTS) {
    app.event(evt.name, { description: evt.description });
  }

  registerTools(app);

  app.renderer('tree-view', {
    boundTools: ['get-tree'],
    formats: ['markdown', 'text'],
    render: treeRenderer,
  });
  app.renderer('node-detail', {
    boundTools: ['get-node'],
    formats: ['markdown'],
    render: detailRenderer,
  });
  app.renderer('node-card', {
    boundTools: ['add-node', 'update-node', 'toggle-complete', 'move-node'],
    formats: ['markdown'],
    render: nodeCardRenderer,
  });

  // Screens — same as src/app.ts
  app.screen('tree-view', {
    title: 'My Tasks',
    description: 'Full hierarchical tree of todo nodes — collapsible/expandable.',
    icon: 'list-tree',
    bundleUrl: './static/tree.html',
    launcher: true,
  });

  app.screen('node-detail', {
    title: 'Node Detail',
    description: 'Single node with instructions (markdown) and chronological log.',
    icon: 'file-text',
    bundleUrl: './static/detail.html',
    launcher: false,
  });

  app.screen('node-form', {
    title: 'Add / Edit Node',
    description: 'Form for creating or editing a todo node (text, description, instructions).',
    icon: 'edit',
    bundleUrl: './static/form.js',
    propsSchema: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: 'Optional: the node to edit. Omit for add mode.',
        },
        parentId: {
          type: 'string',
          description: 'Optional: parent node to nest under. Omit for root-level.',
        },
      },
    },
    launcher: false,
  });

  app.onInstall(onInstall);
  app.onUninstall(onUninstall);
  app.onSessionOpen(onSessionOpen);

  return app;
}

describe('Screen registrations', () => {
  const app = buildApp();
  const manifest = app.toManifest();

  it('manifest contains exactly 3 screens', () => {
    expect(manifest.screens).toBeDefined();
    expect(manifest.screens).toHaveLength(3);
  });

  // -----------------------------------------------------------------------
  // tree-view screen (launcher)
  // -----------------------------------------------------------------------

  describe('tree-view screen', () => {
    it('has correct name and title', () => {
      const screen = manifest.screens!.find((s) => s.name === 'tree-view');
      expect(screen).toBeDefined();
      expect(screen!.title).toBe('My Tasks');
    });

    it('has launcher=true', () => {
      const screen = manifest.screens!.find((s) => s.name === 'tree-view');
      expect(screen!.launcher).toBe(true);
    });

    it('has icon set', () => {
      const screen = manifest.screens!.find((s) => s.name === 'tree-view');
      expect(screen!.icon).toBe('list-tree');
    });

    it('is a full-page bundle screen', () => {
      const screen = manifest.screens!.find((s) => s.name === 'tree-view');
      expect(screen!.bundleUrl).toBe('./static/tree.html');
      expect(screen!.components).toBeUndefined();
    });

    it('has a description', () => {
      const screen = manifest.screens!.find((s) => s.name === 'tree-view');
      expect(screen!.description).toBeDefined();
      expect(screen!.description!.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // node-detail screen (non-launcher)
  // -----------------------------------------------------------------------

  describe('node-detail screen', () => {
    it('has correct name and title', () => {
      const screen = manifest.screens!.find((s) => s.name === 'node-detail');
      expect(screen).toBeDefined();
      expect(screen!.title).toBe('Node Detail');
    });

    it('has launcher=false', () => {
      const screen = manifest.screens!.find((s) => s.name === 'node-detail');
      expect(screen!.launcher).toBe(false);
    });

    it('has icon set', () => {
      const screen = manifest.screens!.find((s) => s.name === 'node-detail');
      expect(screen!.icon).toBe('file-text');
    });

    it('is a full-page bundle screen', () => {
      const screen = manifest.screens!.find((s) => s.name === 'node-detail');
      expect(screen!.bundleUrl).toBe('./static/detail.html');
      expect(screen!.components).toBeUndefined();
    });

    it('has a description', () => {
      const screen = manifest.screens!.find((s) => s.name === 'node-detail');
      expect(screen!.description).toBeDefined();
      expect(screen!.description!.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // node-form screen (non-launcher, bundle-based)
  // -----------------------------------------------------------------------

  describe('node-form screen', () => {
    it('has correct name and title', () => {
      const screen = manifest.screens!.find((s) => s.name === 'node-form');
      expect(screen).toBeDefined();
      expect(screen!.title).toBe('Add / Edit Node');
    });

    it('has launcher=false', () => {
      const screen = manifest.screens!.find((s) => s.name === 'node-form');
      expect(screen!.launcher).toBe(false);
    });

    it('has icon set', () => {
      const screen = manifest.screens!.find((s) => s.name === 'node-form');
      expect(screen!.icon).toBe('edit');
    });

    it('has bundleUrl pointing to ./static/form.js', () => {
      const screen = manifest.screens!.find((s) => s.name === 'node-form');
      expect(screen!.bundleUrl).toBe('./static/form.js');
    });

    it('has propsSchema with nodeId and parentId properties', () => {
      const screen = manifest.screens!.find((s) => s.name === 'node-form');
      expect(screen!.propsSchema).toBeDefined();
      const props = (screen!.propsSchema as Record<string, unknown>).properties as Record<
        string,
        unknown
      >;
      expect(props.nodeId).toBeDefined();
      expect(props.parentId).toBeDefined();
    });

    it('has a description', () => {
      const screen = manifest.screens!.find((s) => s.name === 'node-form');
      expect(screen!.description).toBeDefined();
      expect(screen!.description!.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // Launcher semantics
  // -----------------------------------------------------------------------

  it('exactly one screen has launcher=true', () => {
    const launchers = manifest.screens!.filter((s) => s.launcher === true);
    expect(launchers).toHaveLength(1);
    expect(launchers[0].name).toBe('tree-view');
  });

  it('exactly two screens have launcher=false', () => {
    const nonLaunchers = manifest.screens!.filter((s) => s.launcher === false);
    expect(nonLaunchers).toHaveLength(2);
    const names = nonLaunchers.map((s) => s.name).sort();
    expect(names).toEqual(['node-detail', 'node-form']);
  });

  it('declares no app-defined components', () => {
    expect(manifest.components).toBeUndefined();
  });
});
