import type { AgentApp } from '@agentapps/sdk';
import { TodoError, TodoStore } from '../lib/index.js';
import { emitEvent, requireUserId, toToolError } from './_shared.js';

export function registerDeleteNode(app: AgentApp): void {
  app.tool('delete-node', {
    description:
      'Delete a node and ALL its descendants (entire subtree). Irreversible. Returns: { deleted: true, node: { text, description, ... } }.',
    parameters: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: 'Node ID to delete. All children will be removed recursively.',
        },
      },
      required: ['nodeId'],
    },
    annotations: { sensitive: true, readOnlyHint: false, destructiveHint: true },
    handler: async (args, ctx) => {
      try {
        requireUserId(ctx);
        const nodeId = args.nodeId as string;
        if (!nodeId) throw new TodoError('INVALID_INPUT', 'nodeId is required.');

        const node = await TodoStore.deleteNode(ctx.storage, nodeId);
        if (!node) throw new TodoError('NOT_FOUND', `Node "${nodeId}" not found.`);

        emitEvent(ctx, 'node.deleted', { nodeId, text: node.text });

        return {
          deleted: true as const,
          nodeId,
          node: { text: node.text, description: node.description, completed: node.completed },
        };
      } catch (error) {
        toToolError(error);
      }
    },
  });
}
