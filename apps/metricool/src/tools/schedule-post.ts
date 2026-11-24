import type { AgentApp } from '@agentapps/sdk';
import { registerCreatePostTool } from '../lib/create-post.js';

export function registerSchedulePostTool(app: AgentApp): void {
  registerCreatePostTool(app, {
    name: 'schedule-post',
    draft: false,
    // A published post is public and this app cannot take it back (METRICOOL-REQ-11).
    destructive: true,
    description:
      'Schedule a post on one or more networks of a brand; Metricool publishes it at the date, in public. Returns { success, id, date, timezone, networks }. X ("twitter") allows 280 characters and Bluesky 300. Use get-best-times to choose the date, create-draft to save without publishing, and delete-post to cancel before the date.',
  });
}
