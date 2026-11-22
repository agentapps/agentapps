/**
 * delete_annotation — delete a chart annotation from Amplitude.
 */

import type { AgentApp } from '@agentapps/sdk';
import { AMPLITUDE_DASHBOARD_URL, amplitudeRequest } from '../lib/amplitude-client.js';

export function registerDeleteAnnotationTool(app: AgentApp): void {
  app.tool('delete_annotation', {
    description:
      'Delete a chart annotation from Amplitude by its ID. Use get_annotations to find annotation IDs first.',
    parameters: {
      type: 'object',
      properties: {
        annotationId: {
          type: 'string',
          description: 'The ID of the annotation to delete.',
        },
      },
      required: ['annotationId'],
    },
    // DELETE by id: the app has no way to bring the annotation back.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const annotationId = args.annotationId as string;

      return await amplitudeRequest(
        'DELETE',
        AMPLITUDE_DASHBOARD_URL,
        `/annotations/${annotationId}`,
        null,
        ctx,
      );
    },
  });
}
