import type { AgentApp } from '@agentapps/sdk';
import { ensureAuthenticated, googleCalendarFetch } from '../types.js';

export function registerDeleteEventTool(app: AgentApp): void {
  app.tool('delete-event', {
    description: 'Delete a Google Calendar event',
    parameters: {
      type: 'object',
      properties: {
        calendarId: {
          type: 'string',
          description: 'Calendar ID (default: primary)',
        },
        eventId: {
          type: 'string',
          description: 'ID of the event to delete',
        },
      },
      required: ['eventId'],
    },
    // The event cannot be brought back through this app.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const tokens = await ensureAuthenticated(ctx);
      const calendarId = (args.calendarId as string) ?? 'primary';
      const eventId = args.eventId as string;

      ctx.log('info', 'Deleting Google Calendar event', { calendarId, eventId });

      await googleCalendarFetch<unknown>(
        tokens.accessToken,
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        { method: 'DELETE' },
      );

      ctx.emit('calendar_updated', {
        action: 'deleted',
        eventId,
      });

      return { success: true };
    },
  });
}
