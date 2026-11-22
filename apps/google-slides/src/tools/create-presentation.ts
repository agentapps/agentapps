import type { AgentApp } from '@agentapps/sdk';
import { ensureAuthenticated, initializeGoogleClients, withAuthRetry } from '../lib/index.js';

/**
 * create-presentation — POST presentations.create.
 */
export function registerCreatePresentationTool(app: AgentApp): void {
  app.tool('create-presentation', {
    description:
      'Create a new Google Slides presentation with a title. Returns the presentation ID and URL.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Title of the new presentation',
        },
      },
      required: ['title'],
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

      const { title } = args as { title: string };

      if (typeof title !== 'string' || title.trim().length === 0) {
        throw new Error('title is required and must be a non-empty string.');
      }

      return withAuthRetry(
        ctx,
        async () => {
          const response = await clients.slides.presentations.create({
            requestBody: {
              title,
            },
          });

          const presentationId = response.data.presentationId!;
          const presentationUrl = `https://docs.google.com/presentation/d/${presentationId}/edit`;

          return {
            presentationId,
            title,
            url: presentationUrl,
          };
        },
        'create-presentation',
      );
    },
  });
}
