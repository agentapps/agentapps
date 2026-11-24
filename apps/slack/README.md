# Slack

Lets an agent work in a Slack workspace: read and search channels, messages, threads, users and
files; post, edit, schedule and delete messages; manage channels, reactions, pins, bookmarks,
saved items, files, canvases, calls and Slack Connect invites; and read or set the user's
status and Do Not Disturb. It uses the Slack Web API (`https://slack.com/api`) through the
official `@slack/web-api` client, with OAuth 2.0.

An installation holds two tokens for one workspace: the token of the user who connected, which
most tools use, so the agent acts as that person, and a bot token, used by the tools that
create, archive, rename or join channels, by the remote-file tools and by the Slack Connect
tools. What a tool can do depends on the scopes granted and on the workspace's plan and
settings.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `accept-shared-invite` | Accepts a Slack Connect invite, which joins the shared channel into the workspace. | yes, asks first |
| `add-bookmark` | Adds a link bookmark to a channel. | yes, asks first |
| `add-call` | Registers a call held at an external provider. | yes, asks first |
| `add-call-participants` | Adds participants to a call. | yes, asks first |
| `add-emoji` | Adds a custom workspace emoji from an image URL, or as an alias of an existing one. | yes, asks first |
| `add-reaction` | Adds an emoji reaction to a message. | yes, asks first |
| `add-remote-file` | Registers an external file (for example one in Google Drive or Dropbox) with Slack. | yes, asks first |
| `append-stream` | Appends text to a streaming message. | yes, asks first |
| `approve-shared-invite` | Approves a Slack Connect channel invite as a workspace admin. | yes, asks first |
| `archive-channel` | Archives a channel (read-only afterwards). | yes, asks first |
| `complete-upload` | Step 2 of the external upload flow: finishes the upload of files sent to the URL from `get-upload-url`, and can share them to a channel or thread. | yes, asks first |
| `create-canvas` | Creates a standalone canvas, with optional markdown content. | yes, asks first |
| `create-channel` | Creates a public or private channel, with an optional topic. | yes, asks first |
| `create-channel-canvas` | Creates the canvas of a channel. | yes, asks first |
| `create-list` | Creates a Slack List (collaborative table). | yes, asks first |
| `create-list-field` | Adds a new column to a Slack List schema. | yes, asks first |
| `create-list-item` | Adds a row to a Slack List. | yes, asks first |
| `decline-shared-invite` | Declines a Slack Connect channel invite. | yes, asks first |
| `delete-canvas` | Deletes a canvas. | yes, asks first |
| `delete-file` | Deletes a file. The user must own it or be a workspace admin. | yes, asks first |
| `delete-list` | Deletes a Slack List and all its items. | yes, asks first |
| `delete-list-field` | Deletes a column of a Slack List, with its values. | yes, asks first |
| `delete-list-item` | Deletes a list item. | yes, asks first |
| `delete-message` | Deletes a message. The user must be its author or a workspace admin. | yes, asks first |
| `delete-scheduled-message` | Cancels a scheduled message. | yes, asks first |
| `delete-user-photo` | Deletes the authenticated user's profile photo. | yes, asks first |
| `edit-bookmark` | Edits a channel bookmark. | yes, asks first |
| `edit-canvas` | Edits a canvas with a list of changes (insert, replace or delete sections, content as markdown). | yes, asks first |
| `end-call` | Marks a call as ended. | yes, asks first |
| `end-dnd` | Ends the authenticated user's Do Not Disturb snooze. | yes, asks first |
| `get-access-logs` | Gets the login audit trail of the workspace (paid plans only). | no |
| `get-call` | Gets call details (participants, duration, status). | no |
| `get-channel` | Gets a single channel. | no |
| `get-dnd` | Gets the Do Not Disturb status of a user. | no |
| `get-file` | Gets the details of a file (channels, links, optional comments). | no |
| `get-integration-logs` | Gets the integration audit trail: apps installed, removed or changed (paid plans only). | no |
| `get-list` | Gets list details + schema. | no |
| `get-permalink` | Gets a permanent URL for a message. | no |
| `get-reactions` | Gets the reactions on a message or on a file. | no |
| `get-remote-file` | Gets the details of a remote file. | no |
| `get-team-dnd` | Gets the Do Not Disturb status of several users at once. | no |
| `get-team-info` | Gets the connected Slack workspace info. | no |
| `get-team-preferences` | Gets the workspace preferences (default channels, who can create or archive channels, message edit window). | no |
| `get-team-profile` | Gets the custom profile fields the workspace defines. | no |
| `get-upload-url` | Step 1 of the external upload flow: gets an upload URL and a file id for a file of a given name and size. | no |
| `get-user` | Gets one user by id or by email. | no |
| `get-user-identity` | Gets the authenticated user's basic identity (needs the `identity.basic` scope, which this app does not request). | no |
| `get-user-presence` | Gets presence for a Slack user. | no |
| `get-user-profile` | Gets the full profile of a user (status, custom fields, image, phone, title). | no |
| `invite-shared` | Sends a Slack Connect invite to share a channel with external people, by email or user id. | yes, asks first |
| `invite-to-channel` | Invites users to a channel. | yes, asks first |
| `join-channel` | Joins a public channel. | yes, asks first |
| `kick-from-channel` | Removes a user from a channel. | yes, asks first |
| `leave-channel` | Leaves a public or private channel. | yes, asks first |
| `list-auth-teams` | Lists the workspaces the token can reach (Enterprise Grid). | no |
| `list-bookmarks` | Lists bookmarks attached to a channel. | no |
| `list-channel-members` | Lists user ids that are members of a channel. | no |
| `list-channels` | Lists channels. | no |
| `list-connect-invites` | Lists pending Slack Connect channel invites. | no |
| `list-emoji` | Lists custom workspace emojis. | no |
| `list-files` | Lists uploaded files. | no |
| `list-list-fields` | Lists the columns of a Slack List. | no |
| `list-list-items` | Lists the rows of a Slack List, page by page. | no |
| `list-messages` | Lists the messages of a channel, or the replies of a thread. | no |
| `list-my-reactions` | Lists the messages and files the user reacted to. | no |
| `list-pins` | Lists items pinned to a channel (messages and files). | no |
| `list-remote-files` | Lists the remote files registered with Slack. | no |
| `list-scheduled-messages` | Lists the user's pending scheduled messages. | no |
| `list-stars` | Lists the user's saved items (stars). | no |
| `list-user-channels` | Lists the channels a user is a member of. | no |
| `list-users` | Lists workspace users. | no |
| `mark-channel-read` | Marks a channel as read up to a message, for the authenticated user. | yes, asks first |
| `open-dm` | Opens a direct message with one user, or a group message with several. | yes, asks first |
| `pin-message` | Pins a message to a channel. | yes, asks first |
| `remove-bookmark` | Removes a channel bookmark by id. | yes, asks first |
| `remove-call-participants` | Removes participants from a call. | yes, asks first |
| `remove-emoji` | Removes a custom workspace emoji. Workspace admin only. | yes, asks first |
| `remove-reaction` | Removes an emoji reaction from a message. | yes, asks first |
| `remove-remote-file` | Removes a remote file reference from Slack; the file at the external provider is not deleted. | yes, asks first |
| `rename-channel` | Renames a channel. | yes, asks first |
| `revoke-auth` | Revokes the installation's Slack token: the workspace must be connected again afterwards. | yes, asks first |
| `revoke-file-public` | Revokes a file's public URL (links via permalink_public stop working). | yes, asks first |
| `schedule-message` | Schedules a message for a time up to 120 days ahead. | yes, asks first |
| `search-files` | Searches files in the whole workspace, with Slack search syntax. | no |
| `search-messages` | Searches messages in the whole workspace, with Slack search syntax. | no |
| `send-ephemeral` | Posts a message only one user in a channel can see. | yes, asks first |
| `send-me-message` | Posts a `/me` action message. | yes, asks first |
| `send-message` | Posts a message to a channel or a direct message. | yes, asks first |
| `send-thread-reply` | Replies in a thread, optionally also to the channel. | yes, asks first |
| `set-channel-purpose` | Sets the purpose of a channel (up to 250 characters). | yes, asks first |
| `set-channel-topic` | Sets the topic of a channel (up to 250 characters). | yes, asks first |
| `set-dnd` | Turns on Do Not Disturb for the authenticated user for 1 to 1440 minutes. | yes, asks first |
| `share-file-public` | Makes a file readable by anyone who has its public link. | yes, asks first |
| `share-remote-file` | Shares a remote file to one or more channels. | yes, asks first |
| `star-item` | Saves a message or a file to the user's saved items. | yes, asks first |
| `start-stream` | Starts a streaming message. | yes, asks first |
| `stop-stream` | Stops a streaming message. | yes, asks first |
| `unarchive-channel` | Unarchives a previously archived channel. | yes, asks first |
| `unfurl-link` | Sets a custom preview for links posted in a message. | yes, asks first |
| `unpin-message` | Unpins a message. | yes, asks first |
| `unstar-item` | Removes a message or a file from the user's saved items. | yes, asks first |
| `update-call` | Updates the title or join URLs of a call. | yes, asks first |
| `update-list` | Updates the name, description, schema or todo mode of a list. | yes, asks first |
| `update-list-field` | Renames a list column or changes whether it is required. | yes, asks first |
| `update-list-item` | Updates fields of a list item. | yes, asks first |
| `update-message` | Edits a message the user wrote. | yes, asks first |
| `update-remote-file` | Updates the metadata of a remote file. | yes, asks first |
| `update-user-profile` | Updates the authenticated user's profile (status, names, phone, title, custom fields). | yes, asks first |
| `upload-file` | Uploads a local file (up to 100 MB, absolute path) and can share it to a channel or thread. | yes, asks first |

