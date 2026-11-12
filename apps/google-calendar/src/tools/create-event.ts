import type { AgentApp } from '@agentapps/sdk';
import { ensureAuthenticated, type GoogleCalendarEvent, googleCalendarFetch } from '../types.js';

export function registerCreateEventTool(app: AgentApp): void {
  app.tool('create_event', {
    description: 'Create a new Google Calendar event',
    parameters: {
      type: 'object',
      properties: {
        calendarId: {
          type: 'string',
          description: 'Calendar ID (default: primary)',
        },
        summary: {
          type: 'string',
          description: 'Event title',
        },
        description: {
          type: 'string',
          description: 'Event description (optional)',
        },
        location: {
          type: 'string',
          description: 'Event location (optional)',
        },
        startTime: {
          type: 'string',
          description: 'Start time (ISO 8601)',
        },
        endTime: {
          type: 'string',
          description: 'End time (ISO 8601)',
        },
        attendees: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of attendee email addresses (optional)',
        },
      },
      required: ['summary', 'startTime', 'endTime'],
    },
    handler: async (args, ctx) => {
      const tokens = await ensureAuthenticated(ctx);
      const calendarId = (args.calendarId as string) ?? 'primary';

      const body: Record<string, unknown> = {
        summary: args.summary as string,
        description: args.description as string | undefined,
        location: args.location as string | undefined,
        start: { dateTime: args.startTime as string },
        end: { dateTime: args.endTime as string },
      };

      if (args.attendees) {
        body.attendees = (args.attendees as string[]).map((email) => ({ email }));
      }

      ctx.log('info', 'Creating Google Calendar event', { calendarId, summary: body.summary });

      const event = await googleCalendarFetch<GoogleCalendarEvent>(
        tokens.accessToken,
        `/calendars/${encodeURIComponent(calendarId)}/events`,
        { method: 'POST', body },
      );

      ctx.emit('calendar_updated', {
        action: 'created',
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
