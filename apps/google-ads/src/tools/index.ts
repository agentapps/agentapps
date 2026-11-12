import type { AgentApp } from '@agentapps/sdk';
import { registerAddNegativeKeywordsTool } from './add-negative-keywords.js';
import { registerEnableAdGroupTool } from './enable-ad-group.js';
import { registerEnableCampaignTool } from './enable-campaign.js';
import { registerGetAccountSummaryTool } from './get-account-summary.js';
import { registerGetPerformanceReportTool } from './get-performance-report.js';
import { registerGetSearchTermsReportTool } from './get-search-terms-report.js';
import { registerListAccessibleCustomersTool } from './list-accessible-customers.js';
import { registerListCampaignBudgetsTool } from './list-campaign-budgets.js';
import { registerListCampaignsTool } from './list-campaigns.js';
import { registerListClientAccountsTool } from './list-client-accounts.js';
import { registerPauseAdGroupTool } from './pause-ad-group.js';
import { registerPauseCampaignTool } from './pause-campaign.js';
import { registerRunGaqlQueryTool } from './run-gaql-query.js';
import { registerUpdateCampaignBudgetTool } from './update-campaign-budget.js';

/** Registers every tool. One file per tool, one line here per tool. */
export function registerTools(app: AgentApp): void {
  // Accounts
  registerListAccessibleCustomersTool(app);
  registerListClientAccountsTool(app);
  registerGetAccountSummaryTool(app);
  // Reporting (read-only)
  registerListCampaignsTool(app);
  registerListCampaignBudgetsTool(app);
  registerGetPerformanceReportTool(app);
  registerGetSearchTermsReportTool(app);
  registerRunGaqlQueryTool(app);
  // Writes (sensitive)
  registerPauseCampaignTool(app);
  registerEnableCampaignTool(app);
  registerPauseAdGroupTool(app);
  registerEnableAdGroupTool(app);
  registerUpdateCampaignBudgetTool(app);
  registerAddNegativeKeywordsTool(app);
}
