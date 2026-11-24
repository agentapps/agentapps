# Intercom

Lets an agent work with an Intercom workspace as a support teammate: search and read
conversations and contacts, list admins, teams and tags, reply to a conversation or add an
internal note, assign it, tag it, and open, close or snooze it. It calls the Intercom API
(`https://api.intercom.io`) with an access token.

Limits: a public reply reaches the customer and cannot be recalled. The app cannot create or
edit contacts. Only reads are retried on a transient error (up to two retries); a write is never
retried, so a failed call may need to be repeated by hand.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `get-workspace` | Returns the connected workspace: name, region, timezone and the authenticated admin. | no |
| `search-conversations` | Searches conversations by state, date range, tags and assignee, with pagination. | no |
| `get-conversation` | Returns one conversation with its messages, notes, tags and assignee. | no |
| `search-contacts` | Searches contacts by email, name or phone number. | no |
| `get-contact` | Returns one contact (user or lead) by its Intercom id. | no |
| `list-admins` | Lists the admins of the workspace. | no |
| `list-teams` | Lists the teams of the workspace. | no |
| `list-tags` | Lists the tags defined in the workspace. | no |
| `reply-conversation` | Replies to a conversation as an admin: a public reply or a private note. | yes, asks first |
| `assign-conversation` | Assigns a conversation to an admin or team, or unassigns it. | yes, asks first |
| `tag-conversation` | Adds or removes tags on a conversation. | yes, asks first |
| `update-conversation` | Opens, closes or snoozes a conversation, or changes its priority. | yes, asks first |

The four tools that write are marked `sensitive`, so hosts ask before running them.
`reply-conversation` is also `destructiveHint: true`.

## Setup

```bash
agentapps install app.intercom intercom
agentapps config intercom ACCESS_TOKEN:<your token>
agentapps intercom tools
agentapps intercom tool search-contacts email:jane@example.com
```

`ACCESS_TOKEN` is an installation secret: each installation uses its own token. Get it in the
Intercom Developer Hub: your app > Authentication > Access Token. The app reads it from the
Station on each call and never stores it.

## Terms of use

Intercom's own terms apply to everything the app does on your behalf:
<https://www.intercom.com/legal/terms-and-policies>. Intercom's own API rate limits apply; this
README does not list them.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (Intercom's
press kit, brand guidelines or its own site). They have been in the repository since before this
README existed and their origin was not written down.