Limits:

- Every tool that writes asks for approval first. Writes are never retried by the app; reads
  are retried up to three times when Slack answers a rate limit or a temporary error.
- Not working in this version: `add-emoji`, `remove-emoji`, `create-list`, `get-list`,
  `update-list`, `delete-list`, `create-list-field`, `list-list-fields`, `update-list-field`,
  `delete-list-field`, `create-list-item`, `update-list-item`, `delete-list-item`,
  `start-stream`, `append-stream` and `stop-stream`. They call Slack methods, or send
  arguments, that the installed Slack client does not have. `get-user-identity` needs the
  `identity.basic` scope, which the app does not request.
- `get-access-logs` and `get-integration-logs` work only on paid plans.
- A large page can be cut off: a result over 50,000 characters is truncated. Ask for smaller
  pages (`limit`, `count`) on `list-channels`, `list-users` and `list-messages`.
- `upload-file` reads a file from the machine the app runs on, up to 100 MB, by absolute path.

## Setup

The app uses Slack OAuth 2.0. Whoever runs the Station registers a Slack app once; each user
then connects a workspace.

1. Create an app at <https://api.slack.com/apps>. Under OAuth & Permissions, add the redirect
   URL the Station uses, `{station URL}/auth/callback`, and the scopes listed in
   `agentapp.json` under `auth.scopes`.
2. Store its client id, client secret and that redirect URL as system secrets, shared by every
   installation:

```bash
agentapps config app.slack CLIENT_ID:<client id> CLIENT_SECRET:<client secret>
```

3. Install the app and connect a workspace:

```bash
agentapps install app.slack slack
agentapps slack auth
agentapps slack tools
agentapps slack tool list-channels types:public_channel limit:20
```

The OAuth flow stores the installation secrets (`ACCESS_TOKEN`, `BOT_ACCESS_TOKEN`,
`REFRESH_TOKEN`, `TEAM_ID`, `TEAM_NAME`, `USER_ID`) on the installation; nobody sets them by
hand. `revoke-auth` revokes the user token: connect again afterwards.

## Terms of use

Use of the API is governed by the
[Slack API Terms of Service](https://slack.com/terms-of-service/api), and Slack's
[User Terms of Service](https://slack.com/terms-of-service/user) apply to the account that
connects. Slack limits requests per method and per workspace; see
<https://docs.slack.dev/apis/web-api/rate-limits/>.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (Slack's brand
guidelines or media kit). They have been in the repository since before this README existed and
their origin was not written down.
