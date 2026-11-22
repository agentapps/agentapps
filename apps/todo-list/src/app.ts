/**
 * Todo List Agent App — main app entry point.
 *
 * Workflowy-style hierarchical outliner — single-tree architecture.
 * No lists. Every node is part of one tree. Root nodes have parentId: null.
 * Nodes have: text, description, instructions (markdown), log (chronological history).
 * Storage via host requests (ctx.storage, document store) — no direct database connection.
 *
 * Tools (10):
 * - add-node: Add a node (root or nested)
 * - get-node: Get full detail of a single node (instructions + log)
 * - get-tree: Get the full nested tree (lightweight, no instructions/log)
 * - update-node: Update text, description, and/or instructions
 * - toggle-complete: Toggle completion (cascades to descendants + logs)
 * - toggle-collapse: Toggle collapse/expand
 * - move-node: Move node to different parent/position (with circular detection)
 * - delete-node: Delete a node and its entire subtree
 * - search-nodes: Search nodes by text with breadcrumb paths
 * - add-log-entry: Add a chronological log entry to a node
 *
 * Events (5):
 * - node.added, node.updated, node.completed, node.moved, node.deleted
 *
 * Lifecycle:
 * - onInstall: Creates default root node "My Tasks"
 * - onSessionOpen: Verifies root node exists
 * - onUninstall: No-op (data persists for reinstallation)
 *
 * Migrated from the legacy MCA runtime to @agentapps/sdk.
 */

import { createApp } from '@agentapps/sdk';
import { TODO_EVENTS } from './lib/events.js';
import { onInstall, onSessionOpen, onUninstall } from './lifecycle.js';
import { detailRenderer, nodeCardRenderer, treeRenderer } from './renderers/index.js';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.todo-list',
  version: '1.0.1',
  name: 'Todo List',
  description:
    'Workflowy-style hierarchical outliner. Single-tree architecture — no lists, every node is part of one tree. Nodes have text, description, instructions (markdown), and a chronological log. Toggle complete (cascades to descendants), collapse/expand, move subtrees, and search.',
  tagline: 'Hierarchical outliner with markdown, logs, and tree operations',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'productivity',
  keywords: [
    'todo',
    'list',
    'outliner',
    'workflowy',
    'hierarchy',
    'bullets',
    'tasks',
    'checklist',
    'tree',
    'log',
  ],
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
  capabilities: { tools: true, events: true, health: true },
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.health(async (ctx) => {
  ctx.log('debug', 'Running health check');
  try {
    // Verify storage is accessible by doing a simple read
    await ctx.storage.kv.get('todo:health-check');
    return { status: 'ready', message: 'Todo List ready — storage accessible' };
  } catch (error) {
    return {
      status: 'degraded',
      message: `Storage unavailable: ${(error as Error).message}`,
    };
  }
});

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

for (const evt of TODO_EVENTS) {
  app.event(evt.name, { description: evt.description });
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

registerTools(app);

// ---------------------------------------------------------------------------
// Renderers — present tool results as UI Components (with a markdown variant)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Screens — full-page bundles (static/*.html); the React sources live in web/
// ---------------------------------------------------------------------------

// Main tree view — the launcher: where the user lands when opening the app
app.screen('tree-view', {
  title: 'My Tasks',
  description: 'Full hierarchical tree of todo nodes — collapsible/expandable.',
  icon: 'list-tree',
  bundleUrl: './static/tree.html',
  launcher: true,
});

// Node detail — reachable via in-app navigation only (not a launcher)
app.screen('node-detail', {
  title: 'Node Detail',
  description: 'Single node with instructions (markdown) and chronological log.',
  icon: 'file-text',
  bundleUrl: './static/detail.html',
  propsSchema: {
    type: 'object',
    properties: {
      nodeId: {
        type: 'string',
        description: 'The node ID to display.',
      },
    },
    required: ['nodeId'],
  },
  launcher: false,
});

// Node form — add/edit form, reachable via in-app navigation only (not a launcher)
app.screen('node-form', {
  title: 'Add / Edit Node',
  description: 'Form for creating or editing a todo node (text, description, instructions).',
  icon: 'edit',
  bundleUrl: './static/form.html',
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

// ---------------------------------------------------------------------------
// Lifecycle hooks
// ---------------------------------------------------------------------------

app.onInstall(onInstall);
app.onUninstall(onUninstall);
app.onSessionOpen(onSessionOpen);

// ---------------------------------------------------------------------------
// Export factory
// ---------------------------------------------------------------------------

export const factory = app.toFactory();
export default factory;
