/**
 * Todo List Agent App — Renderer: Node Detail
 *
 * Bound to `get-node`. Presents the NodeDetail as a standard `detail` UI
 * Component (overview, instructions and log sections) plus a markdown variant:
 *
 * Example markdown:
 * ```markdown
 * ## ● Comprar pan
 *
 * **Description:** Pan para la semana
 *
 * ### Instructions
 * Comprar en la panadería de la esquina
 *
 * ### Log
 * - 2026-08-29 03:00 — Completed
 * ```
 */

import type { RendererOutput, ToolContext, UIComponent } from '@agentapps/sdk';
import type { LogEntry, NodeDetail } from '../lib/types.js';

/** Result shape returned by the get-node tool. */
interface GetNodeResult {
  node: NodeDetail;
}

/** Format a timestamp as "YYYY-MM-DD HH:MM". */
function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

/** Format a single log entry as a markdown list item. */
function formatLogEntry(entry: LogEntry): string {
  return `- ${formatTimestamp(entry.timestamp)} — ${entry.text}`;
}

/** Build the `detail` component for a node: overview, instructions and log sections. */
export function toDetailComponent(node: NodeDetail): UIComponent {
  const sections: Extract<UIComponent, { type: 'detail' }>['sections'] = [
    {
      title: 'Overview',
      fields: [
        { label: 'Title', value: node.text, kind: 'text' },
        { label: 'Description', value: node.description || '(none)', kind: 'text' },
        { label: 'Completed', value: node.completed, kind: 'text' },
        { label: 'Position', value: node.position, kind: 'text' },
        { label: 'Parent', value: node.parentId ?? '(root)', kind: 'text' },
        { label: 'Created', value: new Date(node.createdAt).toISOString(), kind: 'date' },
        { label: 'Updated', value: new Date(node.updatedAt).toISOString(), kind: 'date' },
      ],
    },
  ];
  if (node.instructions) {
    sections.push({
      title: 'Instructions',
      fields: [{ label: 'Instructions', value: node.instructions, kind: 'markdown' }],
    });
  }
  if (node.log && node.log.length > 0) {
    sections.push({
      title: `Log (${node.log.length} entries)`,
      fields: node.log.map((entry) => ({
        label: new Date(entry.timestamp).toISOString(),
        value: entry.text,
        kind: 'text' as const,
      })),
    });
  }
  return { type: 'detail', title: node.text, sections };
}

/**
 * Node-detail renderer — a `detail` component plus a markdown card with
 * sections for description, instructions, and log history.
 */
export async function detailRenderer(result: unknown, _ctx: ToolContext): Promise<RendererOutput> {
  const { node } = result as GetNodeResult;

  const lines: string[] = [];
  const statusIcon = node.completed ? '●' : '○';
  lines.push(`## ${statusIcon} ${node.text}`);
  lines.push('');

  // Description
  if (node.description) {
    lines.push(`**Description:** ${node.description}`);
    lines.push('');
  }

  // Instructions (markdown block)
  if (node.instructions) {
    lines.push('### Instructions');
    lines.push(node.instructions);
    lines.push('');
  }

  // Log (chronological history)
  if (node.log && node.log.length > 0) {
    lines.push('### Log');
    lines.push(node.log.map(formatLogEntry).join('\n'));
  }

  return {
    components: [toDetailComponent(node)],
    variants: { markdown: lines.join('\n').trimEnd() },
  };
}
