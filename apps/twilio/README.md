# Twilio

Lets an agent use a Twilio account through the Twilio REST API
(`https://api.twilio.com/2010-04-01`) and the Lookups API (`https://lookups.twilio.com/v1`):
send SMS and WhatsApp messages, start phone calls, read messages, calls and recordings, list the
account's phone numbers, search numbers available to buy and look up a phone number. It uses one
Account SID and Auth Token for every installation, so every installation sends from the same
Twilio account. It does not buy phone numbers. Requests are not retried.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `send-sms` | Sends an SMS from one of the account's numbers. | yes, asks first |
| `list-messages` | Lists messages, optionally filtered by sender, recipient and date. | no |
| `get-message` | Returns one message by its SID. | no |
| `make-call` | Starts a phone call controlled by a TwiML URL or inline TwiML. | yes, asks first |
| `list-calls` | Lists calls, optionally filtered by number and status. | no |
| `get-call` | Returns one call by its SID. | no |
| `list-phone-numbers` | Lists the account's incoming phone numbers. | no |
| `get-account` | Returns the account's SID, name, status and type. | no |
| `list-recordings` | Lists recordings, optionally filtered by call and date. | no |
| `get-recording` | Returns one recording by its SID. | no |
| `lookup-phone` | Looks up a phone number: formatting and, on request, carrier or caller name. | no |
| `list-available-numbers` | Searches local numbers available to buy in a country. | no |
| `send-whatsapp` | Sends a WhatsApp message from a WhatsApp-enabled Twilio number or the sandbox number. | yes, asks first |

## Setup

```bash
agentapps install app.twilio twilio
agentapps config app.twilio ACCOUNT_SID:<your account SID> AUTH_TOKEN:<your auth token>
agentapps twilio tools
agentapps twilio tool list-messages pageSize:5
```

`ACCOUNT_SID` and `AUTH_TOKEN` are system secrets: one Twilio account for every installation of
the app. Both are on the first page of the Twilio Console, under Account Info.

## Terms of use

Twilio's own terms apply to everything the app does on your behalf: the Terms of Service,
<https://www.twilio.com/en-us/legal/tos>, and the Acceptable Use Policy,
<https://www.twilio.com/en-us/legal/aup>, which covers what you may send and to whom.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (Twilio's press
kit, brand guidelines or its own site). They have been in the repository since before this
README existed and their origin was not written down.
