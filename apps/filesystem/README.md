# Filesystem

Lets an agent read, search and change files on the machine where the app runs. It uses Node's
file APIs and a bundled ripgrep (`@vscode/ripgrep`) for `grep`; it calls no network service.

Every path is resolved, symlinks included, and must fall inside an allowed root, or the call
fails. The roots are, in this order: the directory in the `WORKSPACE_PATH` environment variable
of the app's process; `/workspace` if it exists; the directory the app was started in.
`list-roots` shows which one applies. Starting the app with `FS_ROLE=admin` turns this check
off.

Limits:

- `read` handles text files up to 5 MB and returns 2000 lines by default; binary files go
  through `read-media`, which stops at 10 MB. `read-batch` takes up to 50 paths.
- `write` accepts up to 10 MB and refuses to overwrite an existing file that was not read
  earlier in the same session of the app.
- `list` returns 50 entries by default and 200 at most; `glob` returns at most 1000 results;
  `grep` gives up after 30 seconds.
- Deleted, overwritten and moved files are not kept anywhere: there is no trash and no undo.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `read` | Reads a text file as numbered lines, with paging by offset and limit or by head and tail. | no |
| `read-batch` | Reads several text files in one call; one failure does not stop the rest. | no |
| `read-media` | Reads a binary file and returns it as base64 with its MIME type. | no |
| `write` | Writes a file, replacing it if it exists and creating parent directories. | yes, asks first |
| `append` | Appends to the end of a file, creating it if needed. | yes, asks first |
| `edit` | Replaces an exact string in a file and returns a diff. | yes, asks first |
| `patch` | Applies a unified diff to a file. | yes, asks first |
| `list` | Lists a directory's entries with metadata, optionally to a depth, with paging. | no |
| `tree` | Returns a directory as a JSON tree, to a depth and a node limit. | no |
| `stat` | Returns a path's metadata without reading its content. | no |
| `hash` | Computes a file's hash (sha256 by default). | no |
| `glob` | Finds files that match a glob pattern, most recently modified first. | no |
| `grep` | Searches file contents for a regular expression with ripgrep. | no |
| `delete` | Deletes a file or, with `recursive`, a directory. | yes, asks first |
| `copy` | Copies a file or directory. | yes, asks first |
| `move` | Moves or renames a file or directory. | yes, asks first |
| `mkdir` | Creates a directory and, by default, its parents. | yes, asks first |
| `list-roots` | Lists the roots the app can access. | no |

`edit` and `patch` take `dryRun: true` to return the diff without changing the file. `list`,
`tree`, `glob` and `grep` skip what `.gitignore` excludes only when `respectGitignore` is `true`.

## Setup

```bash
agentapps install app.filesystem files
agentapps files tools
agentapps files tool list-roots
agentapps files tool read filePath:README.md
```

There is no account and no key. Relative paths are resolved against the first root.

## Terms of use

The app calls no outside service, so no service's terms apply.

## Logos

Filesystem is Agent Apps' own and not an outside brand's, so there is no press kit: its logo
follows the format of the project's own apps (see `AGENTS.md`), and the project owner asked for it.

| File | Source | Changes |
|---|---|---|
| assets/logo.svg | `apps/bash/assets/logo.svg` (the GNU Bash logo): its hexagon and its solid face, unchanged. The `$_` cut out of that face is replaced by a folder drawn for this app on 2026-11-23, and the colour is `#2F7DD1`. | see Source |
| assets/logo-mono.svg | the same drawing | `currentColor` in place of the colour |

TODO: the Bash app's logo has no recorded source or licence (see its README), and this logo
reuses two of its shapes. Settle that before this one is treated as the project's own artwork.
