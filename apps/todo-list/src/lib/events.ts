/**
 * Todo List Agent App — Event definitions
 *
 * Events are emitted by tool handlers to notify the host that the tree changed.
 * The host uses these to refresh UI resources.
 */

export interface TodoEventPayloads {
  'node.added': { nodeId: string; parentId: string | null; text: string };
  'node.updated': { nodeId: string; text: string; fields: string[] };
  'node.completed': { nodeId: string; completed: boolean };
  'node.moved': {
    nodeId: string;
    newParentId: string | null;
    oldParentId: string | null;
    position: number;
  };
  'node.deleted': { nodeId: string; text: string };
}

export type TodoEventName = keyof TodoEventPayloads;

/**
 * Event definitions — static metadata for registration.
 */
export const TODO_EVENTS: Array<{
  name: TodoEventName;
  description: string;
}> = [
  { name: 'node.added', description: 'A new node was added to the tree' },
  { name: 'node.updated', description: 'A node was updated' },
  { name: 'node.completed', description: 'A node was toggled complete/incomplete' },
  { name: 'node.moved', description: 'A node was moved to a new parent or position' },
  { name: 'node.deleted', description: 'A node and its subtree were deleted' },
];
