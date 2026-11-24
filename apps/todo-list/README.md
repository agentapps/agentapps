# Todo List

Lets an agent keep a hierarchical outline of tasks, in the style of Workflowy: one tree per
installation, where every node can have children. A node has a text, a description,
instructions in markdown and a chronological log. The app calls no outside API: nodes live in
the installation's own Storage (`ctx.storage`, collection `nodes`, one document per node). It
also has screens, so a person can open the tree, a node's detail and an add/edit form in the
host's UI. Search returns 50 results at most.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `add-node` | Adds a node at the root or under a parent node. | yes |
| `get-node` | Returns one node in full, with its instructions and log. | no |
| `get-tree` | Returns the whole tree, or the subtree under a node, without instructions or logs. | no |
| `update-node` | Changes a node's text, description or instructions. | yes |
| `toggle-complete` | Marks a node complete or not complete, with all its descendants, and logs it. | yes |
| `toggle-collapse` | Collapses or expands a node. | yes |
| `move-node` | Moves a node to another parent or position. It refuses to move a node into its own subtree. | yes |
| `delete-node` | Deletes a node and its whole subtree. It cannot be undone. | yes, asks first |
| `search-nodes` | Searches nodes by text, case-insensitive, and returns each match with its path. | no |
| `add-log-entry` | Adds an entry to a node's log. | yes |

## Setup

```bash
agentapps install app.todo-list todo
agentapps todo tools
agentapps todo tool get-tree
```

There is nothing to configure: the app has no secrets.

## Events

- `node.added`: a node was added
- `node.updated`: a node was updated
- `node.completed`: a node was marked complete or not complete
- `node.moved`: a node was moved
- `node.deleted`: a node and its subtree were deleted

## Lifecycle

- `onInstall` creates a default root node, "My Tasks".
- `onSessionOpen` checks that a root node exists and creates it if it is missing.
- `onUninstall` does nothing: the data stays, so a reinstall finds it.

## Terms of use

The app calls no outside service, so no service's terms apply.

TODO: link the Agent Apps terms. The manifest's `terms` URL, `https://agentapps.tech/terms`,
answered 404 when it was checked on 2026-11-22.

## Logos

Changed on 2026-11-23, asked for by the project owner. `assets/logo-mono.svg`: the lines and dots are cut out of the square instead of painted white on it, so a host can tint it (paper.js; the shapes are the ones the file had).

TODO: record the source of `assets/logo.svg` and `assets/logo-mono.svg`. They have been in the
repository since the app was added and their origin was not written down. Todo List is not an
outside brand, so there is no press kit to look in.
