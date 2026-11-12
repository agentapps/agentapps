import type { AgentApp } from '@agentapps/sdk';
import { registerCreateCollectionTool } from './create-collection.js';
import { registerCreateCollectionSceneTool } from './create-collection-scene.js';
import { registerCreateInviteTool } from './create-invite.js';
import { registerCreateSceneTool } from './create-scene.js';
import { registerDeleteCollectionTool } from './delete-collection.js';
import { registerDeleteInviteTool } from './delete-invite.js';
import { registerDeleteSceneTool } from './delete-scene.js';
import { registerGetCollectionTool } from './get-collection.js';
import { registerGetCollectionScenesTool } from './get-collection-scenes.js';
import { registerGetInviteTool } from './get-invite.js';
import { registerGetSceneTool } from './get-scene.js';
import { registerGetSceneContentTool } from './get-scene-content.js';
import { registerGetUserTool } from './get-user.js';
// Workspace
import { registerGetWorkspaceTool } from './get-workspace.js';
// Collections
import { registerListCollectionsTool } from './list-collections.js';
// Invites
import { registerListInvitesTool } from './list-invites.js';
// Logs
import { registerListLogsTool } from './list-logs.js';
// Scenes
import { registerListScenesTool } from './list-scenes.js';
// Users
import { registerListUsersTool } from './list-users.js';
import { registerRemoveUserTool } from './remove-user.js';
import { registerUpdateCollectionTool } from './update-collection.js';
import { registerUpdateInviteTool } from './update-invite.js';
import { registerUpdateSceneTool } from './update-scene.js';
import { registerUpdateSceneContentTool } from './update-scene-content.js';
import { registerUpdateUserTool } from './update-user.js';
import { registerUpdateWorkspaceTool } from './update-workspace.js';

/**
 * Register all 24 Excalidraw tools on the given app instance.
 */
export function registerTools(app: AgentApp): void {
  // Scenes
  registerListScenesTool(app);
  registerGetSceneTool(app);
  registerGetSceneContentTool(app);
  registerCreateSceneTool(app);
  registerUpdateSceneTool(app);
  registerUpdateSceneContentTool(app);
  registerDeleteSceneTool(app);

  // Collections
  registerListCollectionsTool(app);
  registerGetCollectionTool(app);
  registerGetCollectionScenesTool(app);
  registerCreateCollectionTool(app);
  registerCreateCollectionSceneTool(app);
  registerUpdateCollectionTool(app);
  registerDeleteCollectionTool(app);

  // Workspace
  registerGetWorkspaceTool(app);
  registerUpdateWorkspaceTool(app);

  // Users
  registerListUsersTool(app);
  registerGetUserTool(app);
  registerUpdateUserTool(app);
  registerRemoveUserTool(app);

  // Invites
  registerListInvitesTool(app);
  registerCreateInviteTool(app);
  registerGetInviteTool(app);
  registerUpdateInviteTool(app);
  registerDeleteInviteTool(app);

  // Logs
  registerListLogsTool(app);
}
