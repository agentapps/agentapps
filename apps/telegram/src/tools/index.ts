import type { AgentApp } from '@agentapps/sdk';
import { registerAnswerCallbackQueryTool } from './answer-callback-query.js';
import { registerDeleteMessageTool } from './delete-message.js';
import { registerEditMessageTool } from './edit-message.js';
import { registerForwardMessageTool } from './forward-message.js';
import { registerGetChatTool } from './get-chat.js';
import { registerGetChatMemberTool } from './get-chat-member.js';
import { registerGetChatMembersCountTool } from './get-chat-members-count.js';
import { registerGetMeTool } from './get-me.js';
import { registerPinMessageTool } from './pin-message.js';
import { registerSendDocumentTool } from './send-document.js';
import { registerSendLocationTool } from './send-location.js';
import { registerSendMessageTool } from './send-message.js';
import { registerSendPhotoTool } from './send-photo.js';
import { registerSetChatTitleTool } from './set-chat-title.js';

export function registerTools(app: AgentApp): void {
  registerSendMessageTool(app);
  registerSendPhotoTool(app);
  registerSendDocumentTool(app);
  registerSendLocationTool(app);
  registerEditMessageTool(app);
  registerDeleteMessageTool(app);
  registerGetChatTool(app);
  registerGetChatMemberTool(app);
  registerGetChatMembersCountTool(app);
  registerGetMeTool(app);
  registerForwardMessageTool(app);
  registerPinMessageTool(app);
  registerSetChatTitleTool(app);
  registerAnswerCallbackQueryTool(app);
}
