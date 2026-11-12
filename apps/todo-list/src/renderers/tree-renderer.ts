/**
 * Todo List Agent App — Renderer: Tree View
 *
 * Bound to `get-tree`. Presents the FormattedNode[] tree as a standard `tree`
 * UI Component, plus a markdown variant for hosts that cannot draw components:
 *
 * ```markdown
 * 📁 Comprar pan ✓  `tn_a1`
 *   └─ Pan integral ✓  `tn_b2`
 *   └─ Pan de centeno  `tn_c3`
 * ○ Comprar leche  `tn_d4`
 * ```
 */

import type { RendererOutput, ToolContext, UITreeNode } from '@agentapps/sdk';
import type { FormattedNode } from '../lib/types.js';

/** Result shape returned by the get-tree tool. */
interface GetTreeResult {
  tree: FormattedNode[];
}

/** Convert a store node into a `tree` component node. */
export function toTreeNode(node: FormattedNode): UITreeNode {
  const children = node.children?.map(toTreeNode);
  return {
    id: node.nodeId,
    label: node.text,
    icon: node.completed ? 'check-circle' : node.childCount > 0 ? 'folder' : 'circle',
    badge:
      node.childCount > 0
        ? `${node.completedChildren}/${node.childCount} done`
        : node.completed
          ? '✓'
          : undefined,
    completed: node.completed,
    collapsed: node.collapsed,
    ...(children ? { children } : {}),
    meta: {
      parentId: node.parentId,
      position: node.position,
      description: node.description,
    },
  };
}

/**
 * Render a single node and its children as a markdown tree line.
 *
 * @param node — the formatted node to render
 * @param depth — nesting level (0 = root)
 * @param isLast — whether this node is the last among its siblings
 */
function renderNode(node: FormattedNode, depth: number, isLast: boolean): string {
  const prefix = depth === 0 ? '' : '  '.repeat(depth) + (isLast ? '└─ ' : '├─ ');
  const icon = node.childCount > 0 ? '📁' : '○';
  const checkMark = node.completed ? ' ✓' : '';
  // The id goes last so it can be copied into get-node, add-node parentId, etc.
  let line = `${prefix}${icon} ${node.text}${checkMark}  \`${node.nodeId}\``;

  if (node.children && node.children.length > 0) {
    const childLines = node.children.map((child, i) =>
      renderNode(child, depth + 1, i === node.children!.length - 1),
    );
    line += `\n${childLines.join('\n')}`;
  }

  return line;
}

/** Tree-view renderer — a `tree` component and a markdown tree of the same data. */
export async function treeRenderer(result: unknown, _ctx: ToolContext): Promise<RendererOutput> {
  const { tree } = result as GetTreeResult;
  const markdown = tree.map((node, i) => renderNode(node, 0, i === tree.length - 1)).join('\n');

  return {
    components: [{ type: 'tree', title: 'My Tasks', nodes: tree.map(toTreeNode) }],
    variants: { markdown },
  };
}
