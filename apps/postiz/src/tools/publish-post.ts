import type { AgentApp } from '@agentapps/sdk';
import { registerCreatePostTool } from '../lib/create-post.js';

export function registerPublishPostTool(app: AgentApp): void {
  registerCreatePostTool(app, {
    name: 'publish-post',
    type: 'now',
    description:
      'Publish a post right now on one or more channels. It becomes public immediately and cannot be taken back. Returns { success, posts: [{ postId, channelId }] }. Use schedule-post for a later time or create-draft to prepare it without publishing.',
    date: 'none',
    // A published post is public and the app cannot take it back.
    destructive: true,
  });
}
