# Granola

Lets an agent read meeting notes from [Granola](https://www.granola.ai): list notes, read a
note's summary, attendees, calendar event and folders, page through its transcript, and list
folders. It uses the Granola public API (`https://public-api.granola.ai/v1`) with a personal API
key, so it sees what that one Granola account can see. The app only reads; it cannot create or
change notes.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-notes` | Lists notes (id, title, owner, created and updated dates), filtered by creation or update date, 10 per page and up to 30. | no |
| `get-note` | Returns one note: summary (text and markdown), attendees, calendar event, folders and web link. It leaves the transcript out. | no |
| `get-transcript` | Returns the transcript of a note in windows of segments (speaker, text, start and end time): 100 per call, up to 200, with `nextOffset` to continue. | no |
| `list-folders` | Lists folders, with `parent_folder_id` for nested ones, 10 per page and up to 30. | no |

Limits:

- The API only lists notes that already have a summary and a transcript. A note that Granola is
  still processing does not appear.
- Granola returns a whole transcript in one answer. `get-transcript` downloads it on every call
  and returns the window asked for.
- The app does not retry. On a rate limit (HTTP 429) the tool fails with a message that says so;
  call it again later. A request is abandoned after 30 seconds.

## Setup

```bash
agentapps install app.granola granola
agentapps config granola API_KEY:<your key>
agentapps granola tools
agentapps granola tool list-notes created_after:2026-01-01 page_size:5
```

`API_KEY` is an installation secret: each installation has its own key, tied to one Granola
account. Create a personal API key in the Granola desktop app, under Settings > Connectors >
API keys.

## Terms of use

Granola's own terms apply to everything the app reads on your behalf:
<https://www.granola.ai/terms>. Granola's API documentation
(<https://docs.granola.ai/introduction>) says API keys are for workspaces on a Business or
Enterprise plan, and that on Enterprise an admin decides which access scopes members may use.
It does not state the API's rate limits.

## Logos

| File | Source | Changes |
|---|---|---|
| assets/logo.svg | Granola "Public Press Kit" (<https://grano.la/press>, a public Google Drive folder), Logos, `logo-square` | none |
| assets/logo-mono.svg | same kit, Logos / 2. Granola idea spring / For screen / SVG, the black mark | removed the XML declaration and the `<style>` element; the one colour replaced by `currentColor` so a host can tint it |

The manifest also names `icon.svg`, which does not exist.
