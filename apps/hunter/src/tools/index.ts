import type { AgentApp } from '@agentapps/sdk';
import { registerDomainSearchTool } from './domain-search.js';
import { registerEmailFinderTool } from './email-finder.js';
import { registerEmailVerifierTool } from './email-verifier.js';

export function registerTools(app: AgentApp): void {
  registerDomainSearchTool(app);
  registerEmailFinderTool(app);
  registerEmailVerifierTool(app);
}
