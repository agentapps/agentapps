import type { AgentApp } from '@agentapps/sdk';

export function registerCalendarUpdatedEvent(app: AgentApp): void {
  app.event('calendar_updated', {
    description: 'Emitted when a Google Calendar event is created, updated, or deleted',
  });
}
