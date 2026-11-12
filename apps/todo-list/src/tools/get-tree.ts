import type { AgentApp } from '@agentapps/sdk';
import { TodoStore } from '../lib/index.js';
import { requireUserId, toToolError } from './_shared.js';

export function registerGetTree(app: AgentApp): void {
  app.tool('get-tree', {
    description:
      'Get the full tree of nodes for the current user as a nested hierarchy (Workflowy-style). Returns: { tree: [{ nodeId, text, description, completed, collapsed, position, childCount, completedChildren, children?: [...] }] }. Pass nodeId to get only the subtree rooted at that node. Tree nodes do NOT include instructions or log — use get-node for full detail.',
    parameters: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: 'Optional: get only the subtree rooted at this node.',
        },
      },
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
    handler: async (args, ctx) => {
      try {
        requireUserId(ctx);
        const nodeId = (args.nodeId as string | undefined) ?? null;
        const tree = await TodoStore.getTree(ctx.storage, nodeId);
        return { tree };
      } catch (error) {
        toToolError(error);
      }
    },
  });
}
