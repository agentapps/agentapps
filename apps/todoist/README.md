# Todoist

Lets an agent manage a Todoist account through the Todoist REST API
(`https://api.todoist.com/rest/v2`): tasks, projects, sections, labels and comments. Each
installation uses its own API token, so it acts as that Todoist user. Only reads are retried on
a rate limit or a server error; a create, update or delete is never retried, so a failed call
may need to be repeated by hand.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-projects` | Lists all projects. | no |
| `get-project` | Returns one project by id. | no |
| `create-project` | Creates a project, optionally under a parent project. | yes, asks first |
| `update-project` | Changes a project's name, color or favorite flag. | yes, asks first |
| `delete-project` | Deletes a project and all its tasks. It cannot be undone. | yes, asks first |
| `list-tasks` | Lists active tasks, optionally by project or by a filter such as `today` or `overdue`. | no |
| `get-task` | Returns one task by id. | no |
| `create-task` | Creates a task with optional description, project, due date, priority and labels. | yes, asks first |
| `update-task` | Changes a task's content, description, due date, priority or labels. | yes, asks first |
| `close-task` | Completes a task. | yes, asks first |
| `reopen-task` | Reopens a completed task. | yes, asks first |
| `delete-task` | Deletes a task. It cannot be undone. | yes, asks first |
| `list-labels` | Lists all labels. | no |
| `create-label` | Creates a label. | yes, asks first |
| `update-label` | Changes a label's name, color or favorite flag. | yes, asks first |
| `delete-label` | Deletes a label. It cannot be undone. | yes, asks first |
| `list-comments` | Lists the comments of a task or a project. | no |
| `create-comment` | Adds a comment to a task or a project. | yes, asks first |
| `list-sections` | Lists sections, optionally of one project. | no |
| `get-section` | Returns one section by id. | no |
| `create-section` | Creates a section in a project. | yes, asks first |
| `update-section` | Renames a section. | yes, asks first |
| `delete-section` | Deletes a section and its tasks. It cannot be undone. | yes, asks first |

## Setup

```bash
agentapps install app.todoist todoist
agentapps config todoist TODOIST_API_TOKEN:<your token>
agentapps todoist tools
agentapps todoist tool list-tasks filter:today
```

`TODOIST_API_TOKEN` is an installation secret: each installation has its own. It is your
personal API token, in Todoist under Settings, Integrations, Developer
(<https://app.todoist.com/app/settings/integrations/developer>).

## Terms of use

Todoist's own terms apply to everything the app does on your behalf:
<https://www.todoist.com/terms-of-service>.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (Todoist's
press kit, brand guidelines or its own site). They have been in the repository since before this
README existed and their origin was not written down.
