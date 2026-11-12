import type { AgentApp } from '@agentapps/sdk';
import { registerDisableZapTool } from './disable-zap.js';
import { registerEnableZapTool } from './enable-zap.js';
import { registerExecuteActionTool } from './execute-action.js';
import { registerGetExecutionLogTool } from './get-execution-log.js';
import { registerGetZapTool } from './get-zap.js';
import { registerListActionsTool } from './list-actions.js';
import { registerListLogsTool } from './list-logs.js';
import { registerListZapsTool } from './list-zaps.js';
import { registerPreviewActionTool } from './preview-action.js';

export function registerTools(app: AgentApp): void {
  registerListActionsTool(app);
  registerExecuteActionTool(app);
  registerPreviewActionTool(app);
  registerGetExecutionLogTool(app);
  registerListLogsTool(app);
  registerListZapsTool(app);
  registerGetZapTool(app);
  registerEnableZapTool(app);
  registerDisableZapTool(app);
}
