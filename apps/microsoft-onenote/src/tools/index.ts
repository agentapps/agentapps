import type { AgentApp } from '@agentapps/sdk';
import { registerAppendToPageTool } from './append-to-page.js';
import { registerCopyPageToSectionTool } from './copy-page-to-section.js';
import { registerCreateNotebookTool } from './create-notebook.js';
import { registerCreatePageTool } from './create-page.js';
import { registerCreateSectionTool } from './create-section.js';
import { registerDeletePageTool } from './delete-page.js';
import { registerGetNotebookTool } from './get-notebook.js';
import { registerGetPageTool } from './get-page.js';
import { registerGetPageContentTool } from './get-page-content.js';
import { registerListNotebooksTool } from './list-notebooks.js';
import { registerListPagesTool } from './list-pages.js';
import { registerListSectionGroupsTool } from './list-section-groups.js';
import { registerListSectionsTool } from './list-sections.js';
import { registerReplacePageContentTool } from './replace-page-content.js';
import { registerSearchPagesTool } from './search-pages.js';

export function registerTools(app: AgentApp): void {
  // Notebooks
  registerListNotebooksTool(app);
  registerGetNotebookTool(app);
  registerCreateNotebookTool(app);

  // Sections
  registerListSectionsTool(app);
  registerCreateSectionTool(app);
  registerListSectionGroupsTool(app);

  // Pages
  registerListPagesTool(app);
  registerGetPageTool(app);
  registerGetPageContentTool(app);
  registerCreatePageTool(app);
  registerDeletePageTool(app);
  registerCopyPageToSectionTool(app);

  // Editing
  registerAppendToPageTool(app);
  registerReplacePageContentTool(app);

  // Search
  registerSearchPagesTool(app);
}
