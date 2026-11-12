import type { AgentApp } from '@agentapps/sdk';
import { registerAddCommentWithAttachmentTool } from './add-comment-with-attachment.js';
import { registerAddTicketCommentTool } from './add-ticket-comment.js';
import { registerCreateOrganizationTool } from './create-organization.js';
import { registerCreateTicketTool } from './create-ticket.js';
import { registerCreateUserTool } from './create-user.js';
import { registerDeleteTicketTool } from './delete-ticket.js';
import { registerGetAttachmentTool } from './get-attachment.js';
import { registerGetOrganizationTool } from './get-organization.js';
import { registerGetTicketTool } from './get-ticket.js';
import { registerGetUserTool } from './get-user.js';
import { registerGetViewTicketsTool } from './get-view-tickets.js';
import { registerListAutomationsTool } from './list-automations.js';
// Groups
import { registerListGroupsTool } from './list-groups.js';
// Organizations
import { registerListOrganizationsTool } from './list-organizations.js';
// Satisfaction Ratings
import { registerListSatisfactionRatingsTool } from './list-satisfaction-ratings.js';
// Ticket Comments
import { registerListTicketCommentsTool } from './list-ticket-comments.js';
// Tickets
import { registerListTicketsTool } from './list-tickets.js';
// Triggers & Automations
import { registerListTriggersTool } from './list-triggers.js';
// Users
import { registerListUsersTool } from './list-users.js';
// Views
import { registerListViewsTool } from './list-views.js';
// Webhooks
import { registerListWebhooksTool } from './list-webhooks.js';
import { registerSearchTicketsTool } from './search-tickets.js';
import { registerUpdateTicketTool } from './update-ticket.js';
import { registerUpdateUserTool } from './update-user.js';
// Attachments
import { registerUploadAttachmentTool } from './upload-attachment.js';

export function registerTools(app: AgentApp): void {
  // Tickets
  registerListTicketsTool(app);
  registerGetTicketTool(app);
  registerCreateTicketTool(app);
  registerUpdateTicketTool(app);
  registerDeleteTicketTool(app);
  registerSearchTicketsTool(app);

  // Ticket Comments
  registerListTicketCommentsTool(app);
  registerAddTicketCommentTool(app);
  registerAddCommentWithAttachmentTool(app);

  // Attachments
  registerUploadAttachmentTool(app);
  registerGetAttachmentTool(app);

  // Users
  registerListUsersTool(app);
  registerGetUserTool(app);
  registerCreateUserTool(app);
  registerUpdateUserTool(app);

  // Organizations
  registerListOrganizationsTool(app);
  registerGetOrganizationTool(app);
  registerCreateOrganizationTool(app);

  // Views
  registerListViewsTool(app);
  registerGetViewTicketsTool(app);

  // Groups
  registerListGroupsTool(app);

  // Triggers & Automations
  registerListTriggersTool(app);
  registerListAutomationsTool(app);

  // Webhooks
  registerListWebhooksTool(app);

  // Satisfaction Ratings
  registerListSatisfactionRatingsTool(app);
}
