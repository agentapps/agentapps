import type { AgentApp } from '@agentapps/sdk';
import { ensureAuthenticated, initializeGoogleClients, withAuthRetry } from '../lib/index.js';

/**
 * delete-slide — batchUpdate with deleteObject request.
 */
export function registerDeleteSlideTool(app: AgentApp): void {
  app.tool('delete-slide', {
    description:
      'Delete a slide from a Google Slides presentation by its objectId or 0-based index.',
    parameters: {
      type: 'object',
      properties: {
        presentationId: {
          type: 'string',
          description: 'The ID of the presentation',
        },
        slideObjectId: {
          type: 'string',
          description:
            'The objectId of the slide to delete. If provided, takes precedence over slideIndex.',
        },
        slideIndex: {
          type: 'number',
          description:
            '0-based index of the slide to delete (used if slideObjectId is not provided).',
        },
      },
      required: ['presentationId'],
    },
    // Not idempotent: by slideIndex, a repeated call deletes the slide that moved into that
    // position.
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const clients = await initializeGoogleClients(ctx);
      await ensureAuthenticated(ctx);

      const { presentationId, slideObjectId, slideIndex } = args as {
        presentationId: string;
        slideObjectId?: string;
        slideIndex?: number;
      };

      return withAuthRetry(
        ctx,
        async () => {
          let targetObjectId: string | undefined = slideObjectId;

          // If no objectId, resolve from index
          if (!targetObjectId) {
            if (slideIndex === undefined) {
              throw new Error('Either slideObjectId or slideIndex must be provided.');
            }

            const pres = await clients.slides.presentations.get({ presentationId });
            const slides = pres.data.slides || [];

            if (slideIndex < 0 || slideIndex >= slides.length) {
              throw new Error(
                `Slide index ${slideIndex} is out of range. Presentation has ${slides.length} slides.`,
              );
            }

            targetObjectId = slides[slideIndex].objectId;
          }

          if (!targetObjectId) {
            throw new Error('Could not determine the slide objectId to delete.');
          }

          await clients.slides.presentations.batchUpdate({
            presentationId,
            requestBody: {
              requests: [
                {
                  deleteObject: {
                    objectId: targetObjectId,
                  },
                },
              ],
            },
          });

          return {
            success: true,
            presentationId,
            deletedObjectId: targetObjectId,
            message: `Slide '${targetObjectId}' deleted successfully.`,
          };
        },
        'delete-slide',
      );
    },
  });
}
