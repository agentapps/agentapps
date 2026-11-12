import type { AgentApp } from '@agentapps/sdk';
import { registerAddSiteTool } from './add-site.js';
import { registerComparePeriodsTool } from './compare-periods.js';
import { registerDeleteSiteTool } from './delete-site.js';
import { registerDeleteSitemapTool } from './delete-sitemap.js';
import { registerGetSitemapTool } from './get-sitemap.js';
import { registerGetTopPagesTool } from './get-top-pages.js';
import { registerGetTopQueriesTool } from './get-top-queries.js';
import { registerInspectUrlTool } from './inspect-url.js';
import { registerListSitemapsTool } from './list-sitemaps.js';
import { registerListSitesTool } from './list-sites.js';
import { registerQuerySearchAnalyticsTool } from './query-search-analytics.js';
import { registerSubmitSitemapTool } from './submit-sitemap.js';

/** Registers every tool. One file per tool, one line here per tool. */
export function registerTools(app: AgentApp): void {
  // Properties
  registerListSitesTool(app);
  registerAddSiteTool(app);
  registerDeleteSiteTool(app);
  // Performance (Search Analytics)
  registerQuerySearchAnalyticsTool(app);
  registerGetTopQueriesTool(app);
  registerGetTopPagesTool(app);
  registerComparePeriodsTool(app);
  // Index status
  registerInspectUrlTool(app);
  // Sitemaps
  registerListSitemapsTool(app);
  registerGetSitemapTool(app);
  registerSubmitSitemapTool(app);
  registerDeleteSitemapTool(app);
}
