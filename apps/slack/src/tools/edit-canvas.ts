import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { extractCanvas, parseChanges } from './_canvas-helpers.js';
import { wrapSlackMutation } from './utils.js';

interface EditCanvasArgs {
  canvasId: string;
  changes: string;
}

export function registerEditCanvasTool(app: AgentApp): void {
  app.tool('edit-canvas', {
    description:
      "Edit a canvas with a list of changes. Operations: insert_at_start|insert_at_end (no section_id) | insert_before|insert_after|replace|delete (section_id REQUIRED — use canvases.sections.lookup). All except delete also require document_content {type:'markdown',markdown:string}. Returns curated canvas. Not retryable. EXPERIMENTAL.",
    parameters: {
      type: 'object',
      properties: {
        canvasId: { type: 'string', description: 'Canvas id.' },
        changes: {
          type: 'string',
          description:
            'JSON array of operations. Example: \'[{"operation":"insert_at_end","document_content":{"type":"markdown","markdown":"# New section"}}]\' or \'[{"operation":"replace","section_id":"S123","document_content":{"type":"markdown","markdown":"updated"}}]\'',
        },
      },
      required: ['canvasId', 'changes'],
    },
    annotations: { readOnlyHint: false },
    handler: async (args, ctx) => {
      const { canvasId, changes } = args as unknown as EditCanvasArgs;
      if (typeof canvasId !== 'string' || canvasId.trim().length === 0) {
        throw new Error('canvasId must be a non-empty string.');
      }
      const parsedChanges = parseChanges(changes);
      if (parsedChanges.length === 0) {
        throw new Error('changes must contain at least one operation.');
      }
      const { client } = await getSlackSession(ctx);
      const result = await wrapSlackMutation(() =>
        (client as any).canvases.edit({ canvas_id: canvasId, changes: parsedChanges }),
      );
      return result?.canvas
        ? extractCanvas(result.canvas)
        : {
            id: canvasId,
            title: '',
            channelId: null,
            isStandalone: true,
            createdAt: null,
            updatedAt: null,
            ownerUserId: null,
          };
    },
  });
}
