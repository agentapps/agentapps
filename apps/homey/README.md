# Homey

Lets an agent read and control a Homey smart home hub: list devices, zones, flows, installed
apps and notifications, read a device's state, the live energy report, system information and
logic variables, set a device capability or a logic variable, and trigger a flow. It reaches the
hub through the Athom Cloud API with the `homey-api` library and OAuth.

Limits: the app works on the first Homey of the connected account only; an account with several
hubs cannot choose another one. It cannot create or edit flows, devices or zones.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-devices` | Lists devices with their zone, class, capabilities and availability. | no |
| `get-device` | Returns the details and current state of one device. | no |
| `list-zones` | Lists zones (rooms and areas). | no |
| `list-flows` | Lists flows (automations). | no |
| `list-apps` | Lists the apps installed on the Homey. | no |
| `list-notifications` | Lists notifications: alerts, warnings and system messages. | no |
| `get-variables` | Lists the logic variables. | no |
| `get-energy` | Returns the live energy report: power used and generated. | no |
| `get-system-info` | Returns system information: firmware, model, uptime, Wi-Fi status. | no |
| `get-user` | Returns the authenticated user. | no |
| `set-capability` | Sets a device capability value: on or off, brightness, temperature. | yes, asks first |
| `set-variable` | Sets the value of a logic variable. | yes, asks first |
| `trigger-flow` | Runs a flow by its id. | yes, asks first |

The three tools that write are marked `sensitive`, so hosts ask before running them.
`trigger-flow` is also `destructiveHint: true`.

## Setup

The app signs in with Athom's OAuth 2.0. Whoever runs the Station registers one OAuth client;
each user then connects their own Homey account.

1. Register a Homey Web API client with Athom to get a client id and a client secret. Set its
   redirect URI to the one the Station uses: `{station URL}/auth/callback`.
2. Store the client as system secrets, shared by every installation of the app:

```bash
agentapps config app.homey CLIENT_ID:<client id> CLIENT_SECRET:<client secret>
```

3. Install the app and connect an account:

```bash
agentapps install app.homey homey
agentapps homey auth
agentapps homey tools
agentapps homey tool list-devices
```

The OAuth flow stores the installation secrets `ACCESS_TOKEN`, `REFRESH_TOKEN`, `TOKEN_TYPE` and
`EXPIRES_IN`; users never set them by hand. The scopes requested are listed in `agentapp.json`:
read access to devices, flows, zones, energy, insights, notifications, presence, apps and the
user, plus `homey.device.control`, `homey.flow.start` and `homey.logic` for the three tools that
write.

## Terms of use

Athom's terms for Homey apply to everything the app does on your behalf:
<https://legal.athom.com/?document=terms-and-conditions&language=en>. TODO: note here the terms
and limits of the Athom Web API for third-party clients; they were not checked for this README.

## Logos

| File | Source | Changes |
|---|---|---|
| assets/logo.svg | Homey media kit, the Google Drive folder at <https://homey.app/en-us/press/#media-kit>, Logos / Homey Logo / Vector, `Homey Color RGB.svg` | removed the XML declaration |
| assets/logo-mono.svg | the same file | an exception asked for by the project owner, for this logo only: it is derived from the official file, not a copy of it. It is the ring (the file's clip path) with three strokes cut out of it. Each stroke follows the middle line of one of the file's "Light" shapes that start at the outer edge (`Light`, `Light-2`, `Light-3`), at an even width of 28 units so it reads at small sizes. The original shapes taper and stop short of the hole: here each stroke is led out past the outer edge at its start and keeps spiralling inwards at the rate it already had until it meets the hole, and those two stretches are not in the original. The colours, the shadows, the other three lights and the embedded image are left out. Made with paper.js and paperjs-offset. |

The kit's guidelines describe a black-and-white version, but its Vector folder has only the colour
one (`.ai`, `.pdf`, `.svg`).
