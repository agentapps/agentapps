import type { AgentApp } from '@agentapps/sdk';
import { registerAddTagToContactTool } from './add-tag-to-contact.js';
import { registerCreateContactTool } from './create-contact.js';
import { registerCreateDealTool } from './create-deal.js';
import { registerDeleteContactTool } from './delete-contact.js';
import { registerGetCampaignTool } from './get-campaign.js';
import { registerGetContactTool } from './get-contact.js';
import { registerGetDealTool } from './get-deal.js';
import { registerListCampaignsTool } from './list-campaigns.js';
import { registerListContactsTool } from './list-contacts.js';
import { registerListDealsTool } from './list-deals.js';
import { registerListListsTool } from './list-lists.js';
import { registerListTagsTool } from './list-tags.js';
import { registerSubscribeContactToListTool } from './subscribe-contact-to-list.js';
import { registerUpdateContactTool } from './update-contact.js';

export function registerTools(app: AgentApp): void {
  registerListContactsTool(app);
  registerGetContactTool(app);
  registerCreateContactTool(app);
  registerUpdateContactTool(app);
  registerDeleteContactTool(app);
  registerListListsTool(app);
  registerSubscribeContactToListTool(app);
  registerListCampaignsTool(app);
  registerGetCampaignTool(app);
  registerListDealsTool(app);
  registerGetDealTool(app);
  registerCreateDealTool(app);
  registerListTagsTool(app);
  registerAddTagToContactTool(app);
}
