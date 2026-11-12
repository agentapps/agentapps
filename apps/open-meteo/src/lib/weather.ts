/**
 * Shapes Open-Meteo forecast and archive responses into compact tool results.
 *
 * Time series stay columnar (`time: [...]` plus one array per variable), as the API sends
 * them: it is the smallest shape, which matters for the 50,000-character result limit.
 */

/** Open-Meteo data are CC BY 4.0 and must be credited with a link next to where they are shown. */
export const WEATHER_ATTRIBUTION = {
  text: 'Weather data by Open-Meteo.com',
  url: 'https://open-meteo.com/',
  license: 'CC BY 4.0',
} as const;

/** The geocoding database is GeoNames (CC BY 4.0), served by Open-Meteo. */
export const LOCATION_ATTRIBUTION = {
  text: 'Location data from GeoNames, via Open-Meteo.com',
  url: 'https://open-meteo.com/',
  license: 'CC BY 4.0',
} as const;

/** WMO weather interpretation codes, as documented at https://open-meteo.com/en/docs. */
export const WMO_CODES: Readonly<Record<number, string>> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  56: 'Light freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snowfall',
  73: 'Moderate snowfall',
  75: 'Heavy snowfall',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  97: 'Heavy thunderstorm',
  99: 'Thunderstorm with heavy hail',
};

export function describeWeatherCode(code: unknown): string | null {
  if (typeof code !== 'number') return null;
  return WMO_CODES[code] ?? `Unknown WMO code ${code}`;
}

/** The parts of a forecast/archive response the tools use. */
export interface WeatherResponse {
  latitude: number;
  longitude: number;
  elevation?: number;
  timezone?: string;
  timezone_abbreviation?: string;
  utc_offset_seconds?: number;
  current?: Record<string, unknown>;
  current_units?: Record<string, string>;
  hourly?: Record<string, unknown[]>;
  hourly_units?: Record<string, string>;
  daily?: Record<string, unknown[]>;
  daily_units?: Record<string, string>;
}

/** The grid cell the data are for; it can be a few km from the requested point. */
export function shapeLocation(body: WeatherResponse) {
  return {
    latitude: body.latitude,
    longitude: body.longitude,
    elevation: body.elevation,
    timezone: body.timezone,
    timezoneAbbreviation: body.timezone_abbreviation,
    utcOffsetSeconds: body.utc_offset_seconds,
  };
}

/** Units without the noise entries (`time: "iso8601"`, `interval: "seconds"`). */
function shapeUnits(units: Record<string, string> | undefined) {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(units ?? {})) {
    if (key === 'time' || key === 'interval') continue;
    out[key] = value;
  }
  return out;
}

/** A columnar series plus `weather_description` next to `weather_code`. */
export function shapeSeries(
  series: Record<string, unknown[]> | undefined,
  units: Record<string, string> | undefined,
) {
  if (!series) return undefined;
  const out: Record<string, unknown> = { units: shapeUnits(units), ...series };
  if (Array.isArray(series.weather_code)) {
    out.weather_description = series.weather_code.map(describeWeatherCode);
  }
  return out;
}

export function shapeCurrent(
  current: Record<string, unknown> | undefined,
  units: Record<string, string> | undefined,
) {
  if (!current) return undefined;
  const { interval: _interval, ...values } = current;
  const out: Record<string, unknown> = { ...values, units: shapeUnits(units) };
  if ('weather_code' in values) out.weather_description = describeWeatherCode(values.weather_code);
  return out;
}

/** Results above this are truncated by the SDK into an unparseable string. */
export const MAX_RESULT_CHARS = 45_000;

/** Refuses to return a result the SDK would truncate, with what to change instead. */
export function assertResultSize<T>(result: T, advice: string): T {
  const size = JSON.stringify(result).length;
  if (size > MAX_RESULT_CHARS) {
    throw new Error(
      `[RESULT_TOO_LARGE] The result would be ${size} characters (limit ${MAX_RESULT_CHARS}). ${advice}`,
    );
  }
  return result;
}
