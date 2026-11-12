import type { AgentApp } from '@agentapps/sdk';
import { ensureAuthenticated, type GoogleCalendarEvent, googleCalendarFetch } from '../types.js';

export function registerUpdateEventTool(app: AgentApp): void {
  app.tool('update_event', {
    description: 'Update an existing Google Calendar event',
    parameters: {
      type: 'object',
      properties: {
        calendarId: {
          type: 'string',
          description: 'Calendar ID (default: primary)',
        },
        eventId: {
          type: 'string',
          description: 'ID of the event to update',
        },
        summary: {
          type: 'string',
          description: 'New title (optional)',
        },
        description: {
          type: 'string',
          description: 'New description (optional)',
        },
        location: {
          type: 'string',
          description: 'New location (optional)',
        },
        startTime: {
          type: 'string',
          description: 'New start time (ISO 8601, optional)',
        },
        endTime: {
          type: 'string',
          description: 'New end time (ISO 8601, optional)',
        },
        attendees: {
          type: 'array',
          items: { type: 'string' },
          description: 'New attendee list (optional)',
        },
      },
      required: ['eventId'],
    },
    handler: async (args, ctx) => {
      const tokens = await ensureAuthenticated(ctx);
      const calendarId = (args.calendarId as string) ?? 'primary';
      const eventId = args.eventId as string;

      ctx.log('info', 'Updating Google Calendar event', { calendarId, eventId });

      // Google Calendar API requires the full event body on PUT. Fetch the
      // current event first and overwrite only the fields the user supplied.
      const current = await googleCalendarFetch<GoogleCalendarEvent>(
        tokens.accessToken,
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      );

      const body: Record<string, unknown> = {
        summary: args.summary !== undefined ? (args.summary as string) : current.summary,
        description:
          args.description !== undefined ? (args.description as string) : current.description,
        location: args.location !== undefined ? (args.location as string) : current.location,
        start:
          args.startTime !== undefined ? { dateTime: args.startTime as string } : current.start,
        end: args.endTime !== undefined ? { dateTime: args.endTime as string } : current.end,
        attendees: current.attendees,
      };

      if (args.attendees) {
        body.attendees = (args.attendees as string[]).map((email) => ({ email }));
      }

      const event = await googleCalendarFetch<GoogleCalendarEvent>(
        tokens.accessToken,
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        { method: 'PUT', body },
      );

      ctx.emit('calendar_updated', {
        action: 'updated',
        eventId: event.id,
        summary: event.summary,
        start: event.start.dateTime ?? event.start.date,
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
