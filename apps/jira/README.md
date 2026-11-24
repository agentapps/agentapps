# Jira

Lets an agent work with a Jira Cloud site: search issues with JQL, read, create and update
issues, comment on them, assign them and move them through their workflow, and read projects,
users, boards and sprints. It calls the Jira Cloud REST API v3 (`/rest/api/3`) and the Jira
Software Agile API (`/rest/agile/1.0`) on the site's own URL, with an email address and an API
token.

Limits: the agent acts as the user who owns the API token and sees what that user sees. The app
cannot delete issues, and it cannot create or edit projects, boards or sprints. Comment bodies
are plain text.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `get-myself` | Returns the authenticated user: display name, email and account id. | no |
| `search-issues` | Searches issues with JQL, with pagination and field selection. | no |
| `get-issue` | Returns one issue by its key. | no |
| `get-transitions` | Lists the workflow transitions available for an issue. | no |
| `list-projects` | Lists projects, with pagination. | no |
| `get-project` | Returns one project by key or id. | no |
| `search-users` | Searches users by display name or email address. | no |
| `list-boards` | Lists Scrum and Kanban boards, with filters by project or name. | no |
| `list-sprints` | Lists the sprints of a board, optionally by state. | no |
| `get-sprint` | Returns one sprint: name, state and dates. | no |
| `create-issue` | Creates an issue in a project. | yes, asks first |
| `update-issue` | Updates the given fields of an issue. | yes, asks first |
| `add-comment` | Adds a plain-text comment to an issue. | yes, asks first |
| `assign-issue` | Assigns an issue to a user by account id, or unassigns it. | yes, asks first |
| `transition-issue` | Moves an issue to a new status with a transition id. | yes, asks first |

The five tools that write are marked `sensitive`, so hosts ask before running them.

## Setup

```bash
agentapps install app.jira jira
agentapps config jira JIRA_URL:https://your-site.atlassian.net
agentapps config jira JIRA_EMAIL:<your Atlassian account email>
agentapps config jira JIRA_API_TOKEN:<your token>
agentapps jira tools
agentapps jira tool search-issues jql:"project = PROJ AND status = Open" maxResults:5
```

The three are installation secrets: each installation uses its own site and user. `JIRA_URL` is
the base URL of the Jira Cloud site. `JIRA_API_TOKEN` is an API token created in the Atlassian
account settings of the user in `JIRA_EMAIL` (Security > API tokens). The app sends the email and
token as HTTP Basic authentication on each call and never stores them.

## Terms of use

Atlassian's terms apply to everything the app does on your behalf: the
[Atlassian Customer Agreement](https://www.atlassian.com/legal/atlassian-customer-agreement) for
the Jira site and the
[Atlassian Developer Terms](https://developer.atlassian.com/platform/marketplace/atlassian-developer-terms/)
for use of the API. Atlassian's own API rate limits apply; this README does not list them.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (Atlassian's
brand resources or its own site). They have been in the repository since before this README
existed and their origin was not written down.
