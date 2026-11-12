import type { AgentApp } from '@agentapps/sdk';
import { registerBashTool } from './bash.js';

export function registerTools(app: AgentApp): void {
  registerBashTool(app);
}
