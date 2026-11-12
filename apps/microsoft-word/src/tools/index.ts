import type { AgentApp } from '@agentapps/sdk';
import { registerAppendParagraphsTool } from './append-paragraphs.js';
import { registerConvertToPdfTool } from './convert-to-pdf.js';
import { registerCreateDocumentTool } from './create-document.js';
import { registerDeleteParagraphTool } from './delete-paragraph.js';
import { registerGetCommentsTool } from './get-comments.js';
import { registerGetDocumentInfoTool } from './get-document-info.js';
import { registerInsertImageTool } from './insert-image.js';
import { registerInsertPageBreakTool } from './insert-page-break.js';
import { registerInsertTableTool } from './insert-table.js';
import { registerListParagraphsTool } from './list-paragraphs.js';
import { registerReadDocumentTool } from './read-document.js';
import { registerReplaceTextTool } from './replace-text.js';
import { registerUpdateDocumentPropertiesTool } from './update-document-properties.js';

export function registerTools(app: AgentApp): void {
  // Read
  registerReadDocumentTool(app);
  registerGetDocumentInfoTool(app);
  registerListParagraphsTool(app);
  registerGetCommentsTool(app);

  // Create
  registerCreateDocumentTool(app);

  // Edit
  registerReplaceTextTool(app);
  registerAppendParagraphsTool(app);
  registerDeleteParagraphTool(app);
  registerInsertTableTool(app);
  registerInsertPageBreakTool(app);
  registerInsertImageTool(app);
  registerUpdateDocumentPropertiesTool(app);
  registerConvertToPdfTool(app);
}
