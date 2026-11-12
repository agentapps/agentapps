import type { AgentApp } from '@agentapps/sdk';
import { registerGetDocsTool } from './get-docs.js';
import { registerResolveLibraryTool } from './resolve-library.js';

export function registerTools(app: AgentApp): void {
  registerResolveLibraryTool(app);
  registerGetDocsTool(app);
}
