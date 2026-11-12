/**
 * Todo Tree Screen — Web bundle
 *
 * Full UX parity with the original app's TodoWindowContent.
 * Features:
 * - Navigable collapsible tree (get-tree)
 * - Custom checkbox & chevron components
 * - Inline editing (title + description)
 * - Keyboard shortcuts (Enter, Tab, Shift+Tab, Cmd/Ctrl+Enter, Delete/Backspace)
 * - Live search (search-nodes)
 * - Focus mode (click detail title to zoom into a subtree)
 * - Detail bottom-sheet modal (description, instructions, log history)
 * - Pulse animation on real-time updates
 * - Child count badges (completed/total)
 * - Empty states
 * - Confirm dialog for cascading toggle-complete
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import {
  addLogEntry,
  addNode,
  deleteNode,
  getNode,
  getTree,
  moveNode,
  searchNodes,
  type TreeNode,
  toggleCollapse,
  toggleComplete,
  updateNode,
} from '../api';
import '../styles.css';

// Ensure viewport prevents zoom on mobile
if (typeof document !== 'undefined') {
  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport) {
    viewport.setAttribute(
      'content',
      'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no',
    );
  }
}

// ============================================================================
// ICONS — minimal inline SVG components (no icon library dependency)
// ============================================================================

function IconCheck({ size = 13, color = '#22c55e' }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconChevronRight({ size = 16, color = '#a1a1aa' }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function IconPencil({ size = 12, color = '#a1a1aa' }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

function IconPlus({ size = 14, color = '#5e6ad2' }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}

function IconSearch({ size = 14, color = '#71717a' }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function IconTrash({ size = 12, color = '#ef4444' }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function IconX({ size = 14, color = '#71717a' }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function relativeTime(ts: number | undefined): string {
  if (!ts) return '';
  const now = Date.now();
  const diff = now - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toISOString().slice(0, 10);
}

/** Flatten the tree into an ordered list of {node, depth} for keyboard nav */
function flattenTree(nodes: TreeNode[], depth = 0): Array<{ node: TreeNode; depth: number }> {
  const result: Array<{ node: TreeNode; depth: number }> = [];
  for (const node of nodes) {
    result.push({ node, depth });
    if (!node.collapsed && node.children && node.children.length > 0) {
      result.push(...flattenTree(node.children, depth + 1));
    }
  }
  return result;
}

/** Find a node by ID anywhere in the tree */
function findNodeById(nodes: TreeNode[], nodeId: string): TreeNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    if (node.children && node.children.length > 0) {
      const found = findNodeById(node.children, nodeId);
      if (found) return found;
    }
  }
  return null;
}

// ============================================================================
// CHECKBOX COMPONENT
// ============================================================================

function Checkbox({
  state,
  size = 18,
  onClick,
}: {
  state: 'empty' | 'done';
  size?: number;
  onClick?: () => void;
}) {
  return (
    <div
      className={`todo-checkbox ${state === 'done' ? 'done' : ''}`}
      style={{ width: size, height: size }}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {state === 'done' && <IconCheck size={Math.round(size * 0.7)} />}
    </div>
  );
}

// ============================================================================
// CHEVRON COMPONENT
// ============================================================================

function Chevron({
  expanded,
  onClick,
  size = 16,
}: {
  expanded: boolean;
  onClick?: () => void;
  size?: number;
}) {
  return (
    <div
      className={`todo-chevron ${expanded ? 'expanded' : ''}`}
      style={{ width: size, height: size }}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      <IconChevronRight size={size} />
    </div>
  );
}

// ============================================================================
// TREE NODE ROW — with inline editing
// ============================================================================

interface TreeNodeRowProps {
  node: TreeNode;
  depth: number;
  selectedId: string | null;
  editingId: string | null;
  pulseNodeId: string | null;
  onSelect: (id: string) => void;
  onStartEdit: (id: string) => void;
  onCommitEdit: (id: string, text: string, description: string) => void;
  onCancelEdit: () => void;
  onToggleComplete: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onIndent: (id: string) => void;
  onOutdent: (id: string) => void;
}

