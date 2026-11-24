import type { AgentApp } from '@agentapps/sdk';
import { registerCreatePostTool } from '../lib/create-post.js';

export function registerSchedulePostTool(app: AgentApp): void {
  registerCreatePostTool(app, {
    name: 'schedule-post',
    type: 'schedule',
    description:
      'Schedule a post on one or more channels: Postiz publishes it publicly at the given date. Returns { success, posts: [{ postId, channelId }] }. Until then it can be removed with delete-post; once published it cannot be taken back. Use find-next-slot for a free time and list-channels for the channel ids.',
    date: 'required',
    // A published post is public and the app cannot take it back.
    destructive: true,
  });
}
