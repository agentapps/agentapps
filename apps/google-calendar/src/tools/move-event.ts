import type { AgentApp } from '@agentapps/sdk';
import { ensureAuthenticated, type GoogleCalendarEvent, googleCalendarFetch } from '../types.js';

export function registerMoveEventTool(app: AgentApp): void {
  app.tool('move-event', {
    description: 'Move a Google Calendar event to a different calendar',
    parameters: {
      type: 'object',
      properties: {
        calendarId: {
          type: 'string',
          description: 'Source calendar ID (default: primary)',
        },
        eventId: {
          type: 'string',
          description: 'ID of the event to move',
        },
        destination: {
          type: 'string',
          description: 'Destination calendar ID',
        },
      },
      required: ['eventId', 'destination'],
    },
    // Moving it back undoes it.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const tokens = await ensureAuthenticated(ctx);
      const calendarId = (args.calendarId as string) ?? 'primary';
      const eventId = args.eventId as string;
      const destination = args.destination as string;

      const query = new URLSearchParams({ destination });

      ctx.log('info', 'Moving Google Calendar event', { calendarId, eventId, destination });

      const event = await googleCalendarFetch<GoogleCalendarEvent>(
        tokens.accessToken,
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}/move`,
        { method: 'POST', query },
      );

      ctx.emit('calendar_updated', {
        action: 'moved',
        eventId: event.id,
        summary: event.summary,
        start: event.start.dateTime ?? event.start.date,
        destination,
      });

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
        },
      };
    },
  });
}
