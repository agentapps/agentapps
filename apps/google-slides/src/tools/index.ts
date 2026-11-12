import type { AgentApp } from '@agentapps/sdk';
import { registerAddImageTool } from './add-image.js';
import { registerAddSlideTool } from './add-slide.js';
import { registerAddTextBoxTool } from './add-text-box.js';
import { registerBatchUpdateTool } from './batch-update.js';
import { registerCreatePresentationTool } from './create-presentation.js';
import { registerDeleteSlideTool } from './delete-slide.js';
import { registerDuplicateSlideTool } from './duplicate-slide.js';
import { registerGetSlideTool } from './get-slide.js';
import { registerReadPresentationTool } from './read-presentation.js';
import { registerReadSlideTool } from './read-slide.js';
import { registerReplaceTextTool } from './replace-text.js';
import { registerUpdateSlideTool } from './update-slide.js';

export function registerTools(app: AgentApp): void {
  registerReadPresentationTool(app);
  registerReadSlideTool(app);
  registerCreatePresentationTool(app);
  registerAddSlideTool(app);
  registerUpdateSlideTool(app);
  registerDeleteSlideTool(app);
  registerBatchUpdateTool(app);
  registerReplaceTextTool(app);
  registerDuplicateSlideTool(app);
  registerAddTextBoxTool(app);
  registerAddImageTool(app);
  registerGetSlideTool(app);
}
