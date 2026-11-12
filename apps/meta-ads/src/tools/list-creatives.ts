import type { AgentApp } from '@agentapps/sdk';
import { asArgs, readAccountId, readInt, readString } from '../lib/args.js';
import { apiRequest } from '../lib/client.js';
import { compact, type GraphPage, listResult } from '../lib/results.js';
import { READ_ONLY } from './annotations.js';

interface RawCreative {
  id: string;
  name?: string;
  status?: string;
  title?: string;
  body?: string;
  object_type?: string;
  thumbnail_url?: string;
  call_to_action_type?: string;
  effective_object_story_id?: string;
}

export function registerListCreativesTool(app: AgentApp): void {
  app.tool('list-creatives', {
    description:
      'List the ad creatives of one ad account. Returns items with id, name, status, title, body, objectType, thumbnailUrl, callToAction and storyId (the Page post the creative runs as). Use list-ads to see which ads use a creative. Max 100 per page; page with `after`.',
    parameters: {
      type: 'object',
      properties: {
        accountId: {
          type: ['string', 'number'],
          description: 'Ad account id, act_<digits> or just the digits.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'Creatives per page (default 50, max 100).',
        },
        after: { type: 'string', description: 'The nextCursor from a previous call.' },
      },
      required: ['accountId'],
    },
    annotations: READ_ONLY,
    handler: async (args, ctx) => {
      const a = asArgs(args);
      const accountId = readAccountId(a) as string;
      const page = await apiRequest<GraphPage<RawCreative>>(
        'GET',
        `/${accountId}/adcreatives`,
        ctx,
        {
          params: {
            fields: [
              'id',
              'name',
              'status',
              'title',
              'body',
              'object_type',
              'thumbnail_url',
              'call_to_action_type',
              'effective_object_story_id',
            ],
            limit: readInt(a, 'limit', { min: 1, max: 100, fallback: 50 }),
            after: readString(a, 'after', { max: 500 }),
          },
        },
      );
      const items = (page.data ?? []).map((c) =>
        compact({
          id: c.id,
          name: c.name,
          status: c.status,
          title: c.title,
          body: c.body,
          objectType: c.object_type,
          thumbnailUrl: c.thumbnail_url,
          callToAction: c.call_to_action_type,
          storyId: c.effective_object_story_id,
        }),
      );
      return listResult(page, items);
    },
  });
}
