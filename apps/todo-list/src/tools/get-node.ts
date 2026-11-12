import type { AgentApp } from '@agentapps/sdk';
import { TodoError, TodoStore } from '../lib/index.js';
import { requireUserId, toToolError } from './_shared.js';

export function registerGetNode(app: AgentApp): void {
  app.tool('get-node', {
    description:
      'Get full detail of a single node, including instructions and the complete log. Use this when you need the full content of a task (get-tree only returns lightweight fields). Returns: { node: { nodeId, parentId, text, description, instructions, completed, collapsed, position, log: [{ timestamp, text }], createdAt, updatedAt } }.',
    parameters: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node ID to retrieve.' },
      },
      required: ['nodeId'],
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
    handler: async (args, ctx) => {
      try {
        requireUserId(ctx);
        const nodeId = args.nodeId as string;
        if (!nodeId) throw new TodoError('INVALID_INPUT', 'nodeId is required.');

        const node = await TodoStore.getNodeDetail(ctx.storage, nodeId);
        if (!node) throw new TodoError('NOT_FOUND', `Node "${nodeId}" not found.`);

        return { node };
      } catch (error) {
        toToolError(error);
      }
    },
  });
}
