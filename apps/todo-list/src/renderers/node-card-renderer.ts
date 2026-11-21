/**
 * Todo List Agent App — Renderer: Node Card
 *
 * Bound to `add-node`, `update-node`, `toggle-complete`, `move-node`.
 * Presents the node state after the operation as a standard `card` UI
 * Component plus a compact markdown variant:
 *
 * Example markdown:
 * ```markdown
 * **● Comprar pan**
 *
 * `node_abc123` | completed: yes | parent: (root) | position: 0
 *
 * *Pan para la semana*
 * ```
 */

import type { RendererOutput, ToolContext, UIComponent } from '@agentapps/sdk';

/**
 * Flexible node shape — different tools return different subsets of fields.
 * This interface covers the union of all possible return fields.
 */
interface NodeCardData {
  nodeId?: string;
  text?: string;
  description?: string;
  instructions?: string;
  completed?: boolean;
  collapsed?: boolean;
  parentId?: string | null;
  position?: number;
  createdAt?: number;
  updatedAt?: number;
}

/** Result shape returned by add-node / update-node / toggle-complete / move-node. */
interface NodeCardResult {
  node: NodeCardData;
  parentText?: string | null;
}

/** Format a timestamp as a short ISO-like string. */
function formatTimestamp(ts: number): string {
  return new Date(ts).toISOString().slice(0, 19).replace('T', ' ');
}

/** Build the `card` component for a mutation result, with whichever fields are present. */
export function toCardComponent(res: NodeCardResult): UIComponent {
  const node = res.node;
  const fields: Array<{ label: string; value: unknown }> = [];
  if (node.nodeId) fields.push({ label: 'Id', value: node.nodeId });
  if (node.completed !== undefined) fields.push({ label: 'Completed', value: node.completed });
  if (node.parentId !== undefined) {
    fields.push({ label: 'Parent', value: node.parentId === null ? '(root)' : node.parentId });
  }
  if (node.position !== undefined) fields.push({ label: 'Position', value: node.position });
  if (res.parentText) fields.push({ label: 'Under', value: res.parentText });
  if (node.description) fields.push({ label: 'Description', value: node.description });
  if (node.updatedAt !== undefined) {
    fields.push({ label: 'Updated', value: formatTimestamp(node.updatedAt) });
  }
  const statusIcon = node.completed ? '●' : '○';
  return { type: 'card', title: `${statusIcon} ${node.text ?? '(untitled)'}`, fields };
}

/**
 * Node-card renderer — a `card` component plus a compact markdown card
 * showing the node's current state after add/update/toggle/move.
 *
 * Adapts to whichever fields are present in the result, since each tool
 * returns a different subset of node properties.
 */
export async function nodeCardRenderer(
  result: unknown,
  _ctx: ToolContext,
): Promise<RendererOutput> {
  const res = result as NodeCardResult;
  const node = res.node;

  const completed = node.completed;
  const statusIcon = completed ? '●' : '○';
  const text = node.text ?? '(untitled)';

  const lines: string[] = [];
  lines.push(`**${statusIcon} ${text}**`);
  lines.push('');

  // Metadata line — include whatever fields are available
  const metaParts: string[] = [];
  if (node.nodeId) {
    metaParts.push(`\`${node.nodeId}\``);
  }
  if (completed !== undefined) {
    metaParts.push(`completed: ${completed ? 'yes' : 'no'}`);
  }
  if (node.parentId !== undefined) {
    metaParts.push(`parent: ${node.parentId === null ? '(root)' : `\`${node.parentId}\``}`);
  }
  if (node.position !== undefined) {
    metaParts.push(`position: ${node.position}`);
  }
  if (res.parentText) {
    metaParts.push(`under: ${res.parentText}`);
  }
  if (node.updatedAt !== undefined) {
    metaParts.push(`updated: ${formatTimestamp(node.updatedAt)}`);
  }

  if (metaParts.length > 0) {
    lines.push(metaParts.join(' | '));
  }

  // Description (italic)
  if (node.description) {
    lines.push('');
    lines.push(`*${node.description}*`);
  }

  return {
    components: [toCardComponent(res)],
    variants: { markdown: lines.join('\n') },
  };
}
