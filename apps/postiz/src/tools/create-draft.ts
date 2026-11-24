import type { AgentApp } from '@agentapps/sdk';
import { registerCreatePostTool } from '../lib/create-post.js';

export function registerCreateDraftTool(app: AgentApp): void {
  registerCreatePostTool(app, {
    name: 'create-draft',
    type: 'draft',
    description:
      'Create a draft post in Postiz on one or more channels. Nothing is published: the draft waits in the Postiz calendar. Returns { success, posts: [{ postId, channelId }] }. Get channel ids with list-channels and media with upload-media-from-url.',
    date: 'optional',
    destructive: false,
  });
}
