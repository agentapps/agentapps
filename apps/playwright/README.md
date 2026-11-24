# Playwright

Lets an agent drive a web browser: open pages, read them as an accessibility snapshot, click,
type, fill forms, take screenshots, record video and read the console and network logs. It
uses the [Playwright](https://playwright.dev/) library (version 1.65.0) to run a headless
Chromium on the machine where the app runs. It calls no web API of its own and needs no account
or key.

Main limits:

- One browser per app process, with one current tab. The tools act on the current tab; `tabs`
  switches it. Closing the app closes the browser, and nothing is kept between runs (no cookies,
  no sessions).
- Chromium only, always headless, with a 1280x720 viewport unless `resize`, `emulate-device` or
  `start-recording` change it.
- The app does not restrict which addresses the browser may open. `navigate` loads any URL it is
  given, including addresses of the local network.
- Elements are addressed by the `ref` values of the last `snapshot` (for example `e3`). A CSS
  selector or a visible text also works as `ref`.
- The console buffer keeps the last 1000 messages. The console and network logs live in memory
  and are emptied by `close`.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `navigate` | Opens a URL in the current tab and returns the page title. `waitUntil` chooses when the load counts as done. | yes |
| `navigate-back` | Goes one step back in the tab's history. | yes |
| `snapshot` | Returns the accessibility tree of the page, with the `ref` of each element. With `filename` it stores the snapshot as a markdown object and returns a link valid for one hour. | yes |
| `take-screenshot` | Takes a PNG or JPEG of the viewport, the full page or one element, stores it as an object and returns a link valid for one hour. | yes |
| `click` | Clicks an element: left, right or middle button, single or double, with modifier keys. | yes, asks first |
| `type` | Types text into an element, at once or key by key, and presses Enter after it with `submit`. | yes, asks first |
| `press-key` | Presses one key on the keyboard, such as `Enter` or `ArrowLeft`. | yes, asks first |
| `fill-form` | Fills several fields in one call: text boxes, checkboxes, radio buttons, comboboxes and sliders. Reports one line per field. | yes, asks first |
| `select-option` | Selects one or more values in a dropdown. | yes, asks first |
| `hover` | Moves the pointer over an element. | yes |
| `drag` | Drags one element onto another with the mouse. | yes, asks first |
| `file-upload` | Waits up to 30 seconds for the page to open a file chooser and gives it files from the local machine, or cancels it. | yes, asks first |
| `handle-dialog` | Sets how the next dialog of the page (alert, confirm, prompt) is answered: accept, with an optional text, or dismiss. | yes, asks first |
| `evaluate` | Runs a JavaScript function in the page, or on one element, and returns its result as JSON. | yes, asks first |
| `run-code` | Runs a snippet of Playwright code with the `page`, `context` and `browser` objects, and returns its result as JSON. | yes, asks first |
| `wait-for` | Waits for a number of seconds, a URL, an idle network, or a text to appear or disappear. | no |
| `tabs` | Lists the tabs, opens a new one, closes one or selects one. | yes |
| `resize` | Sets the viewport size of the current tab. | yes |
| `emulate-device` | Replaces the browser context with one that emulates a preset device (`iphone-13`, `iphone-15-pro`, `ipad-pro-11`, `pixel-7`, `galaxy-s23`, `desktop-1080p`, `desktop-720p`) or a custom viewport, user agent and touch setting. The open page is dropped. | yes |
| `start-recording` | Replaces the browser context with one that records video (1280x720 by default). The open page is dropped. | yes |
| `stop-recording` | Ends the recording, stores the `.webm` video as an object and returns a link valid for one hour. | yes |
| `console-messages` | Returns the console messages of the page, filtered by level, text or time, with paging. | no |
| `console-errors` | Returns only the console errors of the page. | no |
| `console-clear` | Empties the captured console messages. | yes |
| `network-requests` | Lists the requests the page made, with method, URL and status. Static resources are left out unless `includeStatic` is true. | no |
| `install` | Downloads Chromium with the Playwright command line of the app. Use it when a tool says the browser is not installed. | yes, asks first |
| `close` | Closes the page, the context and the browser. The next tool starts a new browser. | yes |

That is 27 tools. The ones marked "yes" without "asks first" change only the app's own browser
or the objects it stores, not a web site. The ones that ask first act on a live page, where a
click or a key press can send a form, buy or delete, or act on the local machine (`install`,
`file-upload`). `evaluate` and `run-code` run whatever code they are given.

Screenshots, saved snapshots and videos are stored as objects of the installation. A video is
staged in the system temp directory (`agentapps-playwright/videos`) while it is recorded.

## Setup

```bash
agentapps install app.playwright playwright
agentapps playwright tools
agentapps playwright tool navigate url:https://example.com
agentapps playwright tool console-messages level:error limit:10
```

There is nothing to configure: the app has no secrets.

The app needs Chromium on the machine. The `playwright` package downloads it when the app's
dependencies are installed, unless `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` is set. If it is missing,
the health check reports `BROWSER_NOT_AVAILABLE`; install it with the `install` tool or by hand:

```bash
agentapps playwright tool install
npx playwright install chromium
```

## Terms of use

The app calls no service of its own. Playwright is an open source library from Microsoft under
the Apache License 2.0: <https://github.com/microsoft/playwright/blob/main/LICENSE>. Every web
site the browser opens has its own terms of use, and many forbid automated access or scraping:
check them before pointing an agent at a site. The Agent Apps terms are at
<https://agentapps.tech/terms>.

## Logos

| File | Source | Changes |
|---|---|---|
| assets/logo.svg | <https://playwright.dev/img/playwright-logo.svg>, identical to `packages/web/src/assets/playwright-logo.svg` in microsoft/playwright | none |
| assets/logo-mono.svg | the same file | made from `assets/logo.svg`: its layers kept apart with `fill-opacity` (0.45 for the lightest to 1 for the darkest), each cut where a later one covers it, and its white shapes cut out (paper.js; the shapes are the file's own) |

The manifest also names `icon.svg`.
