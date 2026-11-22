import type { AgentApp } from '@agentapps/sdk';
import { ensureAuthenticated, googleCalendarFetch } from '../types.js';

interface GoogleCalendar {
  id: string;
  summary?: string;
  description?: string;
  timeZone?: string;
}

export function registerCreateCalendarTool(app: AgentApp): void {
  app.tool('create-calendar', {
    description: 'Create a new Google Calendar',
    parameters: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'Title of the new calendar',
        },
        description: {
          type: 'string',
          description: 'Description of the new calendar (optional)',
        },
        timeZone: {
          type: 'string',
          description: 'IANA time zone (e.g. "America/New_York", optional)',
        },
      },
      required: ['summary'],
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

      const body: Record<string, unknown> = {
        summary: args.summary as string,
      };
      if (args.description !== undefined) {
        body.description = args.description as string;
      }
      if (args.timeZone !== undefined) {
        body.timeZone = args.timeZone as string;
      }

      ctx.log('info', 'Creating new Google Calendar', { summary: body.summary });

      const calendar = await googleCalendarFetch<GoogleCalendar>(tokens.accessToken, '/calendars', {
        method: 'POST',
        body,
      });

      return {
        calendar: {
          id: calendar.id,
          summary: calendar.summary,
          description: calendar.description,
          timeZone: calendar.timeZone,
        },
      };
    },
  });
}
