# ActiveCampaign

Lets an agent work with an ActiveCampaign account through the v3 REST API: read and change
contacts, read lists and subscribe contacts to them, read campaigns, read and create deals, and
read and assign tags. Each installation talks to its own account, at the API URL given in its
secrets.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-contacts` | Lists contacts, filtered by email, free-text search or list. | no |
| `get-contact` | Returns one contact by id. | no |
| `create-contact` | Creates a contact. ActiveCampaign matches by email, so an existing contact is returned instead of a duplicate. | yes, asks first |
| `update-contact` | Updates the given fields of a contact. | yes, asks first |
| `delete-contact` | Deletes a contact for good. | yes, asks first |
| `list-lists` | Lists subscriber lists. | no |
| `subscribe-contact-to-list` | Subscribes a contact to a list, or unsubscribes it. | yes, asks first |
| `list-campaigns` | Lists email campaigns with their send and open counts. | no |
| `get-campaign` | Returns one campaign by id. | no |
| `list-deals` | Lists deals, filtered by search text, pipeline, stage or status. | no |
| `get-deal` | Returns one deal by id. | no |
| `create-deal` | Creates a deal in a pipeline stage, with an owner. | yes, asks first |
| `list-tags` | Lists tags. | no |
| `add-tag-to-contact` | Assigns a tag to a contact. | yes, asks first |

Limits:

- The app cannot create or send campaigns, change or delete deals, or create tags and lists.
- A request times out after 15 seconds. Reads are retried twice on a transient error or a rate
  limit; writes are never retried.
- The API URL must use `https`.

## Setup

```bash
agentapps install app.activecampaign activecampaign
agentapps config activecampaign ACTIVECAMPAIGN_BASE_URL:<your API URL>
agentapps config activecampaign ACTIVECAMPAIGN_API_TOKEN:<your API key>
agentapps activecampaign tools
agentapps activecampaign tool list-contacts search:ada limit:5
```

Both values are installation secrets: each installation has its own. ActiveCampaign shows them
together in the account's Settings, under Developer: the API URL (it looks like
`https://youraccount.api-us1.com`) and the API key.

## Terms of use

ActiveCampaign's own terms apply to everything the app does on your behalf. They are listed at
<https://www.activecampaign.com/legal>.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg`
(ActiveCampaign's press kit, brand guidelines or its own site). They have been in the repository
since before this README existed and their origin was not written down.
