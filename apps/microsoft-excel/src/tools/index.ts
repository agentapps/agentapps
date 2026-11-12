import type { AgentApp } from '@agentapps/sdk';
import { registerAddChartTool } from './add-chart.js';
import { registerAddTableTool } from './add-table.js';
import { registerAddTableRowsTool } from './add-table-rows.js';
import { registerAddWorksheetTool } from './add-worksheet.js';
import { registerCalculateWorkbookTool } from './calculate-workbook.js';
import { registerClearRangeTool } from './clear-range.js';
import { registerCreateWorkbookTool } from './create-workbook.js';
import { registerDeleteRowsOrColumnsTool } from './delete-rows-or-columns.js';
import { registerDeleteWorksheetTool } from './delete-worksheet.js';
import { registerFormatRangeTool } from './format-range.js';
import { registerGetChartImageTool } from './get-chart-image.js';
import { registerGetWorkbookTool } from './get-workbook.js';
import { registerInsertRowsOrColumnsTool } from './insert-rows-or-columns.js';
import { registerListTablesTool } from './list-tables.js';
import { registerListWorksheetsTool } from './list-worksheets.js';
import { registerReadRangeTool } from './read-range.js';
import { registerReadUsedRangeTool } from './read-used-range.js';
import { registerRenameWorksheetTool } from './rename-worksheet.js';
import { registerSortRangeTool } from './sort-range.js';
import { registerWriteRangeTool } from './write-range.js';

export function registerTools(app: AgentApp): void {
  // Workbook
  registerCreateWorkbookTool(app);
  registerGetWorkbookTool(app);
  registerCalculateWorkbookTool(app);

  // Worksheets
  registerListWorksheetsTool(app);
  registerAddWorksheetTool(app);
  registerDeleteWorksheetTool(app);
  registerRenameWorksheetTool(app);

  // Ranges
  registerReadRangeTool(app);
  registerReadUsedRangeTool(app);
  registerWriteRangeTool(app);
  registerClearRangeTool(app);
  registerSortRangeTool(app);
  registerFormatRangeTool(app);

  // Rows and columns
  registerInsertRowsOrColumnsTool(app);
  registerDeleteRowsOrColumnsTool(app);

  // Tables
  registerListTablesTool(app);
  registerAddTableTool(app);
  registerAddTableRowsTool(app);

  // Charts
  registerAddChartTool(app);
  registerGetChartImageTool(app);
}
