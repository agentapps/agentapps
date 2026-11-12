import type { AgentApp } from '@agentapps/sdk';
import { type SentryEvent, sentryRequest } from '../types.js';

export function registerGetEventTool(app: AgentApp): void {
  app.tool('get_event', {
    description: 'Get detailed information about a specific event including full stack trace.',
    parameters: {
      type: 'object',
      properties: {
        organization: { type: 'string', description: 'Organization slug.' },
        project: { type: 'string', description: 'Project slug.' },
        eventId: { type: 'string', description: 'The event ID.' },
      },
      required: ['project', 'eventId'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const apiKey = await ctx.systemSecret('API_KEY');
      if (!apiKey) throw new Error('Missing API_KEY system secret.');
      const org = (args.organization as string) || (await ctx.systemSecret('ORGANIZATION'));
      if (!org) throw new Error('Organization is required.');

      const project = args.project as string;
      const eventId = args.eventId as string;

      const event = await sentryRequest<SentryEvent>(
        `/projects/${org}/${project}/events/${eventId}/`,
        apiKey,
      );

      let stackTrace = null;
      if (event.entries) {
        const exEntry = event.entries.find((e) => e.type === 'exception');
        if (exEntry?.data?.values) {
          stackTrace = exEntry.data.values.map((ex) => ({
            type: ex.type,
            value: ex.value,
            stacktrace: ex.stacktrace?.frames?.map((f) => ({
              filename: f.filename,
              function: f.function,
              lineNo: f.lineNo,
              colNo: f.colNo,
              inApp: f.inApp,
            })),
          }));
        }
      }

      const breadcrumbsEntry = event.entries?.find((e) => e.type === 'breadcrumbs');
      const breadcrumbs = (breadcrumbsEntry?.data as { values?: unknown[] })?.values?.slice(-10);

      return {
        eventID: event.eventID,
        title: event.title,
        message: event.message,
        dateCreated: event.dateCreated,
        user: event.user,
        tags: event.tags,
        stackTrace,
        breadcrumbs,
      };
    },
  });
}
