import type { AgentApp } from '@agentapps/sdk';
import { registerCreatePostTool } from '../lib/create-post.js';

export function registerCreateDraftTool(app: AgentApp): void {
  registerCreatePostTool(app, {
    name: 'create-draft',
    draft: true,
    destructive: false,
    description:
      'Save a draft in the planner of a brand, on the date given; Metricool does not publish a draft until someone turns it into a scheduled post in Metricool. Returns { success, id, date, timezone, networks }. Takes the same arguments as schedule-post.',
  });
}
