# Calendly

Lets an agent read a Calendly account through the Calendly API (`https://api.calendly.com`):
event types, scheduled events, invitees, availability schedules, routing forms and webhook
subscriptions. It can also cancel a scheduled event and create or delete a webhook subscription.
It cannot book a meeting.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `get-current-user` | Returns the authenticated user, with the user and organization URIs the other tools ask for. | no |
| `list-event-types` | Lists a user's event types. | no |
| `get-event-type` | Returns one event type by id. | no |
| `list-scheduled-events` | Lists a user's scheduled events, active or canceled. | no |
| `get-scheduled-event` | Returns one scheduled event by id. | no |
| `list-invitees` | Lists the invitees of a scheduled event. | no |
| `get-invitee` | Returns one invitee of a scheduled event. | no |
| `cancel-event` | Cancels a scheduled event, with an optional reason. It cannot be undone. | yes, asks first |
| `list-availability-schedules` | Lists a user's availability schedules. | no |
| `list-webhook-subscriptions` | Lists the organization's webhook subscriptions. | no |
| `create-webhook-subscription` | Creates a webhook subscription for the given events and callback URL. | yes, asks first |
| `delete-webhook-subscription` | Deletes a webhook subscription. | yes, asks first |
| `list-routing-forms` | Lists the organization's routing forms. | no |

Limits:

- The app cannot create or reschedule events, or change event types and availability.
- Requests are not retried.

## Setup

```bash
agentapps install app.calendly calendly
agentapps config calendly ACCESS_TOKEN:<your personal access token>
agentapps calendly tools
agentapps calendly tool get-current-user
```

`ACCESS_TOKEN` is an installation secret: each installation has its own. It is a Calendly
personal access token, created in Calendly under Integrations, API and webhooks.

## Terms of use

Calendly's own terms apply to everything the app does on your behalf. They are listed at
<https://calendly.com/legal>.

## Logos

| File | Source | Changes |
|---|---|---|
| assets/logo.svg | the icon of calendly.com, <https://calendly.com/media/favicon/icon.svg>, the same mark its header shows | none |
| assets/logo-mono.svg | the same file | its two paths joined into one with `fill-rule="evenodd"`, so the white shape is cut out of the background instead of painted on it; the colours replaced by `currentColor`. The path data is unchanged. Asked for by the project owner. |

Calendly's media kit (<https://cdn.calendlycms.com/Calendly_Complete_Media_Kit_012225.zip>, linked
from <https://calendly.com/newsroom>) still carries the previous design of the mark, so it is not
used.
