import type { AgentApp } from '@agentapps/sdk';
import { ensureAuthenticated, googleCalendarFetch } from '../types.js';

interface FreeBusyResponse {
  kind: string;
  timeMin: string;
  timeMax: string;
  calendars: Record<
    string,
    {
      busy: { start: string; end: string }[];
      errors?: { domain: string; reason: string }[];
    }
  >;
}

export function registerGetFreebusyTool(app: AgentApp): void {
  app.tool('get-freebusy', {
    description: 'Query free/busy information for one or more calendars',
    parameters: {
      type: 'object',
      properties: {
        timeMin: {
          type: 'string',
          description: 'Start of the time range (ISO 8601)',
        },
        timeMax: {
          type: 'string',
          description: 'End of the time range (ISO 8601)',
        },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Calendar ID to query',
              },
            },
            required: ['id'],
          },
          description: 'List of calendars to query (e.g. [{"id": "primary"}])',
        },
        timeZone: {
          type: 'string',
          description: 'IANA time zone for the query (optional)',
        },
      },
      required: ['timeMin', 'timeMax', 'items'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const tokens = await ensureAuthenticated(ctx);

      const body: Record<string, unknown> = {
        timeMin: args.timeMin as string,
        timeMax: args.timeMax as string,
        items: args.items as { id: string }[],
      };
      if (args.timeZone !== undefined) {
        body.timeZone = args.timeZone as string;
      }

      ctx.log('info', 'Querying free/busy information', {
        timeMin: body.timeMin,
        timeMax: body.timeMax,
      });

      const data = await googleCalendarFetch<FreeBusyResponse>(tokens.accessToken, '/freeBusy', {
        method: 'POST',
        body,
      });

      return {
        timeMin: data.timeMin,
        timeMax: data.timeMax,
        calendars: data.calendars,
      };
    },
  });
}
