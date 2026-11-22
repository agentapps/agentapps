import type { AgentApp } from '@agentapps/sdk';
import {
  ensureAuthenticated,
  initializeGoogleClients,
  processEscapeSequences,
  withAuthRetry,
} from '../lib/index.js';

/**
 * add-text-box — batchUpdate with createShape (TEXT_BOX) + insertText requests.
 */
export function registerAddTextBoxTool(app: AgentApp): void {
  app.tool('add-text-box', {
    description:
      'Insert a text box shape on a slide in a Google Slides presentation. ' +
      'Specify position and size in points (PT). Optionally include initial text content.',
    parameters: {
      type: 'object',
      properties: {
        presentationId: {
          type: 'string',
          description: 'The ID of the presentation',
        },
        slideObjectId: {
          type: 'string',
          description: 'The objectId of the slide to add the text box to',
        },
        text: {
          type: 'string',
          description:
            'Optional text content to insert into the text box. Supports \\n for line breaks.',
        },
        x: {
          type: 'number',
          description: 'X position of the text box in points (default: 100)',
        },
        y: {
          type: 'number',
          description: 'Y position of the text box in points (default: 100)',
        },
        width: {
          type: 'number',
          description: 'Width of the text box in points (default: 300)',
        },
        height: {
          type: 'number',
          description: 'Height of the text box in points (default: 50)',
        },
      },
      required: ['presentationId', 'slideObjectId'],
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
        text: rawText,
        x = 100,
        y = 100,
        width = 300,
        height = 50,
      } = args as {
        presentationId: string;
        slideObjectId: string;
        text?: string;
        x?: number;
        y?: number;
        width?: number;
        height?: number;
      };

      return withAuthRetry(
        ctx,
        async () => {
          const textBoxId = `textBox_${Date.now()}`;

          const requests: any[] = [
            {
              createShape: {
                objectId: textBoxId,
                shapeType: 'TEXT_BOX',
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
          ];

          if (rawText) {
            const text = processEscapeSequences(rawText);
            requests.push({
              insertText: {
                objectId: textBoxId,
                text,
              },
            });
          }

          await clients.slides.presentations.batchUpdate({
            presentationId,
            requestBody: { requests },
          });

          return {
            success: true,
            presentationId,
            slideObjectId,
            textBoxObjectId: textBoxId,
            message: `Text box created with objectId: ${textBoxId}`,
          };
        },
        'add-text-box',
      );
    },
  });
}
