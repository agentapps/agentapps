/**
 * Todo List Agent App — Storage layer
 *
 * Nodes live in the Installation's Storage, collection `nodes`, one document
 * per node keyed by its nodeId. Children are found by querying `parentId`;
 * single-node changes are partial updates; deletes cascade over the subtree.
 *
 * Whole-tree reads (getTree, searchNodes) page through the collection.
 */

import type { DocumentStorage, StorageCollection, StorageDocument } from '@agentapps/sdk';
import { TodoError } from './errors.js';
import type { FormattedNode, LogEntry, NodeDetail, TodoNode } from './types.js';

const COLLECTION = 'nodes';

/**
 * Generate a short random ID: `tn_<16 base62 chars>`.
 * Uses crypto.getRandomValues for uniqueness without external deps.
 */
export function generateId(prefix: string): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let id = '';
  for (let i = 0; i < 16; i++) {
    id += chars[bytes[i] % chars.length];
  }
  return `${prefix}_${id}`;
}

function nodes(storage: DocumentStorage): StorageCollection {
  return storage.collection(COLLECTION);
}

function asNode(doc: StorageDocument): TodoNode {
  return doc as unknown as TodoNode;
}

/** Every node of the installation, paging through the collection. */
async function loadAll(storage: DocumentStorage): Promise<TodoNode[]> {
  const all: TodoNode[] = [];
  let cursor: string | undefined;
  do {
    const page = await nodes(storage).query({ limit: 1000, ...(cursor ? { cursor } : {}) });
    for (const doc of page.documents) all.push(asNode(doc));
    cursor = page.nextCursor;
  } while (cursor);
  return all;
}

/** Direct children of a node (or the roots for `null`), sorted by position. */
async function childrenOf(storage: DocumentStorage, parentId: string | null): Promise<TodoNode[]> {
  const result: TodoNode[] = [];
  let cursor: string | undefined;
  do {
    const page = await nodes(storage).query({
      filter: { parentId },
      limit: 1000,
      ...(cursor ? { cursor } : {}),
    });
    for (const doc of page.documents) result.push(asNode(doc));
    cursor = page.nextCursor;
  } while (cursor);
  return result.sort((a, b) => a.position - b.position);
}

async function patchNode(
  storage: DocumentStorage,
  nodeId: string,
  patch: Partial<TodoNode>,
): Promise<TodoNode | null> {
  const updated = await nodes(storage).update(nodeId, patch as StorageDocument);
  return updated ? asNode(updated) : null;
}

/**
 * The TodoStore — a pure data layer over the Installation's Storage.
 *
 * Every method receives the `DocumentStorage` from the tool context.
 */
export class TodoStore {
  // ===========================================================================
  // NODE CRUD
  // ===========================================================================

  static async createNode(
    storage: DocumentStorage,
    parentId: string | null,
    text: string,
    description: string = '',
    instructions: string = '',
  ): Promise<TodoNode> {
    // Append at the end of the siblings
    const siblingCount = (await childrenOf(storage, parentId)).length;

    const now = Date.now();
    const node: TodoNode = {
      nodeId: generateId('tn'),
      parentId,
      text,
      description,
      instructions,
      completed: false,
      collapsed: false,
      position: siblingCount,
      log: [],
      createdAt: now,
      updatedAt: now,
    };

    try {
      await nodes(storage).put(node.nodeId, node as unknown as StorageDocument);
    } catch (err) {
      throw new TodoError('STORAGE_ERROR', `Failed to save node: ${(err as Error).message}`);
    }
    return node;
  }

  static async getNode(storage: DocumentStorage, nodeId: string): Promise<TodoNode | null> {
    const doc = await nodes(storage).get(nodeId);
    return doc ? asNode(doc) : null;
  }

  static async getNodeDetail(storage: DocumentStorage, nodeId: string): Promise<NodeDetail | null> {
    const node = await TodoStore.getNode(storage, nodeId);
    if (!node) return null;
    return {
      nodeId: node.nodeId,
      parentId: node.parentId,
      text: node.text,
      description: node.description,
      instructions: node.instructions,
      completed: node.completed,
      collapsed: node.collapsed,
      position: node.position,
      log: node.log ?? [],
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
    };
  }

