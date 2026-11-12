import type { AgentApp } from '@agentapps/sdk';
import { registerCreateCommentTool } from './create-comment.js';
import { registerDeleteCommentTool } from './delete-comment.js';
// Export
import { registerExportImagesTool } from './export-images.js';
// Extract (CSS / Tailwind / JSON)
import { registerExtractColorsTool } from './extract-colors.js';
import { registerExtractTypographyTool } from './extract-typography.js';
// Comments
import { registerGetCommentsTool } from './get-comments.js';
import { registerGetComponentSetsTool } from './get-component-sets.js';
// Components
import { registerGetComponentsTool } from './get-components.js';
// Files / nodes
import { registerGetFileTool } from './get-file.js';
// Styles / variables (design tokens)
import { registerGetFileStylesTool } from './get-file-styles.js';
import { registerGetFileVariablesTool } from './get-file-variables.js';
import { registerGetNodeTool } from './get-node.js';
// Versions
import { registerListFileVersionsTool } from './list-file-versions.js';

/**
 * Register all 13 Figma tools on the given app instance.
 */
export function registerTools(app: AgentApp): void {
  // Files / nodes
  registerGetFileTool(app);
  registerGetNodeTool(app);

  // Styles / variables
  registerGetFileStylesTool(app);
  registerGetFileVariablesTool(app);

  // Components
  registerGetComponentsTool(app);
  registerGetComponentSetsTool(app);

  // Export
  registerExportImagesTool(app);

  // Comments
  registerGetCommentsTool(app);
  registerCreateCommentTool(app);
  registerDeleteCommentTool(app);

  // Versions
  registerListFileVersionsTool(app);

  // Extract
  registerExtractColorsTool(app);
  registerExtractTypographyTool(app);
}
