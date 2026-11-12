import type { AgentApp } from '@agentapps/sdk';
// Associations
import { registerCreateAssociationTool } from './create-association.js';
// Companies
import { registerCreateCompanyTool } from './create-company.js';
// Contacts
import { registerCreateContactTool } from './create-contact.js';
// Deals
import { registerCreateDealTool } from './create-deal.js';
// Engagements
import { registerCreateEngagementTool } from './create-engagement.js';
// Tickets
import { registerCreateTicketTool } from './create-ticket.js';
import { registerDeleteAssociationTool } from './delete-association.js';
import { registerDeleteCompanyTool } from './delete-company.js';
import { registerDeleteContactTool } from './delete-contact.js';
import { registerDeleteDealTool } from './delete-deal.js';
import { registerDeleteEngagementTool } from './delete-engagement.js';
import { registerDeleteTicketTool } from './delete-ticket.js';
import { registerGetCompanyTool } from './get-company.js';
import { registerGetContactTool } from './get-contact.js';
import { registerGetConversationTool } from './get-conversation.js';
import { registerGetDealTool } from './get-deal.js';
import { registerGetEngagementTool } from './get-engagement.js';
import { registerGetListTool } from './get-list.js';
import { registerGetPipelineTool } from './get-pipeline.js';
import { registerGetTicketTool } from './get-ticket.js';
import { registerListAssociationsTool } from './list-associations.js';
import { registerListCompaniesTool } from './list-companies.js';
import { registerListContactsTool } from './list-contacts.js';
// Conversations
import { registerListConversationsTool } from './list-conversations.js';
import { registerListDealsTool } from './list-deals.js';
import { registerListEngagementsTool } from './list-engagements.js';
// Lists
import { registerListListsTool } from './list-lists.js';
// Pipelines
import { registerListPipelinesTool } from './list-pipelines.js';
import { registerListTicketsTool } from './list-tickets.js';
// Search
import { registerSearchTool } from './search.js';
import { registerSendConversationMessageTool } from './send-conversation-message.js';
import { registerUpdateCompanyTool } from './update-company.js';
import { registerUpdateContactTool } from './update-contact.js';
import { registerUpdateDealTool } from './update-deal.js';
import { registerUpdateTicketTool } from './update-ticket.js';

export function registerTools(app: AgentApp): void {
  // Search
  registerSearchTool(app);

  // Contacts
  registerCreateContactTool(app);
  registerGetContactTool(app);
  registerListContactsTool(app);
  registerUpdateContactTool(app);
  registerDeleteContactTool(app);

  // Companies
  registerCreateCompanyTool(app);
  registerGetCompanyTool(app);
  registerListCompaniesTool(app);
  registerUpdateCompanyTool(app);
  registerDeleteCompanyTool(app);

  // Deals
  registerCreateDealTool(app);
  registerGetDealTool(app);
  registerListDealsTool(app);
  registerUpdateDealTool(app);
  registerDeleteDealTool(app);

  // Tickets
  registerCreateTicketTool(app);
  registerGetTicketTool(app);
  registerListTicketsTool(app);
  registerUpdateTicketTool(app);
  registerDeleteTicketTool(app);

  // Associations
  registerCreateAssociationTool(app);
  registerDeleteAssociationTool(app);
  registerListAssociationsTool(app);

  // Pipelines
  registerListPipelinesTool(app);
  registerGetPipelineTool(app);

  // Engagements
  registerCreateEngagementTool(app);
  registerGetEngagementTool(app);
  registerListEngagementsTool(app);
  registerDeleteEngagementTool(app);

  // Lists
  registerListListsTool(app);
  registerGetListTool(app);

  // Conversations
  registerListConversationsTool(app);
  registerGetConversationTool(app);
  registerSendConversationMessageTool(app);
}
