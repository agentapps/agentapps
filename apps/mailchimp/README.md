# Mailchimp

Lets an agent work with a Mailchimp account: read audiences, subscribers, segments, tags, merge
fields, campaigns, campaign reports, templates and automations, add, update and delete
subscribers, create segments and campaigns, and send a campaign. It calls the Mailchimp Marketing
API v3 (`https://{dc}.api.mailchimp.com/3.0`, where the data centre comes from the API key).

Limits: `send-campaign` sends real email to an audience and cannot be undone.
`delete-subscriber` deletes the subscriber permanently. Lists return 10 items by default and at
most 1000 per call. Only reads are retried on a transient error (up to two retries); a write is
never retried, so a failed call may need to be repeated by hand.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-audiences` | Lists audiences (lists). | no |
| `get-audience` | Returns one audience with its stats and member count. | no |
| `list-subscribers` | Lists the subscribers of an audience. | no |
| `list-segments` | Lists the segments of an audience. | no |
| `list-tags` | Searches the tags of an audience by name prefix. | no |
| `list-merge-fields` | Lists the merge fields of an audience. | no |
| `list-campaigns` | Lists campaigns. | no |
| `get-campaign` | Returns one campaign. | no |
| `get-campaign-report` | Returns a campaign's report: opens, clicks, bounces, unsubscribes. | no |
| `list-templates` | Lists templates. | no |
| `get-template` | Returns one template. | no |
| `list-automations` | Lists automations. | no |
| `add-subscriber` | Adds a subscriber to an audience. | yes, asks first |
| `update-subscriber` | Updates a subscriber of an audience. | yes, asks first |
| `delete-subscriber` | Permanently deletes a subscriber from an audience. | yes, asks first |
| `create-segment` | Creates a segment in an audience. | yes, asks first |
| `create-campaign` | Creates a campaign. | yes, asks first |
| `send-campaign` | Sends a campaign that is ready to send. | yes, asks first |

The six tools that write are marked `sensitive`, so hosts ask before running them.
`delete-subscriber` and `send-campaign` are also `destructiveHint: true`.

## Setup

```bash
agentapps install app.mailchimp mailchimp
agentapps config mailchimp API_KEY:<your key>
agentapps mailchimp tools
agentapps mailchimp tool list-audiences count:10
```

`API_KEY` is an installation secret: each installation uses its own key. Create it in Mailchimp
under Account > Extras > API Keys, and enter the whole key, with the data centre suffix after the
dash (for example `-us21`). The app reads it from the Station on each call and never stores it.

## Terms of use

Mailchimp's own terms apply to everything the app does on your behalf:
<https://mailchimp.com/legal/terms/>. Mailchimp's own API and sending limits apply; this README
does not list them.

## Logos

| File | Source | Changes |
|---|---|---|
| assets/logo.svg | the icon in the header of mailchimp.com, <https://digitalasset.intuit.com/render/content/dam/intuit/mc-fe/en_us/images/dotcom/oneintuit2026-logos-mc-dotcom-inapp/iconLeading_mailchimp.svg> | none |
| assets/logo-mono.svg | the `mask-icon` of mailchimp.com, <https://mailchimp.com/release/plums/a9c5b58dea3269f6.svg> | the one colour replaced by `currentColor` so a host can tint it |

The official [brand kit](https://mailchimp.com/about/brand-assets/) has no SVG and no icon without the name, and says the two go together.
