import type { AgentApp } from '@agentapps/sdk';
import { registerActivateCampaignTool } from './activate-campaign.js';
import { registerActivateCampaignGroupTool } from './activate-campaign-group.js';
import { registerActivateCreativeTool } from './activate-creative.js';
import { registerGetAdAnalyticsTool } from './get-ad-analytics.js';
import { registerGetCampaignTool } from './get-campaign.js';
import { registerListAdAccountsTool } from './list-ad-accounts.js';
import { registerListCampaignGroupsTool } from './list-campaign-groups.js';
import { registerListCampaignsTool } from './list-campaigns.js';
import { registerListCreativesTool } from './list-creatives.js';
import { registerPauseCampaignTool } from './pause-campaign.js';
import { registerPauseCampaignGroupTool } from './pause-campaign-group.js';
import { registerPauseCreativeTool } from './pause-creative.js';
import { registerUpdateCampaignBudgetTool } from './update-campaign-budget.js';
import { registerUpdateCampaignGroupBudgetTool } from './update-campaign-group-budget.js';

/** Registers every tool. One file per tool, one line here per tool. */
export function registerTools(app: AgentApp): void {
  // Reads
  registerListAdAccountsTool(app);
  registerListCampaignGroupsTool(app);
  registerListCampaignsTool(app);
  registerGetCampaignTool(app);
  registerListCreativesTool(app);
  registerGetAdAnalyticsTool(app);
  // Writes: pausing stops spend; activating and budgets affect spend
  registerPauseCampaignTool(app);
  registerActivateCampaignTool(app);
  registerUpdateCampaignBudgetTool(app);
  registerPauseCampaignGroupTool(app);
  registerActivateCampaignGroupTool(app);
  registerUpdateCampaignGroupBudgetTool(app);
  registerPauseCreativeTool(app);
  registerActivateCreativeTool(app);
}
