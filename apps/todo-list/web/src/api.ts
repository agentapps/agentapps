/**
 * Station API client — communicates with the Agent Apps station via HTTP.
 *
 * The station exposes `POST /messages` which accepts protocol messages
 * and returns the response. Bundles run inside an iframe with
 * `allow-same-origin`, so relative fetch calls work.
 *
 * For the PoC we use a hardcoded user/installation ID. In production
 * these would be injected by the host via URL params or postMessage.
 */

// ── Types ─────────────────────────────────────────────────────────────

export interface TreeNode {
  id: string;
  label: string;
  icon?: string;
  badge?: string;
  expanded?: boolean;
  children?: TreeNode[];
  meta?: Record<string, unknown>;
  // Fields carried through from the tool response for direct access
  description?: string;
  instructions?: string;
  completed?: boolean;
  collapsed?: boolean;
  position?: number;
  childCount?: number;
  completedChildren?: number;
  log?: Array<{ timestamp: number; text: string }>;
  createdAt?: number;
  updatedAt?: number;
}

export interface DetailField {
  label: string;
  value: string | number | boolean;
  type?: 'text' | 'code' | 'date' | 'url' | 'markdown' | 'image';
  linkText?: string;
  alt?: string;
}

export interface DetailSection {
  title?: string;
  fields: DetailField[];
  icon?: string;
}

export interface FormField {
  name: string;
  label: string;
  type:
    | 'text'
    | 'textarea'
    | 'number'
    | 'select'
    | 'checkbox'
    | 'radio'
    | 'date'
    | 'time'
    | 'datetime';
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
  defaultValue?: string | number | boolean;
  helpText?: string;
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: string;
}

export interface ToolResult {
  success: boolean;
  output: string;
  data?: unknown;
  error?: { code: string; message: string };
}

// ── Config ────────────────────────────────────────────────────────────

const STATION_BASE = '';
const USER_ID = 'poc-user';
const INSTALLATION_ID = 'ins_poc_0001';
const APP_ID = 'app.todo-list';

// ── ID generator ──────────────────────────────────────────────────────

let _idCounter = 0;
function nextId(): string {
  return `bundle-${Date.now()}-${++_idCounter}`;
}

// ── Core: send a protocol message to the station ──────────────────────

