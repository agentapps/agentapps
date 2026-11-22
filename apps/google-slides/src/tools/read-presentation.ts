import type { AgentApp } from '@agentapps/sdk';
import {
  ensureAuthenticated,
  extractTextFromSlide,
  initializeGoogleClients,
  withAuthRetry,
} from '../lib/index.js';

/**
 * read-presentation — GET presentations/{presentationId}.
 */
export function registerReadPresentationTool(app: AgentApp): void {
  app.tool('read-presentation', {
    description: 'Read slide content from a Google Slides presentation.',
    parameters: {
      type: 'object',
      properties: {
        presentationId: {
          type: 'string',
          description: 'The ID of the presentation',
        },
      },
      required: ['presentationId'],
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

      const { presentationId } = args as { presentationId: string };

      return withAuthRetry(
        ctx,
        async () => {
          const response = await clients.slides.presentations.get({
            presentationId,
          });

          const presentation = response.data;

          const slides =
            presentation.slides?.map((slide, index) => ({
              slideNumber: index + 1,
              objectId: slide.objectId,
              text: extractTextFromSlide(slide),
            })) || [];

          return {
            title: presentation.title,
            slideCount: slides.length,
            slides,
          };
        },
        'read-presentation',
      );
    },
  });
}
