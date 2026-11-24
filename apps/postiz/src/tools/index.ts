import type { AgentApp } from '@agentapps/sdk';
import { registerCreateDraftTool } from './create-draft.js';
import { registerDeletePostTool } from './delete-post.js';
import { registerFindNextSlotTool } from './find-next-slot.js';
import { registerGetChannelAnalyticsTool } from './get-channel-analytics.js';
import { registerGetPostAnalyticsTool } from './get-post-analytics.js';
import { registerListChannelsTool } from './list-channels.js';
import { registerListMediaTool } from './list-media.js';
import { registerListNotificationsTool } from './list-notifications.js';
import { registerListPostsTool } from './list-posts.js';
import { registerPublishPostTool } from './publish-post.js';
import { registerSchedulePostTool } from './schedule-post.js';
import { registerUploadMediaFromUrlTool } from './upload-media-from-url.js';

/** Registers every tool. One file per tool, one line here per tool. */
export function registerTools(app: AgentApp): void {
  registerListChannelsTool(app);
  registerFindNextSlotTool(app);
  registerListPostsTool(app);
  registerGetChannelAnalyticsTool(app);
  registerGetPostAnalyticsTool(app);
  registerListMediaTool(app);
  registerListNotificationsTool(app);
  registerUploadMediaFromUrlTool(app);
  registerCreateDraftTool(app);
  registerSchedulePostTool(app);
  registerPublishPostTool(app);
  registerDeletePostTool(app);
}
