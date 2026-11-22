/**
 * create_annotation — create an annotation in PostHog.
 */

import type { AgentApp } from '@agentapps/sdk';
import { posthogRequest } from '../lib/posthog-client.js';

export function registerCreateAnnotationTool(app: AgentApp): void {
  app.tool('create_annotation', {
    description:
      'Create an annotation in PostHog to mark a point in time on charts (e.g. deployments, incidents).',
    parameters: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The annotation text (e.g. "v2.3.0 deployed").',
        },
        date_marker: {
          type: 'string',
          description:
            'ISO 8601 datetime for the annotation (e.g. "2024-07-25T14:30:00Z"). Defaults to now if omitted.',
        },
        scope: {
          type: 'string',
          description:
            'Scope of the annotation: "dashboard_item" for a single insight, or "organization" for all insights. Default: "organization".',
          enum: ['dashboard_item', 'organization'],
        },
      },
      required: ['content'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const body: Record<string, unknown> = {
        content: args.content as string,
      };
      if (args.date_marker) body.date_marker = args.date_marker as string;
      if (args.scope) body.scope = args.scope as string;

      ctx.log('info', `Creating annotation: ${args.content}`);
      return await posthogRequest('POST', 'annotations', { body }, ctx);
    },
  });
}
