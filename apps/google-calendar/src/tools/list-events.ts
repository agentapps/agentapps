import type { AgentApp } from '@agentapps/sdk';
import {
  ensureAuthenticated,
  type GoogleCalendarEventsResponse,
  googleCalendarFetch,
} from '../types.js';

export function registerListEventsTool(app: AgentApp): void {
  app.tool('list_events', {
    description: 'List upcoming Google Calendar events',
    parameters: {
      type: 'object',
      properties: {
        calendarId: {
          type: 'string',
          description: 'Calendar ID (default: primary)',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of events to return (default: 10, max: 100)',
        },
        timeMin: {
          type: 'string',
          description: 'Lower bound (ISO 8601) for event start times',
        },
        timeMax: {
          type: 'string',
          description: 'Upper bound (ISO 8601) for event start times',
        },
      },
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const tokens = await ensureAuthenticated(ctx);
      const calendarId = (args.calendarId as string) ?? 'primary';
      const maxResults = Math.min(Number(args.maxResults ?? 10), 100);
      const timeMin = (args.timeMin as string) ?? new Date().toISOString();

      const query = new URLSearchParams({
        maxResults: String(maxResults),
        timeMin,
        singleEvents: 'true',
        orderBy: 'startTime',
      });
      if (args.timeMax) {
        query.set('timeMax', args.timeMax as string);
      }

      ctx.log('info', 'Listing Google Calendar events', { calendarId, maxResults, timeMin });

      const data = await googleCalendarFetch<GoogleCalendarEventsResponse>(
        tokens.accessToken,
        `/calendars/${encodeURIComponent(calendarId)}/events`,
        { query },
      );

      const events = (data.items ?? []).map((e) => ({
        id: e.id,
        summary: e.summary,
        description: e.description,
        location: e.location,
        start: e.start.dateTime ?? e.start.date,
        end: e.end.dateTime ?? e.end.date,
        attendees: e.attendees?.map((a) => a.email),
        link: e.htmlLink,
        status: e.status,
      }));

      return { events, nextPageToken: data.nextPageToken, nextSyncToken: data.nextSyncToken };
    },
  });
}
