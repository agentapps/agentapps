# Google Calendar

Lets an agent work with a Google account's calendars: list, read, create, update, move and
delete events, create events from a line of text, list and create calendars, and query
free/busy time. It calls the Google Calendar API v3 at `https://www.googleapis.com/calendar/v3`
with the OAuth token of the connected account.

The app also emits a `calendar_updated` event when one of its tools creates, changes, moves or
deletes an event, and, while a host is subscribed, when it finds changes made elsewhere. It
looks for those every 20 minutes.

Limits:

- Event tools use the `primary` calendar unless `calendarId` is given.
- `list-events` returns 10 events by default and 100 at most.
- `delete-event` cannot be undone by the app.
- One installation per user: the app is a singleton.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-events` | Lists the events of a calendar, optionally between two times. | no |
| `get-event` | Returns one event by id. | no |
| `create-event` | Creates an event with a summary, start and end time, and optional description, location and attendees. | yes, asks first |
| `quick-add-event` | Creates an event from a line of text such as "Lunch with Alice tomorrow at noon". | yes, asks first |
| `update-event` | Changes an event's summary, description, location, times or attendees. | yes, asks first |
| `move-event` | Moves an event to another calendar. | yes, asks first |
| `delete-event` | Deletes an event. | yes, asks first |
| `list-calendars` | Lists the user's calendars. | no |
| `create-calendar` | Creates a calendar. | yes, asks first |
| `get-freebusy` | Returns the busy periods of one or more calendars in a time range. | no |
| `authenticate` | Starts the Google sign-in and stores the tokens of the account that signs in. | yes, asks first |
| `open-calendar` | Opens Google Calendar in the user's browser. | no |

## Setup

In a Google Cloud project, enable the **Google Calendar API**. Create an OAuth client of type
*Web application* (<https://console.cloud.google.com/apis/credentials>) with the redirect URI
the Station uses, `{station URL}/auth/callback`, and add the Calendar scopes to the consent
screen: `https://www.googleapis.com/auth/calendar.readonly` and
`https://www.googleapis.com/auth/calendar.events`, which the manifest declares, and
`https://www.googleapis.com/auth/calendar`, which the `authenticate` tool asks for.

```bash
agentapps install app.google.calendar calendar
agentapps config app.google.calendar CLIENT_ID:<client id> CLIENT_SECRET:<client secret>
agentapps calendar auth
agentapps calendar tools
agentapps calendar tool list-events maxResults:5
```

`CLIENT_ID` and `CLIENT_SECRET` are system secrets: one OAuth client for every
installation of the app. `agentapps calendar auth` signs the installation in and stores its
tokens; the host refreshes the access token when it expires, so the client secret never
reaches the app.

## Terms of use

Google's own terms apply to everything the app does on your behalf: the Google APIs Terms of
Service at <https://developers.google.com/terms> and the Google API Services User Data Policy
at <https://developers.google.com/terms/api-services-user-data-policy>.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (Google's
brand resources or its own site). They have been in the repository since before this README
existed and their origin was not written down.
