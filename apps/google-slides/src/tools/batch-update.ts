import type { AgentApp } from '@agentapps/sdk';
import { ensureAuthenticated, initializeGoogleClients, withAuthRetry } from '../lib/index.js';

/**
 * batch-update — raw batchUpdate passthrough to the Slides API.
 */
export function registerBatchUpdateTool(app: AgentApp): void {
  app.tool('batch-update', {
    description:
      'Execute advanced operations on a Google Slides presentation using the Slides API batchUpdate endpoint. ' +
      'Pass an array of native Slides API request objects. Supports: createSlide, deleteObject, insertText, ' +
      'replaceAllText, createShape, updateShapeProperties, createImage, createTable, updatePageProperties, ' +
      'updateTextStyle, and more. ' +
      'See https://developers.google.com/slides/api/reference/rest/v1/presentations/batchUpdate for full schema.',
    parameters: {
      type: 'object',
      properties: {
        presentationId: {
          type: 'string',
          description: 'The ID of the presentation',
        },
        requests: {
          type: 'array',
          description:
            'Array of Slides API batchUpdate request objects. Each object is a key mapped to its request type. ' +
            'Common types: createSlide, deleteObject, insertText, replaceAllText, createShape, ' +
            'createImage, createTable, createLine, updateShapeProperties, updateTextStyle, ' +
            'updatePageProperties, updatePageElementsZOrder, updateSlidesPosition. ' +
            'See https://developers.google.com/slides/api/reference/rest/v1/presentations/request for full schema.',
          items: {
            type: 'object',
          },
        },
      },
      required: ['presentationId', 'requests'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const clients = await initializeGoogleClients(ctx);
      await ensureAuthenticated(ctx);

      const { presentationId, requests } = args as {
        presentationId: string;
        requests: any[];
      };

      if (!requests || requests.length === 0) {
        return {
          success: false,
          message: 'No requests provided',
        };
      }

      return withAuthRetry(
        ctx,
        async () => {
          const response = await clients.slides.presentations.batchUpdate({
            presentationId,
            requestBody: { requests },
          });

          return {
            success: true,
            presentationId,
            replies: response.data.replies,
            operationsPerformed: requests.length,
          };
        },
        'batch-update',
      );
    },
  });
}
