import type { AgentApp } from '@agentapps/sdk';
import { registerCancelPredictionTool } from './cancel-prediction.js';
import { registerGetPredictionTool } from './get-prediction.js';
import { registerListModelsTool } from './list-models.js';
import { registerListPredictionsTool } from './list-predictions.js';
import { registerRunTool } from './run.js';

export function registerTools(app: AgentApp): void {
  registerListModelsTool(app);
  registerRunTool(app);
  registerGetPredictionTool(app);
  registerCancelPredictionTool(app);
  registerListPredictionsTool(app);
}
