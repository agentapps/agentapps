# Open-Meteo

Lets an agent look up places by name and get their weather from the free
[Open-Meteo](https://open-meteo.com/) APIs: current conditions, daily and hourly forecasts up to
16 days, recent past days, and historical weather back to 1940. No account or API key is needed.
It calls three Open-Meteo hosts: `geocoding-api.open-meteo.com` (place search),
`api.open-meteo.com` (forecast) and `archive-api.open-meteo.com` (historical weather). All tools
are read-only.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `search-locations` | Find places by name or postal code; returns coordinates, country, region, time zone, population | no |
| `get-forecast` | Current conditions, daily forecast (1-16 days), optional hourly values (up to 7 days), optional recent past days (up to 92) | no |
| `get-historical-weather` | Daily values for any range of up to 366 days from 1940-01-01 to yesterday; hourly for up to 7 days | no |

All tools are `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`,
`openWorldHint: true`, `sensitive: false`.

Typical flow: `search-locations name:Barcelona` -> take `latitude`/`longitude` ->
`get-forecast latitude:41.38879 longitude:2.15899`.

Notes:

- Time series are columnar: `time: [...]` plus one array per variable, with a `units` object and
  a `weather_description` array that translates the WMO `weather_code`.
- Variables can be chosen per call (`dailyVariables`, `hourlyVariables`, `currentVariables`,
  up to 10 each) using Open-Meteo's names, for example `uv_index_max` or `snowfall_sum`. See
  <https://open-meteo.com/en/docs> and <https://open-meteo.com/en/docs/historical-weather-api>.
- Results are capped at 7 days of hourly data and 366 days of daily data per call to stay under
  the 50,000-character tool result limit; the tools reject larger requests before calling the
  API.
- The returned `location` is the model grid cell, which can be a few km from the requested
  point.
- The latest ~5 days of the historical archive come from weather-model analysis until the ERA5
  reanalysis catches up, so they may be revised; `get-forecast` with `pastDays` also covers them.
- The CLI turns numeric values into numbers, so a postal code with a leading zero loses it
  (`name:08001` becomes `8001`, quotes do not help). Pass the arguments as one JSON object
  instead: `agentapps open-meteo tool search-locations '{"name":"08001"}'`.

## Setup

```bash
agentapps install app.open-meteo open-meteo
# no secrets needed
agentapps open-meteo tools
```

No account or key is needed.

## Terms of use

From <https://open-meteo.com/en/terms> and <https://open-meteo.com/en/licence>:

- **Non-commercial use only** on the free API: no subscriptions, ads or integration into
  commercial products. Commercial use needs a paid Open-Meteo plan, which uses different hosts
  (`customer-*`) and an API key; this app does not support that yet (every declared secret is
  required in Agent Apps, so an optional key is not possible without forcing one on everybody).
- **Rate limits** on the free API: under 600 calls per minute, 5,000 per hour, 10,000 per day
  and 300,000 per month. The app retries a short `429` once or twice and otherwise reports
  `[RATE_LIMITED]`.
- **Attribution**: data are CC BY 4.0. Show a link next to the data, for example
  "Weather data by Open-Meteo.com" linking to <https://open-meteo.com/>. Every result carries an
  `attribution` field for this. Place search data come from GeoNames (CC BY 4.0).

## Logos

| File | Source | Changes |
|---|---|---|
| assets/logo-mono.svg | The logo in the header of open-meteo.com: `src/lib/assets/icons/sun.svelte` in [open-meteo/open-meteo-website](https://github.com/open-meteo/open-meteo-website) (commit 3fbe71f), imported as `Logo` by `src/lib/components/header/header.svelte`. The glyph is the Bootstrap Icons "cloud-sun" icon (MIT), which Open-Meteo uses as its logo. | removed `fill="currentColor"`, `class`, `style` and the Svelte `{width}`/`{height}` props; paths unchanged |
| assets/logo.svg | not added | - |

TODO (`assets/logo.svg`): no official colour logo found that meets the rules. Searched: the
open-meteo.com home page and header (only the single-colour `currentColor` SVG above, used for
`logoMono`), `/en/terms` and `/en/licence` (no press or brand page), the
`open-meteo/open-meteo-website` repo `static/` (the coloured "om" app icon exists only as PNG,
largest `android-chrome-512x512.png`, below the 1024x1024 minimum; no SVG). Add one when an
official SVG or a 1024px PNG exists, or ask the maintainers.
