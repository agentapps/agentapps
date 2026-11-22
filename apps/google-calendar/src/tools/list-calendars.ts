import type { AgentApp } from '@agentapps/sdk';
import {
  ensureAuthenticated,
  type GoogleCalendarListResponse,
  googleCalendarFetch,
} from '../types.js';

export function registerListCalendarsTool(app: AgentApp): void {
  app.tool('list-calendars', {
    description: 'List Google Calendar calendars for the authenticated user',
    parameters: {
      type: 'object',
      properties: {
        maxResults: {
          type: 'number',
          description: 'Maximum number of calendars to return (default: 10, max: 100)',
        },
      },
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
      const maxResults = Math.min(Number(args.maxResults ?? 10), 100);

      const query = new URLSearchParams({ maxResults: String(maxResults) });

      ctx.log('info', 'Listing Google Calendar calendars', { maxResults });

      const data = await googleCalendarFetch<GoogleCalendarListResponse>(
        tokens.accessToken,
        '/users/me/calendarList',
        { query },
      );

      const calendars = (data.items ?? []).map((c) => ({
        id: c.id,
        summary: c.summary,
        primary: c.primary,
        timeZone: c.timeZone,
      }));

      return { calendars };
    },
  });
}
