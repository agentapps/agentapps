import type { AgentApp } from '@agentapps/sdk';
import { registerTopTool } from '../lib/top-tool.js';

export function registerGetTopPagesTool(app: AgentApp): void {
  registerTopTool(app, 'page');
}
