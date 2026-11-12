import type { AgentApp } from '@agentapps/sdk';
import { ensureAuthenticated, initializeGoogleClients, withAuthRetry } from '../lib/index.js';

/**
 * create-watch — Create a watch on a Google Form for push notifications.
 */
export function registerCreateWatchTool(app: AgentApp): void {
  app.tool('create-watch', {
    description: `Create a watch on a Google Form to receive push notifications via a Cloud Pub/Sub topic.

Event types:
- \`"SCHEMA"\` — triggers when the form structure changes (questions added/removed/updated)
- \`"RESPONSES"\` — triggers when a new response is submitted

The Pub/Sub topic must permission publish privileges to \`serviceAccount:forms-notifications@system.gserviceaccount.com\`. A watch expires after 7 days and can be renewed. Maximum 2 watches per form (one per event type).

Params: formId (required), eventType (required), topicName (required — fully qualified Pub/Sub topic, e.g. "projects/my-project/topics/my-topic"), watchId? (custom ID, 4-63 chars, /a-z-/).`,
    parameters: {
      type: 'object',
      properties: {
        formId: {
          type: 'string',
          description: 'The ID of the form to watch',
        },
        eventType: {
          type: 'string',
          description: 'The event type to watch for: "SCHEMA" or "RESPONSES"',
          enum: ['SCHEMA', 'RESPONSES'],
        },
        topicName: {
          type: 'string',
          description:
            'Fully qualified Cloud Pub/Sub topic name, e.g. "projects/my-project/topics/my-topic"',
        },
        watchId: {
          type: 'string',
          description:
            'Optional custom ID for the watch (4-63 characters, valid characters: /a-z-/). If not provided, one is generated automatically.',
        },
      },
      required: ['formId', 'eventType', 'topicName'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
      idempotentHint: false,
    },
    handler: async (args, ctx) => {
      const clients = await initializeGoogleClients(ctx);
      await ensureAuthenticated(ctx);

      const { formId, eventType, topicName, watchId } = args as {
        formId: string;
        eventType: string;
        topicName: string;
        watchId?: string;
      };

      return withAuthRetry(
        ctx,
        async () => {
          const response = await clients.forms.forms.watches.create({
            formId,
            requestBody: {
              watch: {
                eventType,
                target: {
                  topic: { topicName },
                },
              },
              watchId: watchId || undefined,
            },
          });

          const watch = response.data;

          return {
            id: watch.id,
            eventType: watch.eventType,
            target: watch.target,
            state: watch.state,
            createTime: watch.createTime,
            expireTime: watch.expireTime,
          };
        },
        'create-watch',
      );
    },
  });
}
