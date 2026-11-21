import type { AgentApp } from '@agentapps/sdk';
import { registerCreateConversationTool } from './create-conversation.js';
import { registerGetConversationTool } from './get-conversation.js';
import { registerSendMessageTool } from './send-message.js';

export function registerTools(app: AgentApp): void {
  registerCreateConversationTool(app);
  registerSendMessageTool(app);
  registerGetConversationTool(app);
}
