import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { wrapSlackMutation } from './utils.js';

interface DeleteCanvasArgs {
  canvasId: string;
}

export function registerDeleteCanvasTool(app: AgentApp): void {
  app.tool('delete-canvas', {
    description:
      'Delete a canvas. Returns { canvasId, deleted: true }. Not retryable. EXPERIMENTAL. Params: canvasId.',
    parameters: {
      type: 'object',
      properties: {
        canvasId: { type: 'string', description: 'Canvas id.' },
      },
      required: ['canvasId'],
    },
    annotations: { sensitive: true, readOnlyHint: false, destructiveHint: true },
    handler: async (args, ctx) => {
      const { canvasId } = args as unknown as DeleteCanvasArgs;
      if (typeof canvasId !== 'string' || canvasId.trim().length === 0) {
        throw new Error('canvasId must be a non-empty string.');
      }
      const { client } = await getSlackSession(ctx);
      await wrapSlackMutation(() => (client as any).canvases.delete({ canvas_id: canvasId }));
      return { canvasId, deleted: true };
    },
  });
}
