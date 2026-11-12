import type { AgentApp } from '@agentapps/sdk';
import { registerActivateAdObjectTool } from './activate-ad-object.js';
import { registerCreateAdSetTool } from './create-ad-set.js';
import { registerCreateCampaignTool } from './create-campaign.js';
import { registerGetInsightsTool } from './get-insights.js';
import { registerListAdAccountsTool } from './list-ad-accounts.js';
import { registerListAdSetsTool } from './list-ad-sets.js';
import { registerListAdsTool } from './list-ads.js';
import { registerListCampaignsTool } from './list-campaigns.js';
import { registerListCreativesTool } from './list-creatives.js';
import { registerPauseAdObjectTool } from './pause-ad-object.js';
import { registerUpdateBudgetTool } from './update-budget.js';

/** Registers every tool. One file per tool, one line here per tool. */
export function registerTools(app: AgentApp): void {
  // Reads
  registerListAdAccountsTool(app);
  registerListCampaignsTool(app);
  registerListAdSetsTool(app);
  registerListAdsTool(app);
  registerListCreativesTool(app);
  registerGetInsightsTool(app);
  // Writes
  registerPauseAdObjectTool(app);
  registerActivateAdObjectTool(app);
  registerUpdateBudgetTool(app);
  registerCreateCampaignTool(app);
  registerCreateAdSetTool(app);
}
