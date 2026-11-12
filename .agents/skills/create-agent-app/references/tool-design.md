# Tool design guide

Tools are what the agent sees. Design them for an agent that reads the description once, calls
the tool from a CLI or MCP client, and has to act on the result without a human in the loop.

## Choosing tools

- Start from the jobs (search, read one, list children, create, update, delete), not from the
  API's endpoint list. 5-15 tools is typical; 20 is a lot.
- Name tools in kebab-case, verb first: `list-spaces`, `get-page`, `create-page`,
  `search-content`. No app prefix: the host already namespaces them (`<alias>_<tool>` over MCP).
- Prefer one flexible read tool with filters over five near-identical ones. Keep reads and writes
  in separate tools so annotations stay true.

## Descriptions

- First sentence: what it does, in plain words. Then what it returns (the field names), the
  parameters that matter, and limits ("max 100 per page", "search index lags 20-40 s").
- Mention the next step when there is an obvious one: "Use `get-page` with the returned id".
- Write the units and formats: ISO dates, time zones, which ID kind (UUID, numeric, key like
  `PROJ-123`).

## Parameters

- JSON Schema with a `description` on every property, `enum` for closed sets, `required` for what
  is required. JSON Schema is advisory in this stack: nothing validates arguments at runtime, so
  the handler checks them again.
- Read arguments as `const a = (args ?? {}) as Record<string, unknown>;` and validate each one.
- **The `agentapps` CLI turns number-like values into numbers.** In `key:value` arguments it
  strips one pair of surrounding quotes and then converts anything `Number()` accepts:
  `id:123`, `zip:08001` (becomes `8001`), `lat:-3.7`, `n:1e3`, and also `true`, `false` and
  `null`. Quoting does not help: `'zip:"08001"'` still arrives as `8001`. Only a single inline
  JSON object (`'{"zip":"08001"}'`) or JSON on stdin (`-`) keeps a string. So ID- and
  code-like parameters accept `string | number`, convert with `String()`, and reject numbers
  above `Number.MAX_SAFE_INTEGER` (already rounded) with a message that says to pass the value
  in a JSON object. Mention leading-zero values (postal codes, account numbers) in the
  parameter description.
- The CLI's `--json` flag is about **output**, not input; do not tell users to pass input
  with it.
- Arrays and structured values in a query string are encoded per service: comma-joined (the
  scaffold's default), repeated keys, a JSON array, or a syntax of its own (LinkedIn's Rest.li
  `List(...)` with raw parentheses). Read the docs and assert the exact query string in a test.
- Validate anything that goes into a URL path (digits only, a strict regex, or
  `encodeURIComponent` per segment). A stray `/` or `..` must never redirect a write.
- Name parameters by role: the target is `id` / `path`; a destination is `destinationId`; a
  container to create inside is `parentId`. Never fall back to "the root" for a destructive tool
  when an argument is missing.
- Reject values the app cannot honour within its time budget (`timeoutSeconds` above the cap)
  up front, in the schema `maximum` and in the handler.

## Results

- Return plain JSON objects with stable, curated fields. Drop the API's noise; keep ids, names,
  urls, status, timestamps.
- **Stay under 50,000 characters.** The SDK replaces a larger result with a truncated string the
  agent cannot parse. Lists: stop adding items at ~45,000 chars and report
  `limitApplied: true` with a cursor that still works. An API with page numbers instead of
  cursors cannot resume in the middle of a page: return the items that fit with
  `limitApplied: true` and say to re-run with a smaller page size (or return the next page
  number when the whole page fit). Long bodies: chunk them (`offset` in,
  `hasMore` / `nextOffset` out). Time series (hourly values, metrics): bound the range up front
  (in the schema `maximum` and in the handler, e.g. hourly data for at most 7 days), return
  columns (`{ time: [...], temperature: [...] }`) rather than one object per row, and keep a
  final size check that fails with a message naming what to shrink.
- Write tools return `{ success: true, id, url, ...short summary }`, never the full object they
  wrote. A 70k-character echo once hid the new page's id behind the truncation.
- Read-only tools do not return `success`.
- Clean what the API returns: absolute URLs instead of relative links, decoded HTML entities,
  ids resolved to names with one batched lookup instead of N calls.
- If the service's terms require attribution (CC BY data, for example), add a short
  `attribution` field to results.

## Errors

- Throw `new Error(message)`; the SDK turns it into a failed `tool_result`. Every thrown error is
  reported with code `INTERNAL_ERROR`, so the message has to explain itself.
- Prefix messages with a bracketed code the agent can match: `[AUTH_REQUIRED]`, `[NOT_FOUND]`,
  `[BAD_REQUEST]`, `[RATE_LIMITED]`, `[<SERVICE>_ERROR] 404: ...`.
- Say what to do next: "Re-read it with get-page and retry with the new version", "Set it with
  `agentapps config <alias> SERVICE_API_KEY:<value>`".
- Network failures name the host and the cause (`could not reach api.example.com: ENOTFOUND`),
  not a bare `fetch failed`. Timeouts say "timed out after 30 s".
- Quote at most ~2,000 characters of an error body. Strip stack traces and Java class names.
- Never include an `Authorization` header, a token or a secret value in any message or log.

## Time budget

- The host abandons a tool call after **60 s** and a health check after **10 s**. The app must
  give up first, with its own message.
- HTTP: the scaffolded client gives each call **one 30 s deadline, retries included**, combined
  with the tool's cancel signal. Do not add per-attempt timeouts on top: three 30 s attempts
  overrun the host.
- Subprocesses: 45 s default, 50 s hard cap. Waits (rollout status, job polling): cap around
  40 s and return `done: false` so the agent calls again.
- Health: one cheap request with a 5 s deadline.

## Retries

- The scaffolded client retries `GET`, `PUT` and `DELETE` on 429, 502, 503, 504 and network
  errors, at most 3 attempts, inside the one deadline, and only waits for a `Retry-After` of
  5 s or less; a longer one becomes a `[RATE_LIMITED]` error the agent can act on.
- A `POST` (or `PATCH`) that already got a response is **never** retried: it may have been
  processed and would be created twice. Keep it that way if you change the client. The one
  exception is a `POST` that only reads (a search or report query sent as `POST`): pass
  `idempotent: true` to the client so it retries like a `GET`.
- Some APIs answer `200` with an error envelope (`{ "code": 40001, "message": ... }`). Check it
  where the client handles `response.ok` (the TODO there) and throw as an error status would.

## Several hosts

Some services split their API across hosts (search on one, data on another). Keep one app, pass
a fixed `baseUrl` per tool to the client, and never build a host from tool arguments.
