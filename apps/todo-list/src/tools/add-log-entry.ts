import type { AgentApp } from '@agentapps/sdk';
import { TodoError, TodoStore } from '../lib/index.js';
import { requireUserId, toToolError } from './_shared.js';

export function registerAddLogEntry(app: AgentApp): void {
  app.tool('add-log-entry', {
    description:
      'Add a chronological log entry to a node. Used to track progress, notes, and history over time. Returns: { node: { nodeId, log: [{ timestamp, text }], updatedAt } }.',
    parameters: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node ID to add the log entry to.' },
        text: { type: 'string', description: 'The log entry text. Max 2000 chars.' },
      },
      required: ['nodeId', 'text'],
    },
    annotations: { readOnlyHint: false },
    handler: async (args, ctx) => {
      try {
        requireUserId(ctx);
        const nodeId = args.nodeId as string;
        const text = args.text as string;
        if (!nodeId) throw new TodoError('INVALID_INPUT', 'nodeId is required.');
        if (!text || typeof text !== 'string' || text.trim() === '') {
          throw new TodoError('INVALID_INPUT', 'text is required and must be a non-empty string.');
        }

        const node = await TodoStore.addLogEntry(ctx.storage, nodeId, text);
        if (!node) throw new TodoError('NOT_FOUND', `Node "${nodeId}" not found.`);

        return {
          node: {
            nodeId: node.nodeId,
            text: node.text,
            description: node.description,
            completed: node.completed,
            log: node.log ?? [],
            updatedAt: node.updatedAt,
          },
        };
      } catch (error) {
        toToolError(error);
      }
    },
  });
}
