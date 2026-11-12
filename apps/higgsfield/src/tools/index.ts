import type { AgentApp } from '@agentapps/sdk';
import { registerCancelPredictionTool } from './cancel-prediction.js';
import { registerGetPredictionTool } from './get-prediction.js';
import { registerImageToVideoTool } from './image-to-video.js';
import { registerListModelsTool } from './list-models.js';
import { registerRunTool } from './run.js';
import { registerSoulGenerateTool } from './soul-generate.js';
import { registerTextToImageTool } from './text-to-image.js';
import { registerTextToVideoTool } from './text-to-video.js';

export function registerTools(app: AgentApp): void {
  registerRunTool(app);
  registerTextToImageTool(app);
  registerImageToVideoTool(app);
  registerTextToVideoTool(app);
  registerSoulGenerateTool(app);
  registerGetPredictionTool(app);
  registerCancelPredictionTool(app);
  registerListModelsTool(app);
}
