# Cloudflare

Lets an agent work with a Cloudflare account through the Cloudflare API
(`https://api.cloudflare.com/client/v4`): read zones and their analytics, manage DNS records,
purge a zone's cache, and read Workers scripts, KV namespaces, page rules and firewall rules. It
can do only what the API token of the installation allows.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-zones` | Lists zones, with an optional domain name filter. | no |
| `get-zone` | Returns one zone by id. | no |
| `list-dns-records` | Lists the DNS records of a zone, filtered by type or name. | no |
| `create-dns-record` | Creates a DNS record in a zone. | yes, asks first |
| `update-dns-record` | Updates the given fields of a DNS record. | yes, asks first |
| `delete-dns-record` | Deletes a DNS record. It cannot be undone. | yes, asks first |
| `purge-cache` | Purges a zone's cache: everything, or the given file URLs. | yes, asks first |
| `list-workers` | Lists the Workers scripts of an account. | no |
| `get-worker` | Returns the metadata of one Workers script. | no |
| `list-kv-namespaces` | Lists the Workers KV namespaces of an account. | no |
| `list-page-rules` | Lists the page rules of a zone. | no |
| `get-zone-analytics` | Returns a zone's analytics for a time range. | no |
| `list-firewall-rules` | Lists the firewall rules of a zone. | no |

Limits:

- Only DNS records and the cache can be changed. Workers, KV, page rules and firewall rules are
  read-only, and the app does not read or write KV values.
- Requests are not retried.

## Setup

```bash
agentapps install app.cloudflare cloudflare
agentapps config cloudflare API_TOKEN:<your API token>
agentapps cloudflare tools
agentapps cloudflare tool list-zones name:example.com
```

`API_TOKEN` is an installation secret: each installation has its own. Create it in the Cloudflare
dashboard, under My Profile, API Tokens, with the permissions for what you want the agent to do
(for example Zone read and DNS edit).

## Terms of use

Cloudflare's own terms apply to everything the app does on your behalf:
<https://www.cloudflare.com/terms/>.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (Cloudflare's
press kit, brand guidelines or its own site). They have been in the repository since before this
README existed and their origin was not written down.
