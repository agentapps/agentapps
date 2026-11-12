import type { AgentApp } from '@agentapps/sdk';
import { registerClickTool } from './click.js';
import { registerEvaluateTool } from './evaluate.js';
import { registerFillFormTool } from './fill-form.js';
import { registerGetContentTool } from './get-content.js';
import { registerNavigateTool } from './navigate.js';
import { registerNavigateBackTool } from './navigate-back.js';
import { registerNetworkRequestsTool } from './network-requests.js';
import { registerPressKeyTool } from './press-key.js';
import { registerSessionCloseTool } from './session-close.js';
import { registerSessionCreateTool } from './session-create.js';
import { registerSessionListTool } from './session-list.js';
import { registerSnapshotTool } from './snapshot.js';
import { registerTakeScreenshotTool } from './take-screenshot.js';
import { registerTypeTool } from './type.js';
import { registerWaitForTool } from './wait-for.js';

export function registerTools(app: AgentApp): void {
  registerSessionCreateTool(app);
  registerSessionListTool(app);
  registerSessionCloseTool(app);
  registerNavigateTool(app);
  registerNavigateBackTool(app);
  registerSnapshotTool(app);
  registerGetContentTool(app);
  registerClickTool(app);
  registerTypeTool(app);
  registerFillFormTool(app);
  registerEvaluateTool(app);
  registerPressKeyTool(app);
  registerWaitForTool(app);
  registerTakeScreenshotTool(app);
  registerNetworkRequestsTool(app);
}
