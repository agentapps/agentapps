import type { AgentApp } from '@agentapps/sdk';
import { TodoError, TodoStore } from '../lib/index.js';
import { emitEvent, requireUserId, toToolError } from './_shared.js';

export function registerAddNode(app: AgentApp): void {
  app.tool('add-node', {
    description:
      'Add a new node to the tree. If parentId is omitted or null, adds as a root-level node. If parentId is provided, adds as a child of that node. Returns: { node: { nodeId, parentId, text, description, instructions, completed, collapsed, position, createdAt, updatedAt }, parentText: string | null }.',
    parameters: {
      type: 'object',
      properties: {
        parentId: {
          type: 'string',
          description: 'Parent node ID to nest under. Omit or null for a root-level node.',
        },
        text: { type: 'string', description: 'The node title. Max 2000 chars.' },
        description: {
          type: 'string',
          description: 'Short description under the title. Max 2000 chars.',
        },
        instructions: {
          type: 'string',
          description:
            'Detailed markdown instructions for what to do with this task. Max 10000 chars.',
        },
      },
      required: ['text'],
    },
    annotations: { readOnlyHint: false },
    handler: async (args, ctx) => {
      try {
        requireUserId(ctx);
        const parentId = (args.parentId as string | null | undefined) ?? null;
        const text = args.text as string;
        const description = (args.description as string) ?? '';
        const instructions = (args.instructions as string) ?? '';

        if (!text || typeof text !== 'string' || text.trim() === '') {
          throw new TodoError('INVALID_INPUT', 'text is required and must be a non-empty string.');
        }

        const node = await TodoStore.createNode(
          ctx.storage,
          parentId,
          text,
          description,
          instructions,
        );
        const parent = node.parentId ? await TodoStore.getNode(ctx.storage, node.parentId) : null;

        emitEvent(ctx, 'node.added', {
          nodeId: node.nodeId,
          parentId: node.parentId,
          text: node.text,
        });

        return {
          node: {
            nodeId: node.nodeId,
            parentId: node.parentId,
            text: node.text,
            description: node.description,
            instructions: node.instructions,
            completed: node.completed,
            collapsed: node.collapsed,
            position: node.position,
            createdAt: node.createdAt,
            updatedAt: node.updatedAt,
          },
          parentText: parent?.text ?? null,
        };
      } catch (error) {
        toToolError(error);
      }
    },
  });
}
