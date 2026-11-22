import type { AgentApp } from '@agentapps/sdk';
import { ensureAuthenticated, type GoogleCalendarEvent, googleCalendarFetch } from '../types.js';

export function registerQuickAddEventTool(app: AgentApp): void {
  app.tool('quick-add-event', {
    description:
      'Quick-add a Google Calendar event from a text string (e.g. "Lunch with Alice tomorrow at noon")',
    parameters: {
      type: 'object',
      properties: {
        calendarId: {
          type: 'string',
          description: 'Calendar ID (default: primary)',
        },
        text: {
          type: 'string',
          description: 'Text describing the event (Google parses date/time/title automatically)',
        },
      },
      required: ['text'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const tokens = await ensureAuthenticated(ctx);
      const calendarId = (args.calendarId as string) ?? 'primary';
      const text = args.text as string;

      const query = new URLSearchParams({ text });

      ctx.log('info', 'Quick-adding Google Calendar event', { calendarId, text });

      const event = await googleCalendarFetch<GoogleCalendarEvent>(
        tokens.accessToken,
        `/calendars/${encodeURIComponent(calendarId)}/events/quickAdd`,
        { method: 'POST', query },
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
