import type { AgentApp } from '@agentapps/sdk';
import { ensureAuthenticated, initializeGoogleClients, withAuthRetry } from '../lib/index.js';

/**
 * duplicate-slide — batchUpdate with duplicateObject request.
 */
export function registerDuplicateSlideTool(app: AgentApp): void {
  app.tool('duplicate-slide', {
    description:
      'Duplicate an existing slide in a Google Slides presentation. ' +
      'Creates a copy of the specified slide and inserts it immediately after the original.',
    parameters: {
      type: 'object',
      properties: {
        presentationId: {
          type: 'string',
          description: 'The ID of the presentation',
        },
        slideObjectId: {
          type: 'string',
          description: 'The objectId of the slide to duplicate',
        },
      },
      required: ['presentationId', 'slideObjectId'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const clients = await initializeGoogleClients(ctx);
      await ensureAuthenticated(ctx);

      const { presentationId, slideObjectId } = args as {
        presentationId: string;
        slideObjectId: string;
      };

      if (!slideObjectId || slideObjectId.trim().length === 0) {
        throw new Error('slideObjectId is required and must be a non-empty string.');
      }

      return withAuthRetry(
        ctx,
        async () => {
          const response = await clients.slides.presentations.batchUpdate({
            presentationId,
            requestBody: {
              requests: [
                {
                  duplicateObject: {
                    objectId: slideObjectId,
                  },
                },
              ],
            },
          });

          const duplicateReply = response.data.replies?.[0]?.duplicateObject;
          const newObjectId = duplicateReply?.objectId || '';

          return {
            success: true,
            presentationId,
            sourceSlideObjectId: slideObjectId,
            newSlideObjectId: newObjectId,
            message: newObjectId
              ? `Slide duplicated. New slide objectId: ${newObjectId}`
              : 'Slide duplicated (new objectId not returned by API)',
          };
        },
        'duplicate-slide',
      );
    },
  });
}
