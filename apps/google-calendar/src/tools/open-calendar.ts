import type { AgentApp } from '@agentapps/sdk';

export function registerOpenCalendarTool(app: AgentApp): void {
  app.tool('open_calendar', {
    description: 'Open Google Calendar in a browser',
    parameters: {
      type: 'object',
      properties: {},
    },
    handler: async (_args, ctx) => {
      await ctx.openUrl({
        url: 'https://calendar.google.com',
        title: 'Google Calendar',
      });
      return { opened: true };
    },
  });
}
