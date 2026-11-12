import type { AgentApp } from '@agentapps/sdk';
import { registerAddContactsToGroupTool } from './add-contacts-to-group.js';
import { registerCreateContactTool } from './create-contact.js';
import { registerCreateContactGroupTool } from './create-contact-group.js';
import { registerDeleteContactTool } from './delete-contact.js';
import { registerDeleteContactGroupTool } from './delete-contact-group.js';
import { registerGetContactTool } from './get-contact.js';
import { registerGetContactGroupTool } from './get-contact-group.js';
import { registerListContactGroupsTool } from './list-contact-groups.js';
import { registerListContactsTool } from './list-contacts.js';
import { registerRemoveContactsFromGroupTool } from './remove-contacts-from-group.js';
import { registerSearchContactsTool } from './search-contacts.js';
import { registerUpdateContactTool } from './update-contact.js';
import { registerUpdateContactGroupTool } from './update-contact-group.js';

export function registerTools(app: AgentApp): void {
  // Contact tools
  registerListContactsTool(app);
  registerGetContactTool(app);
  registerSearchContactsTool(app);
  registerCreateContactTool(app);
  registerUpdateContactTool(app);
  registerDeleteContactTool(app);

  // Contact group tools
  registerListContactGroupsTool(app);
  registerGetContactGroupTool(app);
  registerCreateContactGroupTool(app);
  registerUpdateContactGroupTool(app);
  registerDeleteContactGroupTool(app);
  registerAddContactsToGroupTool(app);
  registerRemoveContactsFromGroupTool(app);
}
