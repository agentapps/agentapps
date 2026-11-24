# Browserbase

Lets an agent drive a browser that runs in Browserbase's cloud. The agent creates a session, then
navigates, reads the page, clicks, types and takes screenshots in it. The app creates sessions
with the Browserbase SDK and controls them with Playwright over the session's CDP connection.
Creating a session also returns a Live View URL, to watch the browser while it works.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `session-create` | Creates a cloud browser session and returns its id and Live View URL. Options cover proxies, stealth, CAPTCHA solving, ad blocking, region and a persistent context. | yes, asks first |
| `session-list` | Lists the sessions this app instance has open. | no |
| `session-close` | Closes a session and releases it. | yes, asks first |
| `navigate` | Opens a URL in the session. | yes |
| `navigate-back` | Goes back to the previous page. | yes |
| `snapshot` | Returns an accessibility snapshot of the page, with element refs for the other tools. | no |
| `get-content` | Returns the page as HTML or plain text. | no |
| `click` | Clicks an element. | yes, asks first |
| `type` | Types text into an editable element. | yes, asks first |
| `fill-form` | Fills several form fields at once. | yes, asks first |
| `evaluate` | Runs JavaScript in the page. | yes, asks first |
| `press-key` | Presses a keyboard key. | yes, asks first |
| `wait-for` | Waits for text to appear or disappear, or for a fixed time. | no |
| `take-screenshot` | Takes a screenshot of the page and saves it under `/workspace` on the machine. | yes, asks first |
| `network-requests` | Lists the network requests made in the session. | no |

Limits:

- Sessions are kept in the app's memory. After the app restarts, its earlier sessions are no
  longer reachable through these tools.
- A session ends after its timeout, 3600 seconds unless `timeout` says otherwise.
- `take-screenshot` writes to `/workspace` on the machine's filesystem, not to the Workspace
  Volume, and overwrites a file of the same name.
- The health check only confirms the two secrets are set. It does not call Browserbase.

## Setup

```bash
agentapps install app.browserbase browserbase
agentapps config browserbase BROWSERBASE_API_KEY:<your API key>
agentapps config browserbase BROWSERBASE_PROJECT_ID:<your project id>
agentapps browserbase tools
agentapps browserbase tool session-list
```

Both values are installation secrets: each installation has its own. Browserbase shows the API
key and the project id in its dashboard settings.

## Terms of use

Browserbase's own terms apply to everything the app does on your behalf:
<https://www.browserbase.com/terms-of-service>. The sites the browser visits have their own terms
too.

## Logos

Changed on 2026-11-23, asked for by the project owner. `assets/logo-mono.svg` kept the white rectangle that sits behind the letter in the colour logo, which made it a solid block. The rectangle is removed; the paths are unchanged.

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (Browserbase's
press kit, brand guidelines or its own site). They have been in the repository since before this
README existed and their origin was not written down.
