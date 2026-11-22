import type { AgentApp } from '@agentapps/sdk';
import { TodoError, TodoStore } from '../lib/index.js';
import { requireUserId, toToolError } from './_shared.js';

export function registerToggleCollapse(app: AgentApp): void {
  app.tool('toggle-collapse', {
    description:
      'Toggle the collapsed/expanded state of a node (hide/show children in Workflowy). Returns: { node: { nodeId, collapsed, updatedAt } }.',
    parameters: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node ID to toggle collapse on.' },
      },
      required: ['nodeId'],
    },
    // A toggle: each call flips the flag, so it is not idempotent. Own Storage only.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      try {
        requireUserId(ctx);
        const nodeId = args.nodeId as string;
        if (!nodeId) throw new TodoError('INVALID_INPUT', 'nodeId is required.');

        const node = await TodoStore.toggleCollapse(ctx.storage, nodeId);
        if (!node) throw new TodoError('NOT_FOUND', `Node "${nodeId}" not found.`);

        return {
          node: {
            nodeId: node.nodeId,
            text: node.text,
            description: node.description,
            completed: node.completed,
            collapsed: node.collapsed,
            updatedAt: node.updatedAt,
          },
        };
      } catch (error) {
        toToolError(error);
      }
    },
  });
}
