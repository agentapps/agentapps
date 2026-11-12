import type { AgentApp } from '@agentapps/sdk';
import { registerAssignConversationTool } from './assign-conversation.js';
import { registerGetContactTool } from './get-contact.js';
import { registerGetConversationTool } from './get-conversation.js';
import { registerGetWorkspaceTool } from './get-workspace.js';
import { registerListAdminsTool } from './list-admins.js';
import { registerListTagsTool } from './list-tags.js';
import { registerListTeamsTool } from './list-teams.js';
import { registerReplyConversationTool } from './reply-conversation.js';
import { registerSearchContactsTool } from './search-contacts.js';
import { registerSearchConversationsTool } from './search-conversations.js';
import { registerTagConversationTool } from './tag-conversation.js';
import { registerUpdateConversationTool } from './update-conversation.js';

export function registerTools(app: AgentApp): void {
  registerGetWorkspaceTool(app);
  registerSearchConversationsTool(app);
  registerGetConversationTool(app);
  registerReplyConversationTool(app);
  registerAssignConversationTool(app);
  registerUpdateConversationTool(app);
  registerTagConversationTool(app);
  registerListAdminsTool(app);
  registerListTeamsTool(app);
  registerListTagsTool(app);
  registerGetContactTool(app);
  registerSearchContactsTool(app);
}