async function sendMessage(message: Record<string, unknown>): Promise<Record<string, unknown>> {
  const url = STATION_BASE + '/messages';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Station responded ${res.status}: ${text}`);
  }

  return res.json() as Promise<Record<string, unknown>>;
}

// ── Session management ────────────────────────────────────────────────

let _sessionId: string | null = null;
let _sessionPromise: Promise<string> | null = null;

async function ensureSession(): Promise<string> {
  if (_sessionId) return _sessionId;
  if (_sessionPromise) return _sessionPromise;

  _sessionPromise = (async () => {
    // Open a session with the station
    const openMsg = {
      id: nextId(),
      type: 'session_open',
      timestamp: new Date().toISOString(),
      version: '2.0',
      installationId: INSTALLATION_ID,
      tenant: { userId: USER_ID, workspaceId: 'poc' },
    };

    const response = await sendMessage(openMsg);

    if (response.type !== 'session_opened') {
      const error = response.error as { message: string } | undefined;
      throw new Error(error?.message ?? 'Failed to open session');
    }

    _sessionId = response.sessionId as string;
    return _sessionId;
  })();

  try {
    return await _sessionPromise;
  } catch (err) {
    _sessionPromise = null;
    throw err;
  }
}

// ── Tool call helper ──────────────────────────────────────────────────

export async function callTool(tool: string, args: Record<string, unknown>): Promise<ToolResult> {
  const sessionId = await ensureSession();

  const message = {
    id: nextId(),
    type: 'tool_call',
    timestamp: new Date().toISOString(),
    version: '2.0',
    sessionId,
    appId: APP_ID,
    tool,
    arguments: args,
    context: {
      userId: USER_ID,
      installationId: INSTALLATION_ID,
    },
  };

  const response = await sendMessage(message);

  // The station returns a tool_result message
  const success = response.type === 'tool_result';
  const error = response.error as { code: string; message: string } | undefined;

  if (error) {
    // If session expired, reset and retry once
    if (
      error.code === 'session_not_found' ||
      (error.message?.includes('Session') && error.message?.includes('not found'))
    ) {
      _sessionId = null;
      _sessionPromise = null;
      const newSessionId = await ensureSession();
      const retryMessage = { ...message, id: nextId(), sessionId: newSessionId };
      const retryResponse = await sendMessage(retryMessage);
      const retryError = retryResponse.error as { code: string; message: string } | undefined;
      if (retryError) {
        return { success: false, output: '', error: retryError };
      }
      // Station returns result directly, or content array with text
      const retryResult = retryResponse.result;
      const retryContent = retryResponse.content as
        | Array<{ type: string; text: string }>
        | undefined;
      const retryOutput =
        retryContent?.map((c) => c.text).join('\n') ??
        (retryResult ? JSON.stringify(retryResult) : '');
      return {
        success: retryResponse.type === 'tool_result',
        output: retryOutput,
        data: retryResult ?? retryResponse.data,
      };
    }
    return { success: false, output: '', error };
  }

  // The station returns the result in response.result (object) or
  // response.content (array of { type, text }) for older format
  const result = response.result;
  const content = response.content as Array<{ type: string; text: string }> | undefined;
  const outputText =
    content?.map((c) => c.text).join('\n') ?? (result ? JSON.stringify(result) : '');

  return { success, output: outputText, data: result ?? response.data };
}

// ── Typed wrappers for common tools ───────────────────────────────────

export async function getTree(nodeId?: string): Promise<TreeNode[]> {
  const result = await callTool('get-tree', nodeId ? { nodeId } : {});
  if (!result.success) throw new Error(result.error?.message ?? 'Failed to get tree');
  return parseTreeOutput(result.output);
}

export async function getNode(nodeId: string): Promise<Record<string, unknown>> {
  const result = await callTool('get-node', { nodeId });
  if (!result.success) throw new Error(result.error?.message ?? 'Failed to get node');
  return parseJsonOutput(result.output);
}

export async function addNode(
  text: string,
  parentId?: string,
  description?: string,
  instructions?: string,
): Promise<Record<string, unknown>> {
  const args: Record<string, unknown> = { text };
  if (parentId) args.parentId = parentId;
  if (description) args.description = description;
  if (instructions) args.instructions = instructions;
  const result = await callTool('add-node', args);
  if (!result.success) throw new Error(result.error?.message ?? 'Failed to add node');
  return parseJsonOutput(result.output);
}

export async function updateNode(
  nodeId: string,
  updates: { text?: string; description?: string; instructions?: string },
): Promise<Record<string, unknown>> {
  const args: Record<string, unknown> = { nodeId };
  if (updates.text !== undefined) args.text = updates.text;
  if (updates.description !== undefined) args.description = updates.description;
  if (updates.instructions !== undefined) args.instructions = updates.instructions;
  const result = await callTool('update-node', args);
  if (!result.success) throw new Error(result.error?.message ?? 'Failed to update node');
  return parseJsonOutput(result.output);
}

export async function toggleComplete(nodeId: string): Promise<Record<string, unknown>> {
  const result = await callTool('toggle-complete', { nodeId });
  if (!result.success) throw new Error(result.error?.message ?? 'Failed to toggle complete');
  return parseJsonOutput(result.output);
}

export async function toggleCollapse(nodeId: string): Promise<Record<string, unknown>> {
  const result = await callTool('toggle-collapse', { nodeId });
  if (!result.success) throw new Error(result.error?.message ?? 'Failed to toggle collapse');
  return parseJsonOutput(result.output);
}

export async function deleteNode(nodeId: string): Promise<void> {
  const result = await callTool('delete-node', { nodeId });
  if (!result.success) throw new Error(result.error?.message ?? 'Failed to delete node');
}

export async function moveNode(
  nodeId: string,
  newParentId: string | null,
  newPosition?: number,
): Promise<Record<string, unknown>> {
  const args: Record<string, unknown> = { nodeId, newParentId };
  if (newPosition !== undefined) args.newPosition = newPosition;
  const result = await callTool('move-node', args);
  if (!result.success) throw new Error(result.error?.message ?? 'Failed to move node');
  return parseJsonOutput(result.output);
}

export async function searchNodes(
  query: string,
): Promise<Array<{ nodeId: string; text: string; path: string }>> {
  const result = await callTool('search-nodes', { query });
  if (!result.success) throw new Error(result.error?.message ?? 'Failed to search nodes');
  const parsed = parseJsonOutput(result.output);
  return (parsed.results as Array<{ nodeId: string; text: string; path: string }>) ?? [];
}

export async function addLogEntry(nodeId: string, text: string): Promise<Record<string, unknown>> {
  const result = await callTool('add-log-entry', { nodeId, text });
  if (!result.success) throw new Error(result.error?.message ?? 'Failed to add log entry');
  return parseJsonOutput(result.output);
}

// ── URL param helpers ─────────────────────────────────────────────────

export function getUrlParam(name: string): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

// ── Parsing helpers ───────────────────────────────────────────────────

function parseJsonOutput(output: string): Record<string, unknown> {
  try {
    return JSON.parse(output) as Record<string, unknown>;
  } catch {
    return { raw: output };
  }
}

function parseTreeOutput(output: string): TreeNode[] {
  try {
    const parsed = JSON.parse(output);
    let rawNodes: Array<Record<string, unknown>> | undefined;
    if (Array.isArray(parsed)) rawNodes = parsed;
    else if (parsed.tree && Array.isArray(parsed.tree)) rawNodes = parsed.tree;
    else if (parsed.nodes && Array.isArray(parsed.nodes)) rawNodes = parsed.nodes;
    else if (parsed.result?.tree && Array.isArray(parsed.result.tree))
      rawNodes = parsed.result.tree;
    if (!rawNodes) return [];
    // Map tool node format (nodeId, text, childCount) to TreeNode (id, label, children)
    return rawNodes.map(mapToolNode);
  } catch {
    return [];
  }
}

/** Map a tool response node to our TreeNode format. */
function mapToolNode(raw: Record<string, unknown>): TreeNode {
  const children = raw.children as Array<Record<string, unknown>> | undefined;
  const meta = raw.meta as Record<string, unknown> | undefined;
  const collapsed = (raw.collapsed as boolean) ?? false;
  return {
    id: (raw.id as string) ?? (raw.nodeId as string) ?? '',
    label: (raw.label as string) ?? (raw.text as string) ?? '',
    icon: raw.icon as string | undefined,
    badge: raw.badge as string | undefined,
    expanded: !collapsed,
    children: children?.map(mapToolNode),
    meta: {
      ...meta,
      completed: (meta?.completed as boolean) ?? (raw.completed as boolean),
      expanded: !collapsed,
    },
    description: (raw.description as string) ?? undefined,
    instructions: (raw.instructions as string) ?? undefined,
    completed: (raw.completed as boolean) ?? false,
    collapsed,
    position: (raw.position as number) ?? 0,
    childCount: (raw.childCount as number) ?? 0,
    completedChildren: (raw.completedChildren as number) ?? 0,
    log: raw.log as Array<{ timestamp: number; text: string }> | undefined,
    createdAt: raw.createdAt as number | undefined,
    updatedAt: raw.updatedAt as number | undefined,
  };
}
