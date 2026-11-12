import type { AgentApp } from '@agentapps/sdk';
import { registerAddQuestionTool } from './add-question.js';
import { registerCreateFormTool } from './create-form.js';
import { registerCreateWatchTool } from './create-watch.js';
import { registerDeleteItemTool } from './delete-item.js';
import { registerGetFormTool } from './get-form.js';
import { registerGetResponseTool } from './get-response.js';
import { registerListFormsTool } from './list-forms.js';
import { registerListResponsesTool } from './list-responses.js';
import { registerListWatchesTool } from './list-watches.js';
import { registerUpdateFormTool } from './update-form.js';
import { registerUpdateFormInfoTool } from './update-form-info.js';
import { registerUpdateItemTool } from './update-item.js';

export function registerTools(app: AgentApp): void {
  registerCreateFormTool(app);
  registerGetFormTool(app);
  registerUpdateFormTool(app);
  registerUpdateFormInfoTool(app);
  registerAddQuestionTool(app);
  registerDeleteItemTool(app);
  registerUpdateItemTool(app);
  registerListFormsTool(app);
  registerListResponsesTool(app);
  registerGetResponseTool(app);
  registerListWatchesTool(app);
  registerCreateWatchTool(app);
}
