import type { AgentApp } from '@agentapps/sdk';
import { registerAddUpdateTool } from './add-update.js';
import { registerCreateBoardTool } from './create-board.js';
import { registerCreateGroupTool } from './create-group.js';
import { registerCreateItemTool } from './create-item.js';
import { registerDeleteItemTool } from './delete-item.js';
import { registerGetBoardTool } from './get-board.js';
import { registerGetItemTool } from './get-item.js';
import { registerGetMeTool } from './get-me.js';
import { registerListBoardsTool } from './list-boards.js';
import { registerListColumnsTool } from './list-columns.js';
import { registerListGroupsTool } from './list-groups.js';
import { registerListItemsTool } from './list-items.js';
import { registerListUpdatesTool } from './list-updates.js';
import { registerSearchItemsTool } from './search-items.js';
import { registerUpdateItemTool } from './update-item.js';

export function registerTools(app: AgentApp): void {
  registerGetMeTool(app);
  registerListBoardsTool(app);
  registerGetBoardTool(app);
  registerCreateBoardTool(app);
  registerListItemsTool(app);
  registerGetItemTool(app);
  registerCreateItemTool(app);
  registerUpdateItemTool(app);
  registerDeleteItemTool(app);
  registerListGroupsTool(app);
  registerCreateGroupTool(app);
  registerListColumnsTool(app);
  registerAddUpdateTool(app);
  registerListUpdatesTool(app);
  registerSearchItemsTool(app);
}
