import type { AgentApp } from '@agentapps/sdk';

export function registerOpenCalendarTool(app: AgentApp): void {
  app.tool('open_calendar', {
    description: 'Open Google Calendar in a browser',
    parameters: {
      type: 'object',
      properties: {},
    },
    // Opens a page for the user; changes nothing.
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
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
