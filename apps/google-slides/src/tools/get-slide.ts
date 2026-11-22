import type { AgentApp } from '@agentapps/sdk';
import {
  ensureAuthenticated,
  extractTextFromSlide,
  initializeGoogleClients,
  withAuthRetry,
} from '../lib/index.js';

/**
 * get-slide — GET presentations/{presentationId}/pages/{slideId}.
 */
export function registerGetSlideTool(app: AgentApp): void {
  app.tool('get-slide', {
    description:
      'Get detailed information about a specific slide by its objectId. ' +
      'Returns the slide text content, page elements (shapes, images, tables), and layout metadata.',
    parameters: {
      type: 'object',
      properties: {
        presentationId: {
          type: 'string',
          description: 'The ID of the presentation',
        },
        slideId: {
          type: 'string',
          description: 'The objectId of the slide to retrieve',
        },
      },
      required: ['presentationId', 'slideId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const clients = await initializeGoogleClients(ctx);
      await ensureAuthenticated(ctx);

      const { presentationId, slideId } = args as {
        presentationId: string;
        slideId: string;
      };

      if (!slideId || slideId.trim().length === 0) {
        throw new Error('slideId is required and must be a non-empty string.');
      }

      return withAuthRetry(
        ctx,
        async () => {
          const response = await clients.slides.presentations.pages.get({
            presentationId,
            pageObjectId: slideId,
          });

          const slide = response.data;

          const elements =
            slide.pageElements?.map((el) => ({
              objectId: el.objectId,
              type: el.shape
                ? 'shape'
                : el.image
                  ? 'image'
                  : el.table
                    ? 'table'
                    : el.line
                      ? 'line'
                      : el.sheetsChart
                        ? 'sheets_chart'
                        : 'other',
              shapeType: el.shape?.shapeType,
              size: el.size,
              transform: el.transform,
            })) || [];

          return {
            presentationId,
            slideId: slide.objectId,
            pageType: slide.pageType,
            text: extractTextFromSlide(slide),
            elementCount: elements.length,
            elements,
          };
        },
        'get-slide',
      );
    },
  });
}
