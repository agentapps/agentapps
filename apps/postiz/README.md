# Postiz

Lets an agent publish to social networks through one [Postiz](https://postiz.com) account,
cloud or self-hosted: draft, schedule and publish posts on the channels connected in Postiz,
see what is scheduled, delete posts, import media by URL, browse the media library and
notifications, and read analytics. It uses the
[Postiz public API](https://docs.postiz.com/public-api). Postiz holds the connection to each
network (X, LinkedIn, Instagram, TikTok, YouTube and more), so the app needs one API key.

Limits: Postiz limits requests per hour per key (its docs give 30 in one place and 90 to 100
in another); channels are connected in the Postiz UI, not here; media comes from a public URL,
not from a local file; a post cannot be edited once created (delete it and create it again).

Spec: [`docs/specs/postiz.md`](../../docs/specs/postiz.md).

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-channels` | The channels connected in Postiz, with their id and provider. | no |
| `find-next-slot` | The next free posting slot of a channel. | no |
| `list-posts` | Drafts, scheduled, published and failed posts in a date range. | no |
| `get-channel-analytics` | A channel's metrics over the last 1 to 90 days. | no |
| `get-post-analytics` | One post's metrics over the last 1 to 90 days. | no |
| `list-media` | The files in the media library, 18 per page, with an optional name filter. | no |
| `list-notifications` | The notifications of the Postiz account, 100 per page. | no |
| `upload-media-from-url` | Imports an image or video from a public URL into the media library. | yes, asks first |
| `create-draft` | Creates a draft; nothing is published. | yes, asks first |
| `schedule-post` | Schedules a post; Postiz publishes it at the date. | yes, asks first (destructive) |
| `publish-post` | Publishes a post right now. | yes, asks first (destructive) |
| `delete-post` | Deletes a draft or a scheduled post. | yes, asks first (destructive) |

`schedule-post` and `publish-post` are destructive because a published post is public and the
app cannot take it back.

### Provider settings

Each channel entry of a post takes an optional `settings` object, sent to Postiz unchanged.
`__type` is the channel's `provider` from `list-channels`; some providers require more fields
(X needs `who_can_reply_post`, Instagram `post_type`, YouTube `title` and `type`). The
[provider pages](https://docs.postiz.com/public-api) list them.

## Setup

```bash
agentapps install app.postiz postiz
agentapps config postiz POSTIZ_API_KEY:"<key>" POSTIZ_API_URL:cloud
agentapps postiz tools
agentapps postiz tool list-channels
agentapps postiz tool schedule-post '{"channels":[{"id":"<channel id>","content":"Hello","settings":{"__type":"linkedin"}}],"date":"2026-12-01T09:00:00Z"}'
```

Installation secrets are per installation: set them on the alias (`postiz` above), not on `app.postiz`.

- `POSTIZ_API_KEY`: the public API key of your Postiz organization. Create it in Postiz under
  Settings > Developers > Public API. It has no scopes: it can do everything the public API
  allows.
- `POSTIZ_API_URL`: `cloud` for Postiz Cloud (`https://api.postiz.com/public/v1`), or the
  public API base URL of a self-hosted instance, such as
  `https://postiz.example.com/api/public/v1`. Both secrets are required; `cloud` is the value
  to use when you have no instance of your own.

## Terms of use

Postiz Cloud is a paid service under the [Postiz terms](https://postiz.com/terms-of-service); the
self-hosted edition is open source under AGPL-3.0
([gitroomhq/postiz-app](https://github.com/gitroomhq/postiz-app)). The public API is made for
automated posting and is rate-limited per hour. What you publish is also subject to the terms
of each social network.

## Logos

Changed on 2026-11-23, asked for by the project owner. `assets/logo-mono.svg` was the name (`postiz-text.svg`), not the icon. It is now made from `assets/logo.svg`: the back card, and in front of it the front card with the letter cut out of it (paper.js and paperjs-offset; the shapes are the file's own).

| File | Source | Changes |
|---|---|---|
| assets/logo.svg | Postiz's official repository, [`apps/frontend/public/postiz.svg`](https://github.com/gitroomhq/postiz-app/blob/main/apps/frontend/public/postiz.svg) (the app's own icon) | none |
| assets/logo-mono.svg | same repository, [`apps/frontend/public/postiz-text.svg`](https://github.com/gitroomhq/postiz-app/blob/main/apps/frontend/public/postiz-text.svg) (the one-colour wordmark, drawn with `currentColor`) | none |

The icon is a coloured badge, so stripping its fills would leave a solid block; the official
one-colour wordmark is used as the mono logo instead. postiz.com has no press or brand page
(`/brand`, `/press` and `/media-kit` answer 404).
