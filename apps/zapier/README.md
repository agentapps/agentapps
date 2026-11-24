# Zapier

Lets an agent list, preview and run the Zapier actions a user has exposed, read their execution
logs, and list Zaps and turn them on or off. It calls Zapier's Natural Language Actions (NLA)
API at `https://nla.zapier.com/api/v1`. Each installation uses its own API key. Requests are not
retried, and the health check only confirms that a key is set: it does not call Zapier.

When this README was written (2026-11-22), requests without a key to
`https://nla.zapier.com/api/v1/exposed/` and to `https://nla.zapier.com/credentials/` were
redirected to `https://mcp.zapier.com/login`. The app has not been tried against the live
service with a key, so check that the NLA API still answers before you rely on it.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-actions` | Lists the actions exposed in the user's NLA account. | no |
| `execute-action` | Runs an action from natural language instructions, with optional parameter overrides. | yes, asks first |
| `preview-action` | Shows what an action would do with the given instructions, without running it. | no |
| `get-execution-log` | Returns the details and result of one execution. | no |
| `list-logs` | Lists recent executions with their status and result. | no |
| `list-zaps` | Lists the account's Zaps. | no |
| `get-zap` | Returns one Zap: name, status, steps and configuration. | no |
| `enable-zap` | Turns a Zap on. | yes, asks first |
| `disable-zap` | Turns a Zap off. | yes, asks first |

## Setup

```bash
agentapps install app.zapier zapier
agentapps config zapier API_KEY:<your NLA API key>
agentapps zapier tools
agentapps zapier tool list-actions
```

`API_KEY` is an installation secret: each installation has its own. The app's code points to
<https://nla.zapier.com/credentials/> for the key; see the note above about where that address
leads today.

## Terms of use

Zapier's own terms apply to everything the app does on your behalf:
<https://zapier.com/legal/terms-of-service>.

## Logos

| File | Source | Changes |
|---|---|---|
| assets/logo.svg | Zapier brand portal, the "Zapier App Icon" collection linked from <https://brand.zapier.com/logo>, `zapier-logomark.svg` | removed the XML declaration |
| assets/logo-mono.svg | the same file | the square background written as a path (the file has it as a `<rect>`); its paths joined into one with `fill-rule="evenodd"`, so the white shapes are cut out of the background instead of painted on it; the colours replaced by `currentColor`. The path data is unchanged. Asked for by the project owner. |
