import type { AgentApp } from '@agentapps/sdk';
import { registerAddLogEntry } from './add-log-entry.js';
import { registerAddNode } from './add-node.js';
import { registerDeleteNode } from './delete-node.js';
import { registerGetNode } from './get-node.js';
import { registerGetTree } from './get-tree.js';
import { registerMoveNode } from './move-node.js';
import { registerSearchNodes } from './search-nodes.js';
import { registerToggleCollapse } from './toggle-collapse.js';
import { registerToggleComplete } from './toggle-complete.js';
import { registerUpdateNode } from './update-node.js';

export function registerTools(app: AgentApp): void {
  registerAddNode(app);
  registerGetNode(app);
  registerGetTree(app);
  registerUpdateNode(app);
  registerToggleComplete(app);
  registerToggleCollapse(app);
  registerMoveNode(app);
  registerDeleteNode(app);
  registerSearchNodes(app);
  registerAddLogEntry(app);
}
