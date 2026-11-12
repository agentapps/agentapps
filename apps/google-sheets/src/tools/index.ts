import type { AgentApp } from '@agentapps/sdk';
import { registerAddSheetTool } from './add-sheet.js';
import { registerAppendValuesTool } from './append-values.js';
import { registerBatchUpdateTool } from './batch-update.js';
import { registerBatchUpdateValuesTool } from './batch-update-values.js';
import { registerClearValuesTool } from './clear-values.js';
import { registerCopySheetTool } from './copy-sheet.js';
import { registerCreateSpreadsheetTool } from './create-spreadsheet.js';
import { registerDeleteSheetTool } from './delete-sheet.js';
import { registerExportSheetTool } from './export-sheet.js';
import { registerGetSpreadsheetTool } from './get-spreadsheet.js';
import { registerListSheetTabsTool } from './list-sheet-tabs.js';
import { registerReadSheetRangeTool } from './read-sheet-range.js';
import { registerReadSpreadsheetTool } from './read-spreadsheet.js';
import { registerWriteValuesTool } from './write-values.js';

export function registerTools(app: AgentApp): void {
  registerCreateSpreadsheetTool(app);
  registerGetSpreadsheetTool(app);
  registerWriteValuesTool(app);
  registerAppendValuesTool(app);
  registerBatchUpdateTool(app);
  registerBatchUpdateValuesTool(app);
  registerClearValuesTool(app);
  registerReadSpreadsheetTool(app);
  registerReadSheetRangeTool(app);
  registerListSheetTabsTool(app);
  registerAddSheetTool(app);
  registerDeleteSheetTool(app);
  registerCopySheetTool(app);
  registerExportSheetTool(app);
}
