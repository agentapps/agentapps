import type { AgentApp } from '@agentapps/sdk';
import { registerHeadlinesTool } from './headlines.js';

export function registerTools(app: AgentApp): void {
  registerHeadlinesTool(app);
}
