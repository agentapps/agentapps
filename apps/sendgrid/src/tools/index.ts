import type { AgentApp } from '@agentapps/sdk';
import { registerAddContactTool } from './add-contact.js';
import { registerCreateContactListTool } from './create-contact-list.js';
import { registerDeleteContactListTool } from './delete-contact-list.js';
import { registerDeleteContactsTool } from './delete-contacts.js';
import { registerGetContactTool } from './get-contact.js';
import { registerGetContactListTool } from './get-contact-list.js';
import { registerGetStatsTool } from './get-stats.js';
import { registerGetTemplateTool } from './get-template.js';
import { registerListContactListsTool } from './list-contact-lists.js';
import { registerListContactsTool } from './list-contacts.js';
import { registerListSenderIdentitiesTool } from './list-sender-identities.js';
import { registerListSuppressionsTool } from './list-suppressions.js';
import { registerListTemplatesTool } from './list-templates.js';
import { registerSearchContactsTool } from './search-contacts.js';
import { registerSendEmailTool } from './send-email.js';
import { registerValidateEmailTool } from './validate-email.js';

export function registerTools(app: AgentApp): void {
  registerSendEmailTool(app);
  registerListContactsTool(app);
  registerAddContactTool(app);
  registerGetContactTool(app);
  registerDeleteContactsTool(app);
  registerSearchContactsTool(app);
  registerListContactListsTool(app);
  registerCreateContactListTool(app);
  registerGetContactListTool(app);
  registerDeleteContactListTool(app);
  registerListTemplatesTool(app);
  registerGetTemplateTool(app);
  registerGetStatsTool(app);
  registerListSenderIdentitiesTool(app);
  registerListSuppressionsTool(app);
  registerValidateEmailTool(app);
}