  static async updateNode(
    storage: DocumentStorage,
    nodeId: string,
    patch: { text?: string; description?: string; instructions?: string },
  ): Promise<TodoNode | null> {
    const changes: Partial<TodoNode> = { updatedAt: Date.now() };
    if (patch.text !== undefined) changes.text = patch.text;
    if (patch.description !== undefined) changes.description = patch.description;
    if (patch.instructions !== undefined) changes.instructions = patch.instructions;
    return patchNode(storage, nodeId, changes);
  }

  static async toggleComplete(storage: DocumentStorage, nodeId: string): Promise<TodoNode | null> {
    const node = await TodoStore.getNode(storage, nodeId);
    if (!node) return null;

    const newCompleted = !node.completed;
    const now = Date.now();

    // Cascade to every descendant
    const descendantIds = await TodoStore.collectSubtree(storage, nodeId);
    for (const id of descendantIds) {
      await patchNode(storage, id, { completed: newCompleted, updatedAt: now });
    }

    const count = descendantIds.length;
    const suffix = count > 0 ? ` (and ${count} descendant${count > 1 ? 's' : ''})` : '';
    const log: LogEntry[] = [
      ...node.log,
      {
        timestamp: now,
        text: newCompleted ? `Marked as completed${suffix}` : `Marked as not completed${suffix}`,
      },
    ];
    return patchNode(storage, nodeId, { completed: newCompleted, updatedAt: now, log });
  }

  static async toggleCollapse(storage: DocumentStorage, nodeId: string): Promise<TodoNode | null> {
    const node = await TodoStore.getNode(storage, nodeId);
    if (!node) return null;
    return patchNode(storage, nodeId, { collapsed: !node.collapsed, updatedAt: Date.now() });
  }

  static async deleteNode(storage: DocumentStorage, nodeId: string): Promise<TodoNode | null> {
    const node = await TodoStore.getNode(storage, nodeId);
    if (!node) return null;

    // Delete the subtree, then the node itself
    const toDelete = await TodoStore.collectSubtree(storage, nodeId);
    toDelete.push(nodeId);
    for (const id of toDelete) {
      await nodes(storage).delete(id);
    }

    // Reindex the remaining siblings
    await TodoStore.reindexSiblings(storage, node.parentId);
    return node;
  }

  /**
   * Move a node to a new parent and/or position.
   * Detects circular references (can't move a node into its own subtree).
   */
  static async moveNode(
    storage: DocumentStorage,
    nodeId: string,
    newParentId: string | null,
    newPosition: number,
  ): Promise<TodoNode | null> {
    const node = await TodoStore.getNode(storage, nodeId);
    if (!node) return null;

    // Circular check: newParent can't be inside node's subtree
    if (newParentId) {
      const subtree = await TodoStore.collectSubtree(storage, nodeId);
      if (subtree.includes(newParentId)) {
        throw new Error('CIRCULAR_MOVE: Cannot move a node into its own subtree.');
      }
    }

    const oldParentId = node.parentId;
    const now = Date.now();

    if (oldParentId !== newParentId) {
      // Different parent: make room in the new siblings, move, reindex the old ones
      const newSiblings = await childrenOf(storage, newParentId);
      const clampedPos = Math.min(Math.max(0, newPosition), newSiblings.length);
      for (const sibling of newSiblings) {
        if (sibling.position >= clampedPos) {
          await patchNode(storage, sibling.nodeId, { position: sibling.position + 1 });
        }
      }
      const moved = await patchNode(storage, nodeId, {
        parentId: newParentId,
        position: clampedPos,
        updatedAt: now,
      });
      await TodoStore.reindexSiblings(storage, oldParentId);
      return moved;
    }

    // Same parent: reorder within the siblings
    const siblings = await childrenOf(storage, oldParentId);
    const clampedPos = Math.min(Math.max(0, newPosition), siblings.length - 1);
    const withoutNode = siblings.filter((s) => s.nodeId !== nodeId);
    withoutNode.splice(clampedPos, 0, node);
    let moved: TodoNode | null = node;
    for (const [index, sibling] of withoutNode.entries()) {
      const updated = await patchNode(storage, sibling.nodeId, { position: index, updatedAt: now });
      if (sibling.nodeId === nodeId) moved = updated;
    }
    return moved;
  }

  // ===========================================================================
  // LOG
  // ===========================================================================