function TreeNodeRow({
  node,
  depth,
  selectedId,
  editingId,
  pulseNodeId,
  onSelect,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  onToggleComplete,
  onToggleCollapse,
  onIndent,
  onOutdent,
}: TreeNodeRowProps) {
  const isSelected = selectedId === node.id;
  const isEditing = editingId === node.id;
  const [editText, setEditText] = useState(node.label);
  const [editDesc, setEditDesc] = useState(node.description ?? '');
  const hasChildren = (node.children?.length ?? 0) > 0 || (node.childCount ?? 0) > 0;
  const isPulsing = pulseNodeId === node.id;

  // iOS Safari: the only reliable way to open the keyboard is to call .focus()
  // synchronously within the user gesture handler. useEffect/useLayoutEffect
  // fire after the gesture is resolved, so the keyboard won't open.
  // Solution: use a callback ref that focuses the instant the input mounts.
  // This runs during React's commit phase, which is synchronous and within
  // the same task as the click event that triggered the re-render.
  const titleInputCallbackRef = useCallback(
    (el: HTMLInputElement | null) => {
      if (el && isEditing) {
        el.focus();
        el.select();
      }
    },
    [isEditing],
  );

  useEffect(() => {
    if (isEditing) {
      setEditText(node.label);
      setEditDesc(node.description ?? '');
    }
  }, [isEditing, node.label, node.description]);

  const handleCommit = useCallback(() => {
    const trimmedText = editText.trim();
    const trimmedDesc = editDesc.trim();
    if ((trimmedText && trimmedText !== node.label) || trimmedDesc !== (node.description ?? '')) {
      onCommitEdit(node.id, trimmedText || node.label, trimmedDesc);
    } else {
      onCancelEdit();
    }
  }, [editText, editDesc, node.label, node.description, node.id, onCommitEdit, onCancelEdit]);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancelEdit();
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleCommit();
      }
    },
    [handleCommit, onCancelEdit],
  );

  return (
    <li className="tree-node">
      <div
        className={`tree-node-row ${isSelected ? 'selected' : ''} ${isPulsing ? 'todo-node-pulse' : ''}`}
        onClick={() => !isEditing && onSelect(node.id)}
      >
        {hasChildren ? (
          <Chevron expanded={!node.collapsed} onClick={() => onToggleCollapse(node.id)} />
        ) : (
          <div className="todo-chevron-spacer" />
        )}

        <Checkbox
          state={node.completed ? 'done' : 'empty'}
          onClick={() => onToggleComplete(node.id)}
        />

        {isEditing ? (
          <div className="todo-edit-container">
            <input
              ref={titleInputCallbackRef}
              className="todo-edit-title"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onBlur={handleCommit}
              onKeyDown={handleEditKeyDown}
              placeholder="Title…"
            />
            <textarea
              className="todo-edit-desc"
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              onBlur={handleCommit}
              onKeyDown={handleEditKeyDown}
              placeholder="Description…"
            />
          </div>
        ) : (
          <div className="todo-node-content" onClick={() => onSelect(node.id)}>
            <div className="todo-node-title-row">
              <span className={`todo-node-title ${node.completed ? 'completed' : ''}`}>
                {node.label || '(empty)'}
              </span>
              {hasChildren && (node.childCount ?? 0) > 0 && (
                <span className="todo-node-count">
                  ({node.completedChildren ?? 0}/{node.childCount})
                </span>
              )}
            </div>
            {node.description && <span className="todo-node-desc">{node.description}</span>}
          </div>
        )}

        {!isEditing && isSelected && (
          <button
            className="todo-edit-btn"
            onClick={(e) => {
              e.stopPropagation();
              onStartEdit(node.id);
            }}
            title="Edit"
          >
            <IconPencil />
          </button>
        )}
      </div>

      {hasChildren && !node.collapsed && node.children && node.children.length > 0 && (
        <ul className="tree-children">
          {node.children.map((child) => (
            <TreeNodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              editingId={editingId}
              pulseNodeId={pulseNodeId}
              onSelect={onSelect}
              onStartEdit={onStartEdit}
              onCommitEdit={onCommitEdit}
              onCancelEdit={onCancelEdit}
              onToggleComplete={onToggleComplete}
              onToggleCollapse={onToggleCollapse}
              onIndent={onIndent}
              onOutdent={onOutdent}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

// ============================================================================
// DETAIL PANEL
// ============================================================================

interface DetailPanelProps {
  node: TreeNode | null;
  onUpdateDescription: (id: string, desc: string) => void;
  onUpdateInstructions: (id: string, instr: string) => void;
  onAddLogEntry: (id: string, text: string) => void;
  onFocusNode: (id: string) => void;
}

function DetailPanel({
  node,
  onUpdateDescription,
  onUpdateInstructions,
  onAddLogEntry,
  onFocusNode,
}: DetailPanelProps) {
  const [descDraft, setDescDraft] = useState(node?.description ?? '');
  const [instrDraft, setInstrDraft] = useState(node?.instructions ?? '');
  const [logDraft, setLogDraft] = useState('');

  useEffect(() => {
    setDescDraft(node?.description ?? '');
    setInstrDraft(node?.instructions ?? '');
    setLogDraft('');
  }, [node?.id, node?.description, node?.instructions]);

  if (!node) {
    return <div className="detail-select-prompt">Select a node to view details</div>;
  }

  return (
    <div className="detail-panel">
      {/* Node title — click to enter focus mode */}
      <div className="detail-node-title-row" onClick={() => onFocusNode(node.id)}>
        <Checkbox state={node.completed ? 'done' : 'empty'} size={16} />
        <span className="detail-node-title">{node.label}</span>
      </div>

      {/* Description */}
      <div className="detail-section">
        <span className="detail-label">Description</span>
        <textarea
          className="detail-input detail-textarea"
          value={descDraft}
          onChange={(e) => setDescDraft(e.target.value)}
          onBlur={() => {
            if (descDraft !== (node.description ?? '')) {
              onUpdateDescription(node.id, descDraft);
            }
          }}
          placeholder="Add a description…"
        />
      </div>

      {/* Instructions */}
      <div className="detail-section">
        <span className="detail-label">Instructions</span>
        <textarea
          className="detail-input detail-textarea detail-textarea-tall monospace"
          value={instrDraft}
          onChange={(e) => setInstrDraft(e.target.value)}
          onBlur={() => {
            if (instrDraft !== (node.instructions ?? '')) {
              onUpdateInstructions(node.id, instrDraft);
            }
          }}
          placeholder="Detailed markdown instructions…"
        />
      </div>

      {/* Log / History */}
      <div className="detail-section">
        <span className="detail-label">
          History {node.log && node.log.length > 0 ? `(${node.log.length})` : ''}
        </span>
        {node.log && node.log.length > 0 && (
          <div className="detail-log-box">
            {node.log
              .slice(-10)
              .reverse()
              .map((entry, i) => (
                <div className="detail-log-entry" key={i}>
                  <span className="detail-log-time">{relativeTime(entry.timestamp)}</span>
                  <span className="detail-log-text">{entry.text}</span>
                </div>
              ))}
          </div>
        )}
        <input
          className="detail-input"
          value={logDraft}
          onChange={(e) => setLogDraft(e.target.value)}
          placeholder="Add a log entry…"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const trimmed = logDraft.trim();
              if (trimmed) {
                onAddLogEntry(node.id, trimmed);
                setLogDraft('');
              }
            }
          }}
        />
      </div>

      {/* Metadata */}
      <div className="detail-meta">
        {node.createdAt && (
          <span className="detail-meta-item">Created: {relativeTime(node.createdAt)}</span>
        )}
        {node.updatedAt && (
          <span className="detail-meta-item">Updated: {relativeTime(node.updatedAt)}</span>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// SEARCH RESULT ROW
// ============================================================================

interface SearchResultRowProps {
  result: { nodeId: string; text: string; path?: string; completed?: boolean };
  onSelect: (id: string) => void;
}

function SearchResultRow({ result, onSelect }: SearchResultRowProps) {
  return (
    <div className="search-result-row" onClick={() => onSelect(result.nodeId)}>
      <Checkbox state={result.completed ? 'done' : 'empty'} size={16} />
      <span className="todo-node-title" style={{ fontSize: '13px' }}>
        {result.text}
      </span>
      {result.path && <span className="search-result-path">{result.path}</span>}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

function TreeScreen() {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{
    nodeId: string;
    text: string;
    path?: string;
    completed?: boolean;
  }> | null>(null);
  const [detailNode, setDetailNode] = useState<TreeNode | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [pulseNodeId, setPulseNodeId] = useState<string | null>(null);
  const treeScrollRef = useRef<HTMLDivElement>(null);

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  const loadTree = useCallback(async () => {
    try {
      setError(null);
      const nodes = await getTree();
      setTree(nodes);
    } catch (err) {
      console.error('[TodoWindow] Failed to load tree:', err);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const loadNodeDetail = useCallback(async (nodeId: string) => {
    try {
      const data = await getNode(nodeId);
      // Map the raw node data to TreeNode format
      setDetailNode({
        id: (data.id as string) ?? (data.nodeId as string) ?? '',
        label: (data.text as string) ?? '',
        description: (data.description as string) ?? undefined,
        instructions: (data.instructions as string) ?? undefined,
        completed: (data.completed as boolean) ?? false,
        collapsed: (data.collapsed as boolean) ?? false,
        position: (data.position as number) ?? 0,
        childCount: (data.childCount as number) ?? 0,
        completedChildren: (data.completedChildren as number) ?? 0,
        log: data.log as Array<{ timestamp: number; text: string }> | undefined,
        createdAt: data.createdAt as number | undefined,
        updatedAt: data.updatedAt as number | undefined,
        expanded: !((data.collapsed as boolean) ?? false),
      });
    } catch (err) {
      console.error('[TodoWindow] Failed to load node detail:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    (async () => {
      await loadTree();
      setIsLoading(false);
    })();
  }, [loadTree]);

  // ============================================================================
  // NODE OPERATIONS
  // ============================================================================

  const handleAddNode = useCallback(
    async (parentId?: string) => {
      try {
        await addNode('', parentId);
        await loadTree();
        // The new node will be selected+editing after tree reloads
        // We need to find the newly added node — it's the last child of parent (or last root)
        // For simplicity, we just reload and let the user interact
      } catch (err) {
        console.error('[TodoWindow] Failed to add node:', err);
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [loadTree],
  );

  const handleAddNodeAndEdit = useCallback(
    async (parentId?: string) => {
      // iOS Safari workaround: open keyboard synchronously within the user gesture
      // before any async work. A temp input unlocks the keyboard for later .focus().
      const tempInput = document.createElement('input');
      tempInput.style.position = 'fixed';
      tempInput.style.opacity = '0';
      tempInput.style.pointerEvents = 'none';
      document.body.appendChild(tempInput);
      tempInput.focus();
      document.body.removeChild(tempInput);

      try {
        // Create with placeholder text — the tool requires non-empty text.
        // The node enters edit mode immediately so the user can type over it.
        const result = await addNode('New task', parentId);
        await loadTree();
        // Result can be { node: { nodeId } } or { nodeId } depending on format
        const resultNode = result.node as Record<string, unknown> | undefined;
        const newId =
          (resultNode?.nodeId as string) ?? (result.nodeId as string) ?? (result.id as string);
        if (newId) {
          setSelectedId(newId);
          setEditingId(newId);
          // Focus the real input after React renders it
          setTimeout(() => {
            const input = document.querySelector('.todo-edit-title') as HTMLInputElement | null;
            if (input) {
              input.focus();
              input.select();
            }
          }, 50);
        }
      } catch (err) {
        console.error('[TodoWindow] Failed to add node:', err);
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [loadTree],
  );

  const handleUpdateNode = useCallback(
    async (
      nodeId: string,
      data: { text?: string; description?: string; instructions?: string },
    ) => {
      try {
        await updateNode(nodeId, data);
        await loadTree();
        if (selectedId === nodeId) {
          await loadNodeDetail(nodeId);
        }
      } catch (err) {
        console.error('[TodoWindow] Failed to update node:', err);
      }
    },
    [loadTree, loadNodeDetail, selectedId],
  );

  const doToggleComplete = useCallback(
    async (nodeId: string) => {
      try {
        await toggleComplete(nodeId);
        await loadTree();
        if (selectedId === nodeId) {
          await loadNodeDetail(nodeId);
        }
      } catch (err) {
        console.error('[TodoWindow] Failed to toggle complete:', err);
      }
    },
    [loadTree, loadNodeDetail, selectedId],
  );

  const handleToggleComplete = useCallback(
    (nodeId: string) => {
      const node = findNodeById(tree, nodeId);
      const hasChildren = (node?.children?.length ?? 0) > 0 || (node?.childCount ?? 0) > 0;
      if (!hasChildren) {
        doToggleComplete(nodeId);
        return;
      }
      // Node has children — confirm before cascading
      const childCount = node?.childCount ?? 0;
      const action = node?.completed ? 'uncomplete' : 'complete';
      const message = `This will ${action} this node and all ${childCount} of its children. Continue?`;
      if (window.confirm(message)) {
        doToggleComplete(nodeId);
      }
    },
    [tree, doToggleComplete],
  );

  const handleToggleCollapse = useCallback(
    async (nodeId: string) => {
      try {
        await toggleCollapse(nodeId);
        await loadTree();
      } catch (err) {
        console.error('[TodoWindow] Failed to toggle collapse:', err);
      }
    },
    [loadTree],
  );

  const handleDeleteNode = useCallback(
    async (nodeId: string) => {
      try {
        await deleteNode(nodeId);
        if (selectedId === nodeId) {
          setSelectedId(null);
          setDetailNode(null);
        }
        await loadTree();
      } catch (err) {
        console.error('[TodoWindow] Failed to delete node:', err);
      }
    },
    [loadTree, selectedId],
  );

  const handleMoveNode = useCallback(
    async (nodeId: string, newParentId: string | null) => {
      try {
        await moveNode(nodeId, newParentId);
        await loadTree();
      } catch (err) {
        console.error('[TodoWindow] Failed to move node:', err);
      }
    },
    [loadTree],
  );

  const handleAddLogEntry = useCallback(
    async (nodeId: string, text: string) => {
      try {
        await addLogEntry(nodeId, text);
        await loadNodeDetail(nodeId);
      } catch (err) {
        console.error('[TodoWindow] Failed to add log entry:', err);
      }
    },
    [loadNodeDetail],
  );

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    try {
      const results = await searchNodes(query);
      setSearchResults(
        results.map((r) => ({
          nodeId: r.nodeId,
          text: r.text,
          path: r.path,
          completed: false,
        })),
      );
    } catch (err) {
      console.error('[TodoWindow] Failed to search:', err);
    }
  }, []);

  // ============================================================================
  // SELECTION & EDITING
  // ============================================================================

  const handleSelect = useCallback(
    (nodeId: string) => {
      setSelectedId(nodeId);
      setEditingId(null);
      loadNodeDetail(nodeId);
      setFocusNodeId(nodeId);
    },
    [loadNodeDetail],
  );

  const handleStartEdit = useCallback(
    (nodeId: string) => {
      // flushSync forces React to re-render synchronously within this click
      // handler, so the callback ref on the input fires DURING the user gesture.
      // Without this, iOS Safari won't open the keyboard (React 18 batches
      // state updates and defers the render past the gesture window).
      flushSync(() => {
        setSelectedId(nodeId);
        setEditingId(nodeId);
      });
      loadNodeDetail(nodeId);
    },
    [loadNodeDetail],
  );

  const handleCommitEdit = useCallback(
    (nodeId: string, text: string, description: string) => {
      handleUpdateNode(nodeId, { text, description });
      setEditingId(null);
    },
    [handleUpdateNode],
  );

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
  }, []);

  // Indent/outdent helpers
  const handleIndent = useCallback(
    (nodeId: string) => {
      const flat = flattenTree(tree);
      const idx = flat.findIndex((f) => f.node.id === nodeId);
      if (idx <= 0) return;
      const prev = flat[idx - 1];
      if (prev.depth >= flat[idx].depth) {
        handleMoveNode(nodeId, prev.node.id);
      }
    },
    [tree, handleMoveNode],
  );

  const handleOutdent = useCallback(
    (nodeId: string) => {
      const flat = flattenTree(tree);
      const idx = flat.findIndex((f) => f.node.id === nodeId);
      if (idx < 0) return;
      const item = flat[idx];
      if (item.depth === 0) return;
      for (let i = idx - 1; i >= 0; i--) {
        if (flat[i].depth < item.depth) {
          handleMoveNode(nodeId, flat[i].node.id);
          return;
        }
      }
      handleMoveNode(nodeId, null);
    },
    [tree, handleMoveNode],
  );

  // ============================================================================
  // KEYBOARD SHORTCUTS
  // ============================================================================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when typing in inputs/textareas (unless Escape)
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      if (isTyping) return; // Let inline edit handle its own keys

      const isModifier = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl+Enter: toggle complete on selected node
      if (isModifier && e.key === 'Enter' && selectedId) {
        e.preventDefault();
        handleToggleComplete(selectedId);
        return;
      }

      // Enter: start editing selected node (or add root if none selected)
      if (e.key === 'Enter' && !isModifier) {
        e.preventDefault();
        if (selectedId && editingId !== selectedId) {
          setEditingId(selectedId);
        } else if (!selectedId) {
          handleAddNodeAndEdit();
        }
        return;
      }

      // Tab: indent
      if (e.key === 'Tab' && !e.shiftKey && selectedId) {
        e.preventDefault();
        handleIndent(selectedId);
        return;
      }

      // Shift+Tab: outdent
      if (e.key === 'Tab' && e.shiftKey && selectedId) {
        e.preventDefault();
        handleOutdent(selectedId);
        return;
      }

      // Delete/Backspace: delete selected node
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && editingId !== selectedId) {
        e.preventDefault();
        handleDeleteNode(selectedId);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedId,
    editingId,
    handleToggleComplete,
    handleAddNodeAndEdit,
    handleDeleteNode,
    handleIndent,
    handleOutdent,
  ]);

  // ============================================================================
  // RENDER
  // ============================================================================

  if (isLoading) {
    return (
      <div className="app">
        <div className="todo-loading">Loading…</div>
      </div>
    );
  }

  // Focus mode: show only the focused node and its subtree
  const focusNode = focusNodeId ? findNodeById(tree, focusNodeId) : null;
  const displayNodes =
    searchResults !== null
      ? [] // search results are rendered separately
      : focusNode
        ? [focusNode]
        : tree;

  return (
    <div className="app" style={{ background: 'var(--bg-page)' }}>
      {/* Toolbar */}
      <div className="todo-toolbar">
        {/* Focus mode back button */}
        {focusNode && (
          <button className="todo-toolbar-btn" onClick={() => setFocusNodeId(null)}>
            <IconChevronRight size={14} color="#a1a1aa" />
            <span>Back to Tree</span>
          </button>
        )}

        <button
          className="todo-toolbar-btn todo-toolbar-btn-primary"
          onClick={() => handleAddNodeAndEdit()}
        >
          <IconPlus size={14} />
          <span>Add Root</span>
        </button>

        {/* Contextual actions for selected node */}
        {selectedId && editingId !== selectedId && (
          <>
            <button className="todo-toolbar-btn" onClick={() => handleAddNodeAndEdit(selectedId)}>
              <IconPlus size={12} color="#a1a1aa" />
              <span>Add Child</span>
            </button>
            <button className="todo-toolbar-btn" onClick={() => handleStartEdit(selectedId)}>
              <IconPencil size={12} />
              <span>Edit</span>
            </button>
            <button
              className="todo-toolbar-btn todo-toolbar-btn-danger"
              onClick={() => handleDeleteNode(selectedId)}
            >
              <IconTrash size={12} />
              <span>Delete</span>
            </button>
            <button
              className="todo-toolbar-btn"
              onClick={() => {
                loadNodeDetail(selectedId);
                setShowDetailModal(true);
              }}
            >
              <span>Detail</span>
            </button>
          </>
        )}

        {/* Search */}
        <div className="todo-search">
          <IconSearch />
          <input
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              handleSearch(e.target.value);
            }}
            placeholder="Search…"
          />
          {searchQuery.length > 0 && (
            <button
              className="todo-search-clear"
              onClick={() => {
                setSearchQuery('');
                setSearchResults(null);
              }}
            >
              <IconX />
            </button>
          )}
        </div>
      </div>

      {/* Main content */}
      <div
        style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-page)' }}
      >
        {error && <div className="todo-error">{error}</div>}

        {searchResults !== null ? (
          // Search results view
          searchResults.length === 0 ? (
            <div className="todo-empty">
              <span className="todo-empty-text">No results found</span>
            </div>
          ) : (
            <div className="tree-scroll">
              <div className="tree-list">
                {searchResults.map((result) => (
                  <SearchResultRow
                    key={result.nodeId}
                    result={result}
                    onSelect={(id) => {
                      setSearchQuery('');
                      setSearchResults(null);
                      handleSelect(id);
                    }}
                  />
                ))}
              </div>
            </div>
          )
        ) : displayNodes.length === 0 ? (
          <div className="todo-empty">
            <span className="todo-empty-text">No nodes yet</span>
            <button
              className="todo-toolbar-btn todo-toolbar-btn-primary"
              onClick={() => handleAddNodeAndEdit()}
            >
              <IconPlus size={14} />
              <span>Add your first task</span>
            </button>
          </div>
        ) : (
          <div className="tree-scroll" ref={treeScrollRef}>
            <ul className="tree-list">
              {displayNodes.map((node) => (
                <TreeNodeRow
                  key={node.id}
                  node={node}
                  depth={0}
                  selectedId={selectedId}
                  editingId={editingId}
                  pulseNodeId={pulseNodeId}
                  onSelect={handleSelect}
                  onStartEdit={handleStartEdit}
                  onCommitEdit={handleCommitEdit}
                  onCancelEdit={handleCancelEdit}
                  onToggleComplete={handleToggleComplete}
                  onToggleCollapse={handleToggleCollapse}
                  onIndent={handleIndent}
                  onOutdent={handleOutdent}
                />
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Detail bottom sheet modal */}
      {showDetailModal && (
        <div className="todo-modal-overlay" onClick={() => setShowDetailModal(false)}>
          <div className="todo-modal" onClick={(e) => e.stopPropagation()}>
            <div className="todo-modal-handle" />
            <div className="todo-modal-header">
              <span className="todo-modal-header-title">Detail</span>
              <button className="todo-modal-close" onClick={() => setShowDetailModal(false)}>
                <IconX size={16} color="#71717a" />
              </button>
            </div>
            <div className="todo-modal-body">
              <DetailPanel
                node={detailNode}
                onUpdateDescription={(id, desc) => handleUpdateNode(id, { description: desc })}
                onUpdateInstructions={(id, instr) => handleUpdateNode(id, { instructions: instr })}
                onAddLogEntry={handleAddLogEntry}
                onFocusNode={(id) => {
                  setFocusNodeId(id);
                  setShowDetailModal(false);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<TreeScreen />);
