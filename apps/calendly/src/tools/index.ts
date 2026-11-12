import type { AgentApp } from '@agentapps/sdk';
import { registerCancelEventTool } from './cancel-event.js';
import { registerCreateWebhookSubscriptionTool } from './create-webhook-subscription.js';
import { registerDeleteWebhookSubscriptionTool } from './delete-webhook-subscription.js';
import { registerGetCurrentUserTool } from './get-current-user.js';
import { registerGetEventTypeTool } from './get-event-type.js';
import { registerGetInviteeTool } from './get-invitee.js';
import { registerGetScheduledEventTool } from './get-scheduled-event.js';
import { registerListAvailabilitySchedulesTool } from './list-availability-schedules.js';
import { registerListEventTypesTool } from './list-event-types.js';
import { registerListInviteesTool } from './list-invitees.js';
import { registerListRoutingFormsTool } from './list-routing-forms.js';
import { registerListScheduledEventsTool } from './list-scheduled-events.js';
import { registerListWebhookSubscriptionsTool } from './list-webhook-subscriptions.js';

export function registerTools(app: AgentApp): void {
  registerGetCurrentUserTool(app);
  registerListEventTypesTool(app);
  registerGetEventTypeTool(app);
  registerListScheduledEventsTool(app);
  registerGetScheduledEventTool(app);
  registerListInviteesTool(app);
  registerGetInviteeTool(app);
  registerCancelEventTool(app);
  registerListAvailabilitySchedulesTool(app);
  registerListWebhookSubscriptionsTool(app);
  registerCreateWebhookSubscriptionTool(app);
  registerDeleteWebhookSubscriptionTool(app);
  registerListRoutingFormsTool(app);
}
