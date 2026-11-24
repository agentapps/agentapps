# ClickUp

Lets an agent work with ClickUp through its API (`https://api.clickup.com/api/v2`): browse
workspaces, spaces, folders and lists, read and search tasks, create, update and delete tasks,
create folders and lists, and read and add task comments. The user connects their ClickUp account
with OAuth, and the app acts as that user.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `get-user` | Returns the authenticated user. | no |
| `get-workspaces` | Lists the workspaces the user belongs to. | no |
| `get-members` | Lists the members of a workspace. | no |
| `get-spaces` | Lists the spaces of a workspace. | no |
| `get-folders` | Lists the folders of a space. | no |
| `create-folder` | Creates a folder in a space. | yes, asks first |
| `get-lists` | Lists the lists of a folder. | no |
| `create-list` | Creates a list in a folder. | yes, asks first |
| `get-tasks` | Lists the tasks of a list, with optional filters. | no |
| `get-task` | Returns one task by id. | no |
| `create-task` | Creates a task in a list. | yes, asks first |
| `update-task` | Updates a task's name, description, priority, status, dates or time estimate. | yes, asks first |
| `delete-task` | Deletes a task for good. | yes, asks first |
| `search-tasks` | Searches tasks across a workspace. | no |
| `add-comment` | Adds a comment to a task. | yes, asks first |
| `get-comments` | Lists the comments on a task. | no |

Limits:

- The app reaches lists through a folder. It has no tool for lists that sit directly in a space.
- It cannot delete folders or lists, and cannot change a task's assignees or tags after creating
  it.
- Requests are not retried.

## Setup

ClickUp uses OAuth. Register an OAuth app first, in ClickUp's settings under ClickUp API, with
the redirect URI `{station URL}/auth/callback`. ClickUp gives you a client id and a client
secret.

```bash
agentapps config app.clickup CLIENT_ID:<your client id>
agentapps config app.clickup CLIENT_SECRET:<your client secret>
agentapps install app.clickup clickup
agentapps clickup auth
agentapps clickup tools
agentapps clickup tool get-workspaces
```

`CLIENT_ID` and `CLIENT_SECRET` are system secrets: one pair for every installation of the app.
`agentapps clickup auth` opens ClickUp's consent page and stores the user's tokens as
installation secrets; you do not set those by hand.

## Terms of use

ClickUp's own terms apply to everything the app does on your behalf: <https://clickup.com/terms>.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (ClickUp's press
kit, brand guidelines or its own site). They have been in the repository since before this README
existed and their origin was not written down.
