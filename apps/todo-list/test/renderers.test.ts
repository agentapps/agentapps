/**
 * Todo List Agent App — Renderers tests
 *
 * Verifies each renderer produces the right UI Component and markdown variant
 * from a sample tool result.
 */

import type { RendererOutput, ToolContext } from '@agentapps/sdk';
import { describe, expect, it } from 'vitest';
import type { FormattedNode, NodeDetail } from '../src/lib/types.js';
import { detailRenderer } from '../src/renderers/detail-renderer.js';
import { nodeCardRenderer } from '../src/renderers/node-card-renderer.js';
import { treeRenderer } from '../src/renderers/tree-renderer.js';
import { MemoryStorage } from './helpers/memory-storage.js';

// ---------------------------------------------------------------------------
// Helpers — mock context (renderers don't use ctx, but it's required)
// ---------------------------------------------------------------------------

function createMockCtx(): ToolContext {
  return {
    execution: { userId: 'test-user', installationId: 'test-install' },
    signal: new AbortController().signal,
    secrets: {
      getSystem: async () => null,
      getInstallation: async () => null,
      updateInstallation: async () => {},
    },
    systemSecret: async () => undefined,
    installationSecret: async () => undefined,
    auth: {
      getUrl: async () => ({ url: '', state: '' }),
      getStatus: async () => ({ authenticated: false }),
      refresh: async () => ({ accessToken: '' }),
    },
    platform: { call: async () => null },
    user: { get: async () => null },
    permissions: { effective: () => null, onChange: () => () => {} },
    storage: new MemoryStorage().asDocumentStorage(),
    volumes: {
      put: async () => true,
      get: async () => null,
      delete: async () => true,
      list: async () => [],
    },
    files: {
      put: async () => ({ success: true }),
      get: async () => null,
      delete: async () => true,
      list: async () => [],
      getPublicUrl: async () => null,
    },
    intent: async () => null,
    subscribeInbound: async () => '',
    unsubscribeInbound: async () => {},
    log: () => {},
    progress: () => {},
    stream: () => {},
    emit: () => {},
    hasSubscribers: () => false,
    activeSubscriptions: () => [],
    requestAuth: async () => ({ accessToken: '' }),
    requestSecret: async () => ({ value: '' }),
    openUrl: async () => {},
  } as unknown as ToolContext;
}

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const sampleTree: FormattedNode[] = [
  {
    nodeId: 'node_1',
    parentId: null,
    text: 'Comprar pan',
    description: 'Pan para la semana',
    completed: true,
    collapsed: false,
    position: 0,
    childCount: 2,
    completedChildren: 1,
    children: [
      {
        nodeId: 'node_2',
        parentId: 'node_1',
        text: 'Pan integral',
        description: '',
        completed: true,
        collapsed: false,
        position: 0,
        childCount: 0,
        completedChildren: 0,
      },
      {
        nodeId: 'node_3',
        parentId: 'node_1',
        text: 'Pan de centeno',
        description: '',
        completed: false,
        collapsed: false,
        position: 1,
        childCount: 0,
        completedChildren: 0,
      },
    ],
  },
  {
    nodeId: 'node_4',
    parentId: null,
    text: 'Comprar leche',
    description: '',
    completed: false,
    collapsed: false,
    position: 1,
    childCount: 0,
    completedChildren: 0,
  },
];

