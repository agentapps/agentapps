import type { AgentApp } from '@agentapps/sdk';
import { registerGetSubscriptionTool } from './get-subscription.js';
import { registerGetVoiceTool } from './get-voice.js';
import { registerListVoicesTool } from './list-voices.js';
import { registerTextToSpeechTool } from './text-to-speech.js';

export function registerTools(app: AgentApp): void {
  registerTextToSpeechTool(app);
  registerListVoicesTool(app);
  registerGetVoiceTool(app);
  registerGetSubscriptionTool(app);
}
