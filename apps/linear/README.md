# Linear

Lets an agent work with a Linear workspace: list, read, create, update, archive and delete
issues, comment on them, manage labels, create projects and move issues in and out of them, and
look up teams, users and workflow states. It talks to Linear's GraphQL API
(`https://api.linear.app/graphql`) through the official `@linear/sdk`, with a personal API key,
so it sees and changes exactly what the key's owner can.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-issues` | Lists issues, optionally filtered by team, assignee, workflow state type and priority. | no |
| `get-issue` | Returns one issue by UUID or identifier (`ENG-123`), with its labels, project, cycle and description. | no |
| `create-issue` | Creates an issue in a team, optionally with assignee, priority, project, labels, state and parent issue. | yes, asks first |
| `update-issue` | Changes an issue's title, description, state, assignee, priority, project, labels, estimate or due date. | yes, asks first |
| `delete-issue` | Deletes an issue. | yes, asks first |
| `archive-issue` | Archives an issue. It can be restored in Linear; the app has no unarchive tool. | yes, asks first |
| `add-comment` | Adds a Markdown comment to an issue. | yes, asks first |
| `list-projects` | Lists projects, optionally those a team can access. | no |
| `create-project` | Creates a project owned by one or more teams. | yes, asks first |
| `add-issues-to-project` | Puts one or more issues in a project, replacing the project they had. | yes, asks first |
| `remove-issues-from-project` | Takes one or more issues out of their project. | yes, asks first |
| `list-labels` | Lists the workspace's labels, or one team's. | no |
| `create-label` | Creates a label in a team. | yes, asks first |
| `update-label` | Changes a label's name, color or description. | yes, asks first |
| `delete-label` | Deletes a label for good. | yes, asks first |
| `add-labels-to-issue` | Adds labels to an issue, keeping the ones it has. | yes, asks first |
| `remove-labels-from-issue` | Removes labels from an issue; the labels themselves stay. | yes, asks first |
| `list-teams` | Lists the teams. | no |
| `list-users` | Lists the workspace's users, or one team's members. | no |
| `list-workflow-states` | Lists a team's workflow states (the ids `stateId` takes). | no |

Limits:

- Lists return one page: 50 rows by default, 100 at most (`limit`). When `hasMore` is true,
  pass `nextCursor` back as `startCursor` for the next page.
- An issue is addressed by UUID or by identifier (`ENG-123`). Teams, users, projects, labels
  and workflow states are addressed by UUID only: get them from the `list-*` tools.
- `list-issues` returns compact rows; labels, project, cycle and description come from
  `get-issue`. The tools that return issues, projects, labels, teams, users, states or a
  comment take `fields` to pick the fields returned.
- Reads and updates are retried up to three times on a rate limit, a server error or a network
  error. Creating an issue, a comment, a project or a label is never retried, and neither is
  archiving or deleting, so a failed call may need to be repeated by hand.
- There are no tools for cycles, attachments or reading comments.

## Setup

```bash
agentapps install app.linear linear
agentapps config linear API_KEY:<your key>
agentapps linear tools
agentapps linear tool list-issues status:started limit:10
```

`API_KEY` is an installation secret: each installation (here the alias `linear`) has its own,
and the app refuses every call until it is set. It is a Linear personal API key. Create one in
Linear under Settings > Security & access (<https://linear.app/settings/account/security>);
Linear's guide is at <https://linear.app/developers/graphql>. The key acts as you, with your
access to the workspace. The app reads it from the Station on each call and sends it only to
`api.linear.app`.

## Terms of use

Linear's own terms apply to everything the app does on your behalf: <https://linear.app/terms>.
Linear limits how many requests an API key may make; the current limits are at
<https://linear.app/developers/rate-limiting>.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (Linear's
brand guidelines or its own site). They have been in the repository since before this README
existed and their origin was not written down.
