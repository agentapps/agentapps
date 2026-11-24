# Higgsfield

Lets an agent generate images and videos with Higgsfield: text to image, text to video, image to
video, and images of a consistent character with Soul. It calls the Higgsfield platform API
(`https://platform.higgsfield.ai`) with an API key and secret.

Limits: every generation tool submits a paid request, and the credits it spends cannot be taken
back. Generation is asynchronous: a tool returns a request id at once, and the agent reads the
result with `get-prediction`, unless it passes `wait` to poll until the result is ready.
`list-models` returns a curated list held in the code, not the full Higgsfield catalogue.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-models` | Lists the models the app knows, optionally by type. No API call. | no |
| `get-prediction` | Returns the status and result of a prediction; can wait for it to finish. | no |
| `generate-image` | Generates images from a text prompt with Seedream v4. | yes, asks first |
| `generate-video` | Generates a video from a text prompt. | yes, asks first |
| `animate-image` | Turns an image into a video with motion. | yes, asks first |
| `generate-soul-image` | Generates images of the same character from a reference image, with Soul. | yes, asks first |
| `run` | Runs any Higgsfield model by its endpoint identifier, with a raw input object. | yes, asks first |
| `cancel-prediction` | Cancels a queued or processing prediction. | yes, asks first |

Every tool that writes is marked `sensitive` and `destructiveHint: true`, so hosts ask before
running it.

## Setup

```bash
agentapps install app.higgsfield higgsfield
agentapps config higgsfield API_KEY:<your key> API_SECRET:<your secret>
agentapps higgsfield tools
agentapps higgsfield tool list-models type:text-to-image
```

`API_KEY` and `API_SECRET` are installation secrets: each installation uses its own pair. Create
them in your Higgsfield API account (<https://cloud.higgsfield.ai>). The app sends them as a
`Key <key>:<secret>` authorization header on each call and never stores them.

## Terms of use

Higgsfield's own terms apply to everything the app generates on your behalf:
<https://higgsfield.ai/terms-of-use-agreement>. They also set what the generated media may be
used for; this README does not summarise them, and it lists no prices or credit costs.

## Logos

| File | Source | Changes |
|---|---|---|
| assets/logo.png | the icon of higgsfield.ai, <https://higgsfield.ai/icon.png> | none |
| assets/logo-mono.svg | the rope of the logo in the header of <https://higgsfield.ai>, which the page carries inline and not as a file | saved as a file of its own: the rope's path, unchanged, without the mask the page uses to animate it and without the tile behind it; `viewBox` widened so it does not touch the edges. Asked for by the project owner. |

TODO: `assets/logo.png` is 192x192, under the 1024 minimum, and `check-app` fails on it.
Higgsfield has no press or brand page (`/brand` and `/press` answer 404); its largest icon is
512x512 (<https://higgsfield.ai/pwa/icon-512.png>).
