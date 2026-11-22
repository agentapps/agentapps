import type { AgentApp } from '@agentapps/sdk';
import { TodoError, TodoStore } from '../lib/index.js';
import { emitEvent, requireUserId, toToolError } from './_shared.js';

export function registerMoveNode(app: AgentApp): void {
  app.tool('move-node', {
    description:
      'Move a node to a different parent and/or position within the tree. Set newParentId to null to move to root level. newPosition is the 0-based index among siblings. Detects circular moves (cannot move a node into its own subtree). Returns: { node: { nodeId, parentId, position, updatedAt } }.',
    parameters: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node ID to move.' },
        newParentId: {
          type: 'string',
          description:
            'New parent node ID. Pass null to move to root (top-level). Omit to keep current parent.',
        },
        newPosition: {
          type: 'number',
          description: '0-based position among the new siblings (default 0).',
        },
      },
      required: ['nodeId'],
    },
    // Sets parent and position in the app's own Storage; the same call again changes nothing.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      try {
        requireUserId(ctx);
        const nodeId = args.nodeId as string;
        if (!nodeId) throw new TodoError('INVALID_INPUT', 'nodeId is required.');

        const newParentId = (args.newParentId as string | null | undefined) ?? null;
        const newPosition = (args.newPosition as number) ?? 0;

        const existingNode = await TodoStore.getNode(ctx.storage, nodeId);
        const oldParentId = existingNode?.parentId ?? null;

        const node = await TodoStore.moveNode(ctx.storage, nodeId, newParentId, newPosition);
        if (!node) throw new TodoError('NOT_FOUND', `Node "${nodeId}" not found.`);

        emitEvent(ctx, 'node.moved', {
          nodeId: node.nodeId,
          newParentId: node.parentId,
          oldParentId,
          position: node.position,
        });

        return {
          node: {
            nodeId: node.nodeId,
            text: node.text,
            description: node.description,
            completed: node.completed,
            parentId: node.parentId,
            position: node.position,
            updatedAt: node.updatedAt,
          },
        };
      } catch (error) {
        toToolError(error);
      }
    },
  });
}
