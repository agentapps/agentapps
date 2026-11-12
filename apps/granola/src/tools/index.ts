import type { AgentApp } from '@agentapps/sdk';
import { registerGetNoteTool } from './get-note.js';
import { registerGetTranscriptTool } from './get-transcript.js';
import { registerListFoldersTool } from './list-folders.js';
import { registerListNotesTool } from './list-notes.js';

export function registerTools(app: AgentApp): void {
  registerListNotesTool(app);
  registerGetNoteTool(app);
  registerGetTranscriptTool(app);
  registerListFoldersTool(app);
}
