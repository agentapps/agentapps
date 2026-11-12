import type { AgentApp } from '@agentapps/sdk';
import { TodoError, TodoStore } from '../lib/index.js';
import { emitEvent, requireUserId, toToolError } from './_shared.js';

export function registerUpdateNode(app: AgentApp): void {
  app.tool('update-node', {
    description:
      'Update the text, description, and/or instructions of a node. Omitted fields are unchanged. Returns: { node: { nodeId, text, description, instructions, updatedAt } }.',
    parameters: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node ID to update.' },
        text: { type: 'string', description: 'New node title. Max 2000 chars.' },
        description: {
          type: 'string',
          description: 'New short description. Max 2000 chars. Pass empty string to clear.',
        },
        instructions: {
          type: 'string',
          description:
            'New detailed markdown instructions. Max 10000 chars. Pass empty string to clear.',
        },
      },
      required: ['nodeId'],
    },
    annotations: { readOnlyHint: false, idempotentHint: true },
    handler: async (args, ctx) => {
      try {
        requireUserId(ctx);
        const nodeId = args.nodeId as string;
        if (!nodeId) throw new TodoError('INVALID_INPUT', 'nodeId is required.');

        const patch: { text?: string; description?: string; instructions?: string } = {};
        if (args.text !== undefined) patch.text = args.text as string;
        if (args.description !== undefined) patch.description = args.description as string;
        if (args.instructions !== undefined) patch.instructions = args.instructions as string;

        if (Object.keys(patch).length === 0) {
          throw new TodoError(
            'INVALID_INPUT',
            'At least one of "text", "description", or "instructions" must be provided.',
          );
        }

        const node = await TodoStore.updateNode(ctx.storage, nodeId, patch);
        if (!node) throw new TodoError('NOT_FOUND', `Node "${nodeId}" not found.`);

        const updatedFields = Object.keys(patch);
        emitEvent(ctx, 'node.updated', {
          nodeId: node.nodeId,
          text: node.text,
          fields: updatedFields,
        });

        return {
          node: {
            nodeId: node.nodeId,
            text: node.text,
            description: node.description,
            instructions: node.instructions,
            updatedAt: node.updatedAt,
          },
        };
      } catch (error) {
        toToolError(error);
      }
    },
  });
}
