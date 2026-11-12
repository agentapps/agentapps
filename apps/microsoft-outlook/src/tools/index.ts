import type { AgentApp } from '@agentapps/sdk';
import { registerCreateDraftTool } from './create-draft.js';
import { registerCreateFolderTool } from './create-folder.js';
import { registerDeleteDraftTool } from './delete-draft.js';
import { registerDeleteFolderTool } from './delete-folder.js';
import { registerDeleteMessageTool } from './delete-message.js';
import { registerForwardMessageTool } from './forward-message.js';
import { registerGetAttachmentTool } from './get-attachment.js';
import { registerGetMessageTool } from './get-message.js';
import { registerListDraftsTool } from './list-drafts.js';
import { registerListFoldersTool } from './list-folders.js';
import { registerListMessagesTool } from './list-messages.js';
import { registerListRulesTool } from './list-rules.js';
import { registerModifyMessageTool } from './modify-message.js';
import { registerMoveMessageTool } from './move-message.js';
import { registerReplyMessageTool } from './reply-message.js';
import { registerSearchMessagesTool } from './search-messages.js';
import { registerSendDraftTool } from './send-draft.js';
import { registerSendMessageTool } from './send-message.js';
import { registerStoreAttachmentTool } from './store-attachment.js';
import { registerUpdateDraftTool } from './update-draft.js';

export function registerTools(app: AgentApp): void {
  // Messages
  registerListMessagesTool(app);
  registerGetMessageTool(app);
  registerSendMessageTool(app);
  registerReplyMessageTool(app);
  registerForwardMessageTool(app);
  registerSearchMessagesTool(app);
  registerModifyMessageTool(app);
  registerMoveMessageTool(app);
  registerDeleteMessageTool(app);

  // Drafts
  registerListDraftsTool(app);
  registerCreateDraftTool(app);
  registerUpdateDraftTool(app);
  registerSendDraftTool(app);
  registerDeleteDraftTool(app);

  // Folders
  registerListFoldersTool(app);
  registerCreateFolderTool(app);
  registerDeleteFolderTool(app);

  // Attachments
  registerGetAttachmentTool(app);
  registerStoreAttachmentTool(app);

  // Rules
  registerListRulesTool(app);
}
