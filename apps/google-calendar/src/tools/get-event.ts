import type { AgentApp } from '@agentapps/sdk';
import { ensureAuthenticated, type GoogleCalendarEvent, googleCalendarFetch } from '../types.js';

export function registerGetEventTool(app: AgentApp): void {
  app.tool('get_event', {
    description: 'Get a single Google Calendar event by ID',
    parameters: {
      type: 'object',
      properties: {
        calendarId: {
          type: 'string',
          description: 'Calendar ID (default: primary)',
        },
        eventId: {
          type: 'string',
          description: 'ID of the event to retrieve',
        },
      },
      required: ['eventId'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const tokens = await ensureAuthenticated(ctx);
      const calendarId = (args.calendarId as string) ?? 'primary';
      const eventId = args.eventId as string;

      ctx.log('info', 'Getting Google Calendar event', { calendarId, eventId });

      const event = await googleCalendarFetch<GoogleCalendarEvent>(
        tokens.accessToken,
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      );

      return {
        event: {
          id: event.id,
          summary: event.summary,
          description: event.description,
          location: event.location,
          start: event.start.dateTime ?? event.start.date,
          end: event.end.dateTime ?? event.end.date,
          attendees: event.attendees?.map((a) => a.email),
          link: event.htmlLink,
          status: event.status,
          created: event.created,
          updated: event.updated,
        },
      };
    },
  });
}
