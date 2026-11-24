# WhatsApp

Lets an agent use a WhatsApp account through WAHA (WhatsApp HTTP API), a separate server that
you run yourself: link the account, send text, images and documents, read chats, messages and
contacts, react, mark chats read or unread, manage labels and edit the account's profile. The
app does not talk to WhatsApp directly: it calls WAHA at `http://localhost:<WAHA_PORT>/api`
(port 3001 by default), so WAHA must run on the same machine as the app. Linking is done with a
numeric pairing code only; QR codes are not supported. Label tools need a WhatsApp Business
account. A request to WAHA is abandoned after 30 seconds.

The app also emits events (`message_received`, `message_sent`, `message_reaction`,
`session_status`). For that it runs a small HTTP listener on `127.0.0.1` (port 3000, or
`WHATSAPP_WEBHOOK_PORT`) and points WAHA's webhooks at it when the first subscriber arrives.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `health-check` | Checks that WAHA answers and lists its active sessions. | no |
| `session-status` | Returns a session's status: `WORKING`, `SCAN_QR_CODE` (waiting to be linked), `STARTING`, `STOPPED` or `FAILED`. | no |
| `start-session` | Starts a session, creating it if needed and restarting it if it had failed. | yes, asks first |
| `stop-session` | Stops a session without deleting it. | yes, asks first |
| `request-pairing-code` | Asks for the numeric code that links a phone number to the session. | yes, asks first |
| `send-text` | Sends a text message to a phone number or a group. | yes, asks first |
| `send-image` | Sends an image from a public URL. | yes, asks first |
| `send-document` | Sends a file from a public URL or a local `/workspace/` path. | yes, asks first |
| `get-messages` | Returns recent messages of a chat. | no |
| `get-chats` | Lists the session's chats. | no |
| `get-contacts` | Lists the session's contacts. | no |
| `check-number` | Says whether a phone number has WhatsApp and returns its chat id. | no |
| `get-labels` | Lists the labels of a WhatsApp Business account. | no |
| `get-chat-labels` | Lists the labels assigned to a chat. | no |
| `put-chat-labels` | Replaces the labels assigned to a chat with the given list. | yes, asks first |
| `search-chats` | Searches chats by name or phone number. | no |
| `download-media` | Downloads the media of a message and saves it to a local path. | yes, asks first |
| `reaction` | Adds or removes an emoji reaction on a message. | yes, asks first |
| `read-messages` | Marks messages of a chat as read. | yes, asks first |
| `mark-unread` | Marks a chat as unread. | yes, asks first |
| `get-profile` | Returns the account's own profile. | no |
| `set-profile-name` | Changes the account's display name. | yes, asks first |
| `set-profile-status` | Changes the account's "About" text. | yes, asks first |
| `set-profile-picture` | Sets the account's profile picture from a public image URL. | yes, asks first |
| `delete-profile-picture` | Removes the account's profile picture. | yes, asks first |
| `get-contact-profile-picture` | Returns the URL of a contact's profile picture. | no |
| `search-contacts` | Searches contacts by name or phone number. | no |
| `get-unread-chats` | Lists the chats with unread messages, most unread first. | no |

## Setup

Start a WAHA server first (<https://waha.devlike.pro/>) on the machine where the app runs.

```bash
agentapps install app.whatsapp whatsapp
agentapps config app.whatsapp WAHA_API_KEY:<your WAHA API key>
agentapps whatsapp tools
agentapps whatsapp tool session-status
```

`WAHA_API_KEY` is a system secret: one WAHA server for every installation of the app. It is the
API key you set when you started WAHA. If the `WAHA_API_KEY` or `WAHA_PORT` environment
variables are set for the app's process, the app uses them and does not ask the Station.

There is no `agentapps whatsapp auth` step. To link a WhatsApp account, ask the agent, or run:

```bash
agentapps whatsapp tool start-session
agentapps whatsapp tool request-pairing-code phoneNumber:<number with country code>
```

Then enter the code in WhatsApp, under Linked Devices, Link with phone number.

## Terms of use

WhatsApp's own terms apply to the account you link and to every message the app sends with it:
the Terms of Service, <https://www.whatsapp.com/legal/terms-of-service>, and, for a business
account, the Business Terms, <https://www.whatsapp.com/legal/business-terms>. WAHA is a
third-party project, not made by WhatsApp, with its own terms: <https://waha.devlike.pro/>.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (WhatsApp's
brand resources or its own site). They have been in the repository since before this README
existed and their origin was not written down.
