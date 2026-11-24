# ElevenLabs

Lets an agent turn text into speech and look at the voices and the subscription of an
ElevenLabs account. It calls the ElevenLabs API at `https://api.elevenlabs.io/v1` with one API
key.

Limits:

- `generate-speech` returns the whole audio as base64 in the tool result; nothing is streamed
  or saved to a file. Long texts give large results.
- Every `generate-speech` call uses characters of the account's ElevenLabs quota, which is why
  the tool asks first. `get-subscription` shows what is left.
- When no voice is given the app uses the voice id `JBFqnCBsd6RMkjVDRZzb`, and when no model is
  given, `eleven_flash_v2_5`. The default output format is `mp3_44100_128`.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `generate-speech` | Generates speech from text with a voice, a model and voice settings, and returns the audio as base64. | yes, asks first |
| `list-voices` | Lists the account's voices, filtered by name or category. | no |
| `get-voice` | Returns one voice by id, with its settings and samples. | no |
| `get-subscription` | Returns the subscription: tier, characters used and character limit. | no |

## Setup

```bash
agentapps install app.elevenlabs elevenlabs
agentapps config app.elevenlabs API_KEY:<your key>
agentapps elevenlabs tools
agentapps elevenlabs tool list-voices limit:5
```

`API_KEY` is a system secret: one key for every installation of the app. Create one in
ElevenLabs under Settings > API Keys (<https://elevenlabs.io/app/settings/api-keys>).

## Terms of use

ElevenLabs' own terms apply to everything the app does with your key, including what you may do
with the generated audio: <https://elevenlabs.io/terms-of-use>. TODO: note here any limit on
commercial use that matters to someone installing the app.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (ElevenLabs'
brand kit or its own site). They have been in the repository since before this README existed
and their origin was not written down.
