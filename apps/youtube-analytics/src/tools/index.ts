import type { AgentApp } from '@agentapps/sdk';
import { registerGetAudienceRetentionTool } from './get-audience-retention.js';
import { registerGetChannelReportTool } from './get-channel-report.js';
import { registerGetDemographicsTool } from './get-demographics.js';
import { registerGetTopVideosTool } from './get-top-videos.js';
import { registerGetVideoReportTool } from './get-video-report.js';
import { registerGetVideosTool } from './get-videos.js';
import { registerListChannelsTool } from './list-channels.js';
import { registerListPlaylistVideosTool } from './list-playlist-videos.js';
import { registerListPlaylistsTool } from './list-playlists.js';
import { registerListVideosTool } from './list-videos.js';
import { registerRunReportTool } from './run-report.js';
import { registerSearchVideosTool } from './search-videos.js';

/** Registers every tool. One file per tool, one line here per tool. All are read-only. */
export function registerTools(app: AgentApp): void {
  registerListChannelsTool(app);
  registerGetChannelReportTool(app);
  registerGetVideoReportTool(app);
  registerGetTopVideosTool(app);
  registerGetAudienceRetentionTool(app);
  registerGetDemographicsTool(app);
  registerRunReportTool(app);
  registerListVideosTool(app);
  registerSearchVideosTool(app);
  registerGetVideosTool(app);
  registerListPlaylistsTool(app);
  registerListPlaylistVideosTool(app);
}
