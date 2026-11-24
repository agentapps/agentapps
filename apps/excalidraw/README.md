# Excalidraw

Lets an agent manage an Excalidraw Plus workspace: scenes (drawings) and their content,
collections, users, invites, workspace settings and audit logs. It calls the Excalidraw Plus
REST API at `https://api.excalidraw.com/api/v1` with a workspace API key. It does not work with
the free excalidraw.com editor, which has no account or API.

Limits:

- `update-scene-content` replaces the whole drawing: pass every element the scene should keep.
- `delete-scene` and `delete-collection` move the item to the trash; deleting a collection
  does not delete its scenes.
- Each call gives up after 30 seconds. A rate limit (HTTP 429) is reported as an error and not
  retried.
- Lists are paged with `cursor` and `limit`.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-scenes` | Lists the workspace's scenes with their metadata and links. | no |
| `get-scene` | Returns one scene's metadata, links and sharing settings. | no |
| `get-scene-content` | Returns a scene's drawing: elements, app state and embedded files. | no |
| `create-scene` | Creates an empty scene in a collection, optionally pinned. | yes, asks first |
| `update-scene` | Changes a scene's name, pinned state or collection. | yes, asks first |
| `update-scene-content` | Replaces a scene's whole drawing with new elements. | yes, asks first |
| `delete-scene` | Moves a scene to the trash. | yes, asks first |
| `list-collections` | Lists the workspace's collections. | no |
| `get-collection` | Returns one collection by id. | no |
| `get-collection-scenes` | Lists the scenes of a collection. | no |
| `create-collection` | Creates a collection. | yes, asks first |
| `create-collection-scene` | Creates a scene inside a collection. | yes, asks first |
| `update-collection` | Renames a collection. | yes, asks first |
| `delete-collection` | Moves a collection to the trash. | yes, asks first |
| `get-workspace` | Returns the workspace's metadata. | no |
| `update-workspace` | Renames the workspace. | yes, asks first |
| `list-users` | Lists the workspace's users and their roles. | no |
| `get-user` | Returns one user by id. | no |
| `update-user` | Changes a user's role or name. | yes, asks first |
| `remove-user` | Removes a user from the workspace. | yes, asks first |
| `list-invites` | Lists the workspace's invites. | no |
| `get-invite` | Returns one invite by id. | no |
| `create-invite` | Invites a person to the workspace by email, with an optional role. | yes, asks first |
| `update-invite` | Changes the role of an invite. | yes, asks first |
| `delete-invite` | Deletes a pending invite. | yes, asks first |
| `list-logs` | Returns the workspace's audit logs. | no |

## Setup

```bash
agentapps install app.excalidraw excalidraw
agentapps config excalidraw EXCALIDRAW_API_KEY:<your key>
agentapps excalidraw tools
agentapps excalidraw tool list-scenes limit:10
```

`EXCALIDRAW_API_KEY` is an installation secret: each installation has its own key. Create one
in your Excalidraw Plus workspace at app.excalidraw.com, under Settings > API Keys. The key
needs access to the parts of the workspace the tools touch; the health check reads the
workspace itself.

## Terms of use

Excalidraw Plus' own terms apply to everything the app does in your workspace:
<https://plus.excalidraw.com/terms-of-service>.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (Excalidraw's
own site or its official repository). They have been in the repository since before this
README existed and their origin was not written down.
