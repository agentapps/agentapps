# @agentapps/app.todo-list

Workflowy-style hierarchical outliner — single-tree architecture.

## Features

- **Single tree** — no lists, every node is part of one tree per user
- **Rich nodes** — text, description, instructions (markdown), chronological log
- **Toggle complete** — cascades to all descendants
- **Collapse/expand** — hide/show children (Workflowy-style)
- **Move subtrees** — with circular reference detection
- **Search** — case-insensitive with breadcrumb paths
- **Storage via callbacks** — no direct database connection, uses host storage

## Tools

| Tool | Description |
|------|-------------|
| `add-node` | Add a node (root or nested) |
| `get-node` | Get full detail of a single node (instructions + log) |
| `get-tree` | Get the full nested tree (lightweight, no instructions/log) |
| `update-node` | Update text, description, and/or instructions |
| `toggle-complete` | Toggle completion (cascades to descendants + logs) |
| `toggle-collapse` | Toggle collapse/expand |
| `move-node` | Move node to different parent/position (with circular detection) |
| `delete-node` | Delete a node and its entire subtree |
| `search-nodes` | Search nodes by text with breadcrumb paths |
| `add-log-entry` | Add a chronological log entry to a node |

## Events

- `node.added` — a new node was added
- `node.updated` — a node was updated
- `node.completed` — a node was toggled complete/incomplete
- `node.moved` — a node was moved
- `node.deleted` — a node and its subtree were deleted

## Lifecycle

- `onInstall` — creates a default root node "My Tasks"
- `onSessionOpen` — verifies root node exists; creates it if missing
- `onUninstall` — no-op (data persists for reinstallation)

## Storage

All nodes live in the Installation's Storage (`ctx.storage`), collection `nodes`, one document per node, scoped by `installationId`. No direct database connection required.
