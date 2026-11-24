# Telegram

Lets an agent act as a Telegram bot through the Telegram Bot API (`https://api.telegram.org`):
send text, photos, documents and locations, edit, delete, forward and pin messages, and read
information about chats and their members. It uses one bot token for every installation. The
bot can only write to chats where it has been added or that have started it, and some tools
need the bot to be an administrator of the chat. The app does not receive messages: it has no
tool or event for incoming updates. Requests are not retried.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `send-message` | Sends a text message to a chat, with optional HTML or Markdown formatting. | yes, asks first |
| `send-photo` | Sends a photo given by URL or by the `file_id` of one already uploaded. | yes, asks first |
| `send-document` | Sends a document given by URL or by `file_id`. | yes, asks first |
| `send-location` | Sends a location (latitude and longitude). | yes, asks first |
| `edit-message` | Edits the text of a message the bot sent. | yes, asks first |
| `delete-message` | Deletes a message from a chat. | yes, asks first |
| `get-chat` | Returns information about a group, supergroup or channel. | no |
| `get-chat-member` | Returns a chat member's status, permissions and user details. | no |
| `get-chat-members-count` | Returns the number of members in a chat. | no |
| `get-me` | Returns the bot's username, name and capabilities. | no |
| `forward-message` | Forwards a message from one chat to another. | yes, asks first |
| `pin-message` | Pins a message. The bot must be an administrator. | yes, asks first |
| `set-chat-title` | Changes a chat's title. The bot must be an administrator. | yes, asks first |
| `answer-callback-query` | Answers a callback query sent from an inline keyboard. | yes, asks first |

## Setup

```bash
agentapps install app.telegram telegram
agentapps config app.telegram BOT_TOKEN:<your bot token>
agentapps telegram tools
agentapps telegram tool get-me
```

`BOT_TOKEN` is a system secret: one bot for every installation of the app. Create a bot by
talking to `@BotFather` in Telegram; it gives you the token.

## Terms of use

Telegram's Bot Developer Terms of Service apply to the bot and to everything the app does with
it: <https://telegram.org/tos/bot-developers>.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (Telegram's
press kit, brand guidelines or its own site). They have been in the repository since before this
README existed and their origin was not written down.
