import type { AgentApp } from '@agentapps/sdk';
import { registerTopTool } from '../lib/top-tool.js';

export function registerGetTopQueriesTool(app: AgentApp): void {
  registerTopTool(app, 'query');
}