  static async addLogEntry(
    storage: DocumentStorage,
    nodeId: string,
    text: string,
  ): Promise<TodoNode | null> {
    const node = await TodoStore.getNode(storage, nodeId);
    if (!node) return null;
    const now = Date.now();
    const log: LogEntry[] = [...node.log, { timestamp: now, text }];
    return patchNode(storage, nodeId, { log, updatedAt: now });
  }

  // ===========================================================================
  // TREE READ
  // ===========================================================================

  /**
   * Get the full tree, or a subtree rooted at a specific node.
   * Returns a nested structure with children arrays.
   * Does NOT include instructions or log — use getNodeDetail for those.
   */
  static async getTree(
    storage: DocumentStorage,
    rootId: string | null = null,
  ): Promise<FormattedNode[]> {
    const allNodes = await loadAll(storage);

    // Build a map of parentId -> children
    const childrenMap = new Map<string | null, TodoNode[]>();
    for (const n of allNodes) {
      const key = n.parentId;
      if (!childrenMap.has(key)) childrenMap.set(key, []);
      childrenMap.get(key)!.push(n);
    }

    // Sort each group by position
    for (const [, children] of childrenMap) {
      children.sort((a, b) => a.position - b.position);
    }

    // Build tree recursively
    function buildTree(parentId: string | null): FormattedNode[] {
      const children = childrenMap.get(parentId) ?? [];
      return children.map((n) => {
        const kids = buildTree(n.nodeId);
        return {
          nodeId: n.nodeId,
          parentId: n.parentId,
          text: n.text,
          description: n.description ?? '',
          completed: n.completed,
          collapsed: n.collapsed,
          position: n.position,
          childCount: kids.length,
          completedChildren: kids.filter((k) => k.completed).length,
          ...(kids.length > 0 ? { children: kids } : {}),
        };
      });
    }

    // If rootId specified, start from that node's children
    if (rootId) {
      const rootNode = allNodes.find((n) => n.nodeId === rootId);
      if (!rootNode) return [];
      const tree = buildTree(rootId);
      return [
        {
          nodeId: rootNode.nodeId,
          parentId: rootNode.parentId,
          text: rootNode.text,
          description: rootNode.description ?? '',
          completed: rootNode.completed,
          collapsed: rootNode.collapsed,
          position: rootNode.position,
          childCount: tree.length,
          completedChildren: tree.filter((k) => k.completed).length,
          ...(tree.length > 0 ? { children: tree } : {}),
        },
      ];
    }

    return buildTree(null);
  }

  /**
   * Search nodes by text across all nodes.
   * Returns flat results with breadcrumb path.
   */
  static async searchNodes(
    storage: DocumentStorage,
    query: string,
  ): Promise<Array<TodoNode & { path: string }>> {
    const allNodes = await loadAll(storage);

    // Case-insensitive search
    const lowerQuery = query.toLowerCase();
    const matches = allNodes
      .filter((n) => n.text.toLowerCase().includes(lowerQuery))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 50);

    // Build a map for path lookup
    const nodeMap = new Map(allNodes.map((n) => [n.nodeId, n]));

    function buildPath(nodeId: string): string {
      const node = nodeMap.get(nodeId);
      if (!node || !node.parentId) return node?.text ?? '';
      const parentPath = buildPath(node.parentId);
      return parentPath ? `${parentPath} / ${node.text}` : node.text;
    }

    return matches.map((n) => ({ ...n, path: buildPath(n.nodeId) }));
  }

  // ===========================================================================
  // INTERNAL HELPERS
  // ===========================================================================

  /** Collect all descendant node IDs of a given node (not including the node itself). */
  private static async collectSubtree(storage: DocumentStorage, nodeId: string): Promise<string[]> {
    const result: string[] = [];
    const queue = [nodeId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const child of await childrenOf(storage, current)) {
        result.push(child.nodeId);
        queue.push(child.nodeId);
      }
    }
    return result;
  }

  /** Reindex sibling positions to be contiguous 0..N-1. */
  private static async reindexSiblings(
    storage: DocumentStorage,
    parentId: string | null,
  ): Promise<void> {
    const siblings = await childrenOf(storage, parentId);
    for (const [index, sibling] of siblings.entries()) {
      if (sibling.position !== index) {
        await patchNode(storage, sibling.nodeId, { position: index });
      }
    }
  }
}
