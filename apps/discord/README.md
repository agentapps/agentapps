# Discord

Lets an agent work in Discord servers (guilds): read guilds, channels, messages, members, roles
and webhooks, send and delete messages, add reactions, create channels, roles and webhooks, and
moderate members (timeout, kick, ban). It calls the Discord REST API v10 through the
`discord.js` REST client.

The app signs in in one of two ways:

- A user's OAuth token (`ACCESS_TOKEN`), sent as `Bearer`. Discord gives such a token only
  user-scoped access, such as listing the user's guilds.
- A bot token (`BOT_TOKEN`), sent as `Bot`. When one is present the app uses it instead of the
  user's token. Channels, members, messages, roles and moderation need it, and the bot must be
  in the guild with the Discord permission each tool names (Manage Channels, Manage Roles, Kick
  Members and so on).

Limits: lists are paged by Discord's own `limit`, `before` and `after` parameters. The app
reports a rate limit (HTTP 429) as an error and does not wait and retry itself.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-guilds` | Lists the guilds the bot or user is a member of, with paging. | no |
| `get-guild` | Returns one guild by id, optionally with member counts. | no |
| `list-channels` | Lists the channels of a guild, of every type. | no |
| `get-channel` | Returns one channel by id. | no |
| `create-channel` | Creates a text, voice, category, announcement or forum channel in a guild. | yes, asks first |
| `delete-channel` | Deletes a channel, or closes a DM. | yes, asks first |
| `send-message` | Sends a message to a channel, with text, embeds, mentions or a reply. | yes, asks first |
| `list-messages` | Lists the messages of a channel, paged by message id. | no |
| `delete-message` | Deletes a message from a channel. | yes, asks first |
| `add-reaction` | Adds an emoji reaction to a message. | yes, asks first |
| `list-members` | Lists the members of a guild, with paging. | no |
| `get-member` | Returns one guild member by user id. | no |
| `list-roles` | Lists the roles of a guild, highest position first. | no |
| `create-role` | Creates a role in a guild. | yes, asks first |
| `assign-role` | Adds a role to a guild member. | yes, asks first |
| `remove-role` | Removes a role from a guild member. | yes, asks first |
| `list-webhooks` | Lists the webhooks of a guild or a channel. | no |
| `create-webhook` | Creates a webhook in a channel and returns its token. | yes, asks first |
| `send-webhook-message` | Sends a message through a webhook, given its id and token. | yes, asks first |
| `kick-member` | Kicks a member from a guild. | yes, asks first |
| `ban-member` | Bans a member from a guild, optionally deleting their recent messages. | yes, asks first |
| `timeout-member` | Times a member out for a number of minutes. | yes, asks first |

## Setup

Create an application in the Discord Developer Portal. Under OAuth2, copy its client id and
client secret and add the redirect URI the Station uses, `{station URL}/auth/callback`.

```bash
agentapps install app.discord discord
agentapps config app.discord CLIENT_ID:<client id> CLIENT_SECRET:<client secret>
agentapps discord auth
agentapps discord tools
agentapps discord tool list-guilds limit:10
```

`CLIENT_ID` and `CLIENT_SECRET` are system secrets: one OAuth client for every installation of
the app. `agentapps discord auth` signs one installation in and stores its `ACCESS_TOKEN` and
`REFRESH_TOKEN`. The sign-in asks for the scopes `identify`, `guilds`, `guilds.members.read`,
`bot`, `messages.read` and `applications.commands`.

The bot token comes from the same application's Bot page in the Developer Portal. The manifest
declares `BOT_TOKEN` as an optional extra field of the sign-in, not as an installation secret,
so a host that shows that field can store it. TODO: `agentapps config discord BOT_TOKEN:<token>`
is refused by the CLI today, because it only accepts the names listed in
`auth.installationSecrets`.

## Terms of use

Discord's own terms apply to everything the app does on your behalf: the Terms of Service at
<https://discord.com/terms>, and for the application and bot you register, the Developer Terms
of Service at
<https://discord.com/developers/docs/policies-and-agreements/developer-terms-of-service>.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (Discord's
brand guidelines or its own site). They have been in the repository since before this README
existed and their origin was not written down.
