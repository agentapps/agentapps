import type { AgentApp } from '@agentapps/sdk';
import { registerDownloadRecordingTool } from './download-recording.js';
import { registerGetCurrentUserTool } from './get-current-user.js';
import { registerGetNoteTool } from './get-note.js';
import { registerGetTranscriptTool } from './get-transcript.js';
import { registerListNotesTool } from './list-notes.js';
import { registerListTagsTool } from './list-tags.js';
import { registerSearchNotesTool } from './search-notes.js';

export function registerTools(app: AgentApp): void {
  registerListNotesTool(app);
  registerGetNoteTool(app);
  registerGetTranscriptTool(app);
  registerSearchNotesTool(app);
  registerListTagsTool(app);
  registerGetCurrentUserTool(app);
  registerDownloadRecordingTool(app);
}
