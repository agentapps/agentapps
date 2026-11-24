# Context7

Lets an agent look up current documentation for a library or framework through the Context7 API
(`https://context7.com/api`). The agent first resolves a library name to a Context7 library id,
then asks for documentation snippets about a topic. Both tools only read.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `resolve-library` | Turns a library name such as "react" into ranked Context7 library ids. Results are cached in memory for 7 days. | no |
| `get-docs` | Returns documentation snippets (title, source, description, code, language) for a library id and a query. 10 snippets by default, 30 at most. | no |

Limits:

- A request times out after 15 seconds.
- Without an API key the code calls Context7 anonymously, on a shared quota that runs out
  quickly. The health check reports this as a warning.

## Setup

```bash
agentapps install app.context7 context7
agentapps config context7 CONTEXT7_API_KEY:<your API key>
agentapps context7 tools
agentapps context7 tool resolve-library libraryName:react
agentapps context7 tool get-docs libraryId:/reactjs/react.dev query:hooks
```

`CONTEXT7_API_KEY` is an installation secret: each installation has its own. Get one from the
Context7 dashboard at <https://context7.com/dashboard>.

## Terms of use

Context7 is a service of Upstash, and its site links to Upstash's legal page for its terms:
<https://upstash.com/docs/common/help/legal>. Those terms apply to everything the app does on
your behalf.

## Logos

| File | Source | Changes |
|---|---|---|
| assets/logo.svg | <https://github.com/upstash/context7>, `public/context7-icon-green.svg` | none |
| assets/logo-mono.svg | same repository, `packages/admin-mcp/public/context7-icon.svg` (one path, the glyph cut out of the square) | the one colour replaced by `currentColor` so a host can tint it |
