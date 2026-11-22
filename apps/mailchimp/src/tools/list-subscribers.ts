import type { AgentApp } from '@agentapps/sdk';
import { mailchimpRequest } from '../lib/mailchimp-client.js';
import { clampInt, shapeSubscriber } from './_helpers.js';

interface ListSubscribersResponse {
  members?: unknown[];
  total_items?: number;
}

/**
 * list-subscribers — GET /lists/{listId}/members.
 */
export function registerListSubscribersTool(app: AgentApp): void {
  app.tool('list-subscribers', {
    description:
      'List subscribers (members) of an audience from Mailchimp (GET /lists/{listId}/members). Returns { subscribers, total_items, count }. Params: listId (required), count? (1-1000, default 10).',
    parameters: {
      type: 'object',
      properties: {
        listId: { type: 'string', description: 'Id of the audience/list (required).' },
        count: {
          type: 'number',
          description: 'Max subscribers to return (1-1000, default 10).',
          default: 10,
        },
      },
      required: ['listId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      if (!a.listId || typeof a.listId !== 'string' || a.listId.trim() === '') {
        throw new Error('listId is required and must be a non-empty string.');
      }
      const listId = String(a.listId).trim();
      const count = clampInt(a.count, 1, 1000, 10);

      const res = await mailchimpRequest<ListSubscribersResponse>(
        ctx,
        `/lists/${encodeURIComponent(listId)}/members`,
        { query: { count } },
      );

      const subscribers = (res.members ?? []).map(shapeSubscriber);
      return {
        subscribers,
        total_items: typeof res.total_items === 'number' ? res.total_items : subscribers.length,
        count,
      };
    },
  });
}
