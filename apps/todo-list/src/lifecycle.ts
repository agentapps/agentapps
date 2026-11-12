/**
 * Todo List Agent App — Lifecycle Hooks
 *
 * onInstall: Creates a default root node "My Tasks" so the tree is never empty.
 * onSessionOpen: Verifies the root node exists; creates it if missing.
 * onUninstall: No-op (data persists for reinstallation).
 */

import type { LifecycleContext, SessionContext } from '@agentapps/sdk';
import { TodoStore } from './lib/index.js';

const DEFAULT_ROOT_TEXT = 'My Tasks';

/**
 * onInstall — called once when the app is installed for a user.
 * Creates a default root node so the user has a starting point.
 */
export async function onInstall(ctx: LifecycleContext): Promise<void> {
  // Check if the user already has any nodes
  const tree = await TodoStore.getTree(ctx.storage, null);
  if (tree.length > 0) return; // User already has nodes — don't create a duplicate

  // Create the default root node
  await TodoStore.createNode(
    ctx.storage,
    null,
    DEFAULT_ROOT_TEXT,
    'Your task list starts here.',
    '',
  );

  // Mark install as completed in the data store
  await ctx.storage.kv.set('todo:installed', { at: Date.now() });
}

/**
 * onSessionOpen — called when a session is opened for the user.
 * Verifies that the root node exists; creates it if missing.
 */
export async function onSessionOpen(ctx: SessionContext): Promise<void> {
  // Check if the user has any nodes
  const tree = await TodoStore.getTree(ctx.storage, null);
  if (tree.length > 0) return; // Tree exists — all good

  // Create the default root node
  await TodoStore.createNode(
    ctx.storage,
    null,
    DEFAULT_ROOT_TEXT,
    'Your task list starts here.',
    '',
  );
}

/**
 * onUninstall — called when the app is uninstalled.
 * Currently a no-op. Node data persists in storage and is not automatically
 * deleted (the user might reinstall).
 */
export async function onUninstall(_ctx: LifecycleContext): Promise<void> {
  // Intentionally empty — data persists for potential reinstallation.
  // @todo nira - 2026.08.29: add optional cleanup parameter to delete all user nodes on uninstall
}