const sampleNodeDetail: NodeDetail = {
  nodeId: 'node_1',
  parentId: null,
  text: 'Comprar pan',
  description: 'Pan para la semana',
  instructions: 'Comprar en la panadería de la esquina',
  completed: true,
  collapsed: false,
  position: 0,
  log: [{ timestamp: Date.UTC(2026, 7, 29, 3, 0), text: 'Completed' }],
  createdAt: Date.UTC(2026, 7, 29, 2, 0),
  updatedAt: Date.UTC(2026, 7, 29, 3, 0),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Renderers', () => {
  const ctx = createMockCtx();

  // -------------------------------------------------------------------------
  // treeRenderer
  // -------------------------------------------------------------------------

  describe('treeRenderer', () => {
    it('returns a tree component with the nodes and a markdown variant', async () => {
      const out: RendererOutput = await treeRenderer({ tree: sampleTree }, ctx);
      expect(out.components).toHaveLength(1);
      const tree = out.components![0];
      expect(tree.type).toBe('tree');
      if (tree.type === 'tree') {
        expect(tree.title).toBe('My Tasks');
        expect(tree.nodes).toHaveLength(2);
        expect(tree.nodes[0]).toMatchObject({
          id: 'node_1',
          label: 'Comprar pan',
          completed: true,
          badge: '1/2 done',
        });
        expect(tree.nodes[0].children).toHaveLength(2);
        expect(tree.nodes[0].children![1]).toMatchObject({ id: 'node_3', completed: false });
      }
      expect(out.variants?.markdown).toBeDefined();
    });

    it('renders folder icon for parent nodes and circle for leaves', async () => {
      const out = await treeRenderer({ tree: sampleTree }, ctx);
      expect(out.variants!.markdown!).toContain('📁 Comprar pan');
      expect(out.variants!.markdown!).toContain('○ Comprar leche');
    });

    it('ends each line with the node id so it can be reused in other tools', async () => {
      const out = await treeRenderer({ tree: sampleTree }, ctx);
      expect(out.variants!.markdown!.split('\n')[0]).toBe('📁 Comprar pan ✓  `node_1`');
    });

    it('renders ✓ mark for completed nodes', async () => {
      const out = await treeRenderer({ tree: sampleTree }, ctx);
      expect(out.variants!.markdown!).toContain('Comprar pan ✓');
      expect(out.variants!.markdown!).toContain('Pan integral ✓');
    });

    it('does not render ✓ for incomplete nodes', async () => {
      const out = await treeRenderer({ tree: sampleTree }, ctx);
      expect(out.variants!.markdown!).not.toContain('Pan de centeno ✓');
      expect(out.variants!.markdown!).not.toContain('Comprar leche ✓');
    });

    it('renders nested children with indentation', async () => {
      const out = await treeRenderer({ tree: sampleTree }, ctx);
      // First child (not last) uses ├─, second child (last) uses └─
      expect(out.variants!.markdown!).toContain('  ├─ ○ Pan integral ✓');
      expect(out.variants!.markdown!).toContain('  └─ ○ Pan de centeno');
    });

    it('handles empty tree gracefully', async () => {
      const out = await treeRenderer({ tree: [] }, ctx);
      expect(out.variants!.markdown!).toBe('');
    });
  });

  // -------------------------------------------------------------------------
  // detailRenderer
  // -------------------------------------------------------------------------

  describe('detailRenderer', () => {
    it('returns a detail component with overview, instructions and log sections', async () => {
      const out = await detailRenderer({ node: sampleNodeDetail }, ctx);
      expect(out.components).toHaveLength(1);
      const detail = out.components![0];
      expect(detail.type).toBe('detail');
      if (detail.type === 'detail') {
        expect(detail.title).toBe('Comprar pan');
        expect(detail.sections.map((s) => s.title)).toEqual([
          'Overview',
          'Instructions',
          'Log (1 entries)',
        ]);
        expect(detail.sections[1].fields[0].kind).toBe('markdown');
      }
    });

    it('renders title as h2 with status icon', async () => {
      const out = await detailRenderer({ node: sampleNodeDetail }, ctx);
      expect(out.variants!.markdown!).toContain('## ✓ Comprar pan');
    });

    it('renders incomplete nodes with circle icon', async () => {
      const incomplete = { ...sampleNodeDetail, completed: false };
      const out = await detailRenderer({ node: incomplete }, ctx);
      expect(out.variants!.markdown!).toContain('## ○ Comprar pan');
    });

    it('renders description section', async () => {
      const out = await detailRenderer({ node: sampleNodeDetail }, ctx);
      expect(out.variants!.markdown!).toContain('**Description:** Pan para la semana');
    });

    it('renders instructions section', async () => {
      const out = await detailRenderer({ node: sampleNodeDetail }, ctx);
      expect(out.variants!.markdown!).toContain('### Instructions');
      expect(out.variants!.markdown!).toContain('Comprar en la panadería de la esquina');
    });

    it('renders log entries with timestamp', async () => {
      const out = await detailRenderer({ node: sampleNodeDetail }, ctx);
      expect(out.variants!.markdown!).toContain('### Log');
      expect(out.variants!.markdown!).toContain('- 2026-08-29 03:00 — Completed');
    });

    it('omits description section when empty', async () => {
      const noDesc = { ...sampleNodeDetail, description: '' };
      const out = await detailRenderer({ node: noDesc }, ctx);
      expect(out.variants!.markdown!).not.toContain('**Description:**');
    });

    it('omits instructions section when empty', async () => {
      const noInstr = { ...sampleNodeDetail, instructions: '' };
      const out = await detailRenderer({ node: noInstr }, ctx);
      expect(out.variants!.markdown!).not.toContain('### Instructions');
    });

    it('omits log section when empty', async () => {
      const noLog = { ...sampleNodeDetail, log: [] };
      const out = await detailRenderer({ node: noLog }, ctx);
      expect(out.variants!.markdown!).not.toContain('### Log');
    });
  });

  // -------------------------------------------------------------------------
  // nodeCardRenderer
  // -------------------------------------------------------------------------

  describe('nodeCardRenderer', () => {
    it('returns a card component with the node fields', async () => {
      const out = await nodeCardRenderer(
        { node: { nodeId: 'n1', text: 'Task', completed: false, parentId: null } },
        ctx,
      );
      expect(out.components).toHaveLength(1);
      const card = out.components![0];
      expect(card.type).toBe('card');
      if (card.type === 'card') {
        expect(card.title).toBe('○ Task');
        expect(card.fields).toEqual([
          { label: 'Id', value: 'n1' },
          { label: 'Completed', value: false },
          { label: 'Parent', value: '(root)' },
        ]);
      }
    });

    it('renders bold title with status icon', async () => {
      const out = await nodeCardRenderer(
        { node: { nodeId: 'n1', text: 'My Task', completed: false } },
        ctx,
      );
      expect(out.variants!.markdown!).toContain('**○ My Task**');
    });

    it('renders ✓ for completed nodes', async () => {
      const out = await nodeCardRenderer(
        { node: { nodeId: 'n1', text: 'Done Task', completed: true } },
        ctx,
      );
      expect(out.variants!.markdown!).toContain('**✓ Done Task**');
    });

    it('includes metadata line with nodeId and completed status', async () => {
      const out = await nodeCardRenderer(
        { node: { nodeId: 'node_abc', text: 'Task', completed: true } },
        ctx,
      );
      expect(out.variants!.markdown!).toContain('`node_abc`');
      expect(out.variants!.markdown!).toContain('completed: yes');
    });

    it('shows parent as (root) when parentId is null', async () => {
      const out = await nodeCardRenderer(
        { node: { nodeId: 'n1', text: 'Task', completed: false, parentId: null } },
        ctx,
      );
      expect(out.variants!.markdown!).toContain('parent: (root)');
    });

    it('shows parent id when parentId is set', async () => {
      const out = await nodeCardRenderer(
        { node: { nodeId: 'n1', text: 'Task', completed: false, parentId: 'parent_123' } },
        ctx,
      );
      expect(out.variants!.markdown!).toContain('parent: `parent_123`');
    });

    it('includes position when present', async () => {
      const out = await nodeCardRenderer(
        { node: { nodeId: 'n1', text: 'Task', completed: false, position: 2 } },
        ctx,
      );
      expect(out.variants!.markdown!).toContain('position: 2');
    });

    it('includes parentText from add-node result', async () => {
      const out = await nodeCardRenderer(
        { node: { nodeId: 'n1', text: 'Child', completed: false }, parentText: 'Parent Task' },
        ctx,
      );
      expect(out.variants!.markdown!).toContain('under: Parent Task');
    });

    it('renders description in italics when present', async () => {
      const out = await nodeCardRenderer(
        { node: { nodeId: 'n1', text: 'Task', completed: false, description: 'A description' } },
        ctx,
      );
      expect(out.variants!.markdown!).toContain('*A description*');
    });

    it('omits description when not present', async () => {
      const out = await nodeCardRenderer(
        { node: { nodeId: 'n1', text: 'Task', completed: false } },
        ctx,
      );
      // Should not contain italic description — check the content doesn't have
      // a standalone italic line (the ** bold markers in the title are not italic)
      const lines = out.variants!.markdown!.split('\n');
      const hasItalicDesc = lines.some((l) => /^\*[^*]+\*$/.test(l.trim()));
      expect(hasItalicDesc).toBe(false);
    });

    it('handles add-node result shape (full node + parentText)', async () => {
      const out = await nodeCardRenderer(
        {
          node: {
            nodeId: 'n1',
            parentId: 'p1',
            text: 'New Task',
            description: 'New desc',
            instructions: 'Do stuff',
            completed: false,
            collapsed: false,
            position: 0,
            createdAt: 1000,
            updatedAt: 1000,
          },
          parentText: 'Parent',
        },
        ctx,
      );
      expect(out.variants!.markdown!).toContain('**○ New Task**');
      expect(out.variants!.markdown!).toContain('`n1`');
      expect(out.variants!.markdown!).toContain('parent: `p1`');
      expect(out.variants!.markdown!).toContain('under: Parent');
      expect(out.variants!.markdown!).toContain('*New desc*');
    });

    it('handles update-node result shape (no parentId/position)', async () => {
      const out = await nodeCardRenderer(
        {
          node: {
            nodeId: 'n1',
            text: 'Updated Task',
            description: 'Updated desc',
            instructions: 'New instructions',
            updatedAt: 2000,
          },
        },
        ctx,
      );
      expect(out.variants!.markdown!).toContain('**○ Updated Task**');
      expect(out.variants!.markdown!).toContain('`n1`');
      expect(out.variants!.markdown!).not.toContain('parent:');
      expect(out.variants!.markdown!).not.toContain('position:');
    });

    it('handles toggle-complete result shape (completed + text)', async () => {
      const out = await nodeCardRenderer(
        {
          node: {
            nodeId: 'n1',
            text: 'Completed Task',
            description: 'A task',
            completed: true,
            updatedAt: 3000,
          },
        },
        ctx,
      );
      expect(out.variants!.markdown!).toContain('**✓ Completed Task**');
      expect(out.variants!.markdown!).toContain('completed: yes');
    });

    it('handles move-node result shape (parentId + position)', async () => {
      const out = await nodeCardRenderer(
        {
          node: {
            nodeId: 'n1',
            text: 'Moved Task',
            description: 'A task',
            completed: false,
            parentId: 'new_parent',
            position: 1,
            updatedAt: 4000,
          },
        },
        ctx,
      );
      expect(out.variants!.markdown!).toContain('parent: `new_parent`');
      expect(out.variants!.markdown!).toContain('position: 1');
    });
  });
});
