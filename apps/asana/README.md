# Asana

Lets an agent work with Asana through its REST API (`https://app.asana.com/api/1.0`): list
workspaces, projects, sections, tags and teams, read and search tasks, and create, update and
delete tasks, sections and tags. It acts as the user whose access token the installation holds.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-workspaces` | Lists the workspaces the user can reach. | no |
| `list-projects` | Lists the projects of a workspace. | no |
| `get-project` | Returns one project by id. | no |
| `list-tasks` | Lists the tasks of a project. | no |
| `get-task` | Returns one task by id. | no |
| `create-task` | Creates a task in one or more projects, or in a workspace. | yes, asks first |
| `update-task` | Changes a task's name, notes or completed state. | yes, asks first |
| `delete-task` | Deletes a task. | yes, asks first |
| `list-sections` | Lists the sections of a project. | no |
| `create-section` | Creates a section in a project. | yes, asks first |
| `add-task-to-section` | Adds a task to a section of a project. | yes, asks first |
| `get-user` | Returns the authenticated user. | no |
| `list-tags` | Lists the tags of a workspace. | no |
| `create-tag` | Creates a tag in a workspace. | yes, asks first |
| `add-tag-to-task` | Adds a tag to a task. | yes, asks first |
| `list-teams` | Lists the teams of an organization workspace. | no |
| `search-tasks` | Searches the tasks of a workspace by text, assignee, project, section or completed state. | no |
| `add-followers` | Adds followers to a task. | yes, asks first |

Limits:

- The app cannot create or change projects, and cannot read or write comments or attachments.
- `update-task` changes only the name, the notes and the completed state.
- A request times out after 30 seconds. Reads are retried twice on a transient error or a rate
  limit; writes are never retried.

## Setup

```bash
agentapps install app.asana asana
agentapps config asana ACCESS_TOKEN:<your personal access token>
agentapps asana tools
agentapps asana tool list-workspaces
```

`ACCESS_TOKEN` is an installation secret: each installation has its own. It is an Asana personal
access token, created in Asana's developer console.

## Terms of use

Asana's own terms apply to everything the app does on your behalf: <https://asana.com/terms>.

## Logos

| File | Source | Changes |
|---|---|---|
| assets/logo.svg | <https://github.com/Asana/cursor-marketplace-plugin>, `assets/logo.svg` (Asana's own GitHub organisation) | none |
| assets/logo-mono.svg | the same file | colour replaced by `currentColor` so a host can tint it |

The file is coral `#FF584A`, as on Asana's login page; asana.com's header shows `#F06A6A` today, and which one is current was not settled. Asana's [brand page](https://asana.com/brand) says the symbol should always appear in coral and offers no download of it alone; its press kit asks for a form.
