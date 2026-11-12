import type { AgentApp } from '@agentapps/sdk';
import { registerChatTool } from './chat.js';
import { registerSearchTool } from './search.js';

export function registerTools(app: AgentApp): void {
  registerSearchTool(app);
  registerChatTool(app);
}
