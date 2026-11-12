import type { AgentApp } from '@agentapps/sdk';
import { registerAppendTextTool } from './append-text.js';
import { registerBatchUpdateDocumentTool } from './batch-update-document.js';
import { registerCreateDocumentTool } from './create-document.js';
import { registerDeleteContentTool } from './delete-content.js';
import { registerGetNamedRangesTool } from './get-named-ranges.js';
import { registerInsertImageTool } from './insert-image.js';
import { registerInsertTableTool } from './insert-table.js';
import { registerInsertTextTool } from './insert-text.js';
import { registerReadDocumentTool } from './read-document.js';
import { registerReplaceAllTextTool } from './replace-all-text.js';
import { registerUpdateDocumentTool } from './update-document.js';
import { registerUpdateTextStyleTool } from './update-text-style.js';

export function registerTools(app: AgentApp): void {
  registerCreateDocumentTool(app);
  registerReadDocumentTool(app);
  registerUpdateDocumentTool(app);
  registerInsertTextTool(app);
  registerAppendTextTool(app);
  registerBatchUpdateDocumentTool(app);
  registerDeleteContentTool(app);
  registerInsertTableTool(app);
  registerInsertImageTool(app);
  registerReplaceAllTextTool(app);
  registerGetNamedRangesTool(app);
  registerUpdateTextStyleTool(app);
}
