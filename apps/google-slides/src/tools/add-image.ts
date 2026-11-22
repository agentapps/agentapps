import type { AgentApp } from '@agentapps/sdk';
import { ensureAuthenticated, initializeGoogleClients, withAuthRetry } from '../lib/index.js';

/**
 * add-image — batchUpdate with createImage request.
 */
export function registerAddImageTool(app: AgentApp): void {
  app.tool('add-image', {
    description:
      'Insert an image on a slide in a Google Slides presentation from a URL. ' +
      'Specify position and size in points (PT). The image URL must be publicly accessible.',
    parameters: {
      type: 'object',
      properties: {
        presentationId: {
          type: 'string',
          description: 'The ID of the presentation',
        },
        slideObjectId: {
          type: 'string',
          description: 'The objectId of the slide to add the image to',
        },
        imageUrl: {
          type: 'string',
          description: 'Publicly accessible URL of the image to insert',
        },
        x: {
          type: 'number',
          description: 'X position of the image in points (default: 100)',
        },
        y: {
          type: 'number',
          description: 'Y position of the image in points (default: 100)',
        },
        width: {
          type: 'number',
          description: 'Width of the image in points (default: 300)',
        },
        height: {
          type: 'number',
          description: 'Height of the image in points (default: 200)',
        },
      },
      required: ['presentationId', 'slideObjectId', 'imageUrl'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const clients = await initializeGoogleClients(ctx);
      await ensureAuthenticated(ctx);

      const {
        presentationId,
        slideObjectId,
        imageUrl,
        x = 100,
        y = 100,
        width = 300,
        height = 200,
      } = args as {
        presentationId: string;
        slideObjectId: string;
        imageUrl: string;
        x?: number;
        y?: number;
        width?: number;
        height?: number;
      };

      if (!imageUrl || imageUrl.trim().length === 0) {
        throw new Error('imageUrl is required and must be a non-empty string.');
      }

      return withAuthRetry(
        ctx,
        async () => {
          const imageId = `image_${Date.now()}`;

          const response = await clients.slides.presentations.batchUpdate({
            presentationId,
            requestBody: {
              requests: [
                {
                  createImage: {
                    objectId: imageId,
                    url: imageUrl,
                    elementProperties: {
                      pageObjectId: slideObjectId,
                      size: {
                        width: { magnitude: width, unit: 'PT' },
                        height: { magnitude: height, unit: 'PT' },
                      },
                      transform: {
                        scaleX: 1,
                        scaleY: 1,
                        translateX: x,
                        translateY: y,
                        unit: 'PT',
                      },
                    },
                  },
                },
              ],
            },
          });

          const createReply = response.data.replies?.[0]?.createImage;
          const returnedObjectId = createReply?.objectId || imageId;

          return {
            success: true,
            presentationId,
            slideObjectId,
            imageObjectId: returnedObjectId,
            imageUrl,
            message: `Image inserted with objectId: ${returnedObjectId}`,
          };
        },
        'add-image',
      );
    },
  });
}
