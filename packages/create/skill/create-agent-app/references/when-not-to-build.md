# When not to build an app

Building an app is the right answer less often than it looks. Check these before step 2, and
tell the user what you found in one or two sentences.

## It already exists

List the apps you can see (`agentapps apps`, the catalog, or `ls apps/` in the monorepo) and
search for the service by name and by product. If it exists:

- It does the job: say so and show how to install it.
- It is missing tools: extend it (see `app-boundaries.md`), do not start a second app.
- It is broken: fix it.

## The vendor's official MCP server is enough

Many services publish an official MCP server. Agent Apps reach MCP clients too (through the
station), so a second integration only pays off when it adds something. **Offer to wire the
official server instead**, and explain the trade-off so the user can choose:

| | Official MCP server | Agent App |
|---|---|---|
| Maintained by | The vendor, in step with their API | Whoever builds it |
| Time to use | Minutes: configure and connect | Hours to days: build, test, review |
| Per-tool approval (`sensitive` asks before writes) | Depends on the client | Built in, per installation |
| Per-installation secrets and permissions | Usually one credential per server | Per alias, per user |
| Tool design (output size, errors, annotations) | As the vendor shipped it | Under your control |
| Works with the rest of the catalog (permissions, intents, the station) | No | Yes |

Recommend the MCP server when it covers the jobs from step 2 and the user does not need
per-tool approval, per-installation secrets or catalog features. Recommend an app when they do, or when
the server is unofficial, unmaintained, or exposes far more than the user wants an agent to
touch. If the user picks the MCP server, help configure it in their MCP client and stop here.

## It belongs in an existing app

Same product, same API, same credential: extend that app. See `app-boundaries.md`.

## There is no API

Scraping web pages or driving a UI that has no API is out of scope for a new app. Suggest the
browser automation app if one is available, and say what would be fragile about it.

## The terms forbid it

If the service's terms forbid automated access, redistribution of its data, or use by AI
agents, stop and tell the user. Do not build around the terms.
