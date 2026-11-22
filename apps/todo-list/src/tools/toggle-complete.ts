import type { AgentApp } from '@agentapps/sdk';
import { TodoError, TodoStore } from '../lib/index.js';
import { emitEvent, requireUserId, toToolError } from './_shared.js';

export function registerToggleComplete(app: AgentApp): void {
  app.tool('toggle-complete', {
    description:
      'Toggle the completed state of a node. Cascades to all descendants — marking a parent complete also marks all children complete, and vice versa. Adds a log entry automatically. Returns: { node: { nodeId, completed, updatedAt } }.',
    parameters: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node ID to toggle completion on.' },
      },
      required: ['nodeId'],
    },
    // A toggle: each call flips the flag (and adds a log entry), so it is not idempotent.
    // Own Storage only.
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

        const node = await TodoStore.toggleComplete(ctx.storage, nodeId);
        if (!node) throw new TodoError('NOT_FOUND', `Node "${nodeId}" not found.`);

        emitEvent(ctx, 'node.completed', { nodeId: node.nodeId, completed: node.completed });

        return {
          node: {
            nodeId: node.nodeId,
            text: node.text,
            description: node.description,
            completed: node.completed,
            updatedAt: node.updatedAt,
          },
        };
      } catch (error) {
        toToolError(error);
      }
    },
  });
}
