/**
 * Todo List Agent App — Shared types
 *
 * Single-tree architecture: no lists, every node is part of one tree per user.
 * Root nodes have parentId: null.
 */

/** A single log entry in a node's chronological history. */
export interface LogEntry {
  timestamp: number;
  text: string;
}

/** A single bullet/node in the outliner tree. */
export interface TodoNode {
  nodeId: string;
  parentId: string | null;
  text: string;
  description: string;
  instructions: string;
  completed: boolean;
  collapsed: boolean;
  position: number;
  log: LogEntry[];
  createdAt: number;
  updatedAt: number;
}

/** Lightweight node for tree API responses (no instructions/log — use getNode for detail). */
export interface FormattedNode {
  nodeId: string;
  parentId: string | null;
  text: string;
  description: string;
  completed: boolean;
  collapsed: boolean;
  position: number;
  childCount: number;
  completedChildren: number;
  children?: FormattedNode[];
}

/** Full node detail for get-node API responses. */
export interface NodeDetail {
  nodeId: string;
  parentId: string | null;
  text: string;
  description: string;
  instructions: string;
  completed: boolean;
  collapsed: boolean;
  position: number;
  log: LogEntry[];
  createdAt: number;
  updatedAt: number;
}
