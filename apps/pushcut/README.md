# Pushcut

Lets an agent send notifications to a person's iOS devices and run their Shortcuts and HomeKit
scenes, through the Pushcut API (`https://api.pushcut.io/v1`). A notification must already be
defined in the Pushcut app: the agent sends it by name and can override its title, text, image
and sound. Running a shortcut or a scene needs a Pushcut Automation Server on one of the
devices.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `send-notification` | Sends a notification defined in the Pushcut app, to all devices or to the ones named. | yes, asks first |
| `execute` | Runs a Shortcut or a HomeKit scene on the Automation Server. Give one of `shortcut` or `homekit`, not both. | yes, asks first |
| `list-devices` | Lists the active devices of the Pushcut account. | no |
| `list-notifications` | Lists the notification definitions; their names are what `send-notification` takes. | no |

Limits:

- A sent notification or a started shortcut cannot be taken back.
- Notification images must be JPEG, PNG or GIF, 10 MB at most.
- Requests are not retried.

## Setup

```bash
agentapps install app.pushcut pushcut
agentapps config pushcut API_KEY:<your key>
agentapps pushcut tools
agentapps pushcut tool list-devices
```

`API_KEY` is an installation secret: it identifies one person's Pushcut account, and their
devices receive the notifications. Generate it in the Pushcut app under Account > API Keys.

## Terms of use

Pushcut's own terms apply to everything the app does on your behalf:
<https://www.pushcut.io/terms>.

## Logos

| File | Source | Changes |
|---|---|---|
| assets/logo.png | the app's App Store artwork at 1024x1024 (app id 1450936447), from Apple's image host | none |

TODO: no official one-colour SVG found yet for `assets/logo-mono.svg`. Pushcut has no press or brand page and publishes no vector; its site has the same icon at 256x256.
