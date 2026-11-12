import type { AgentApp } from '@agentapps/sdk';
import { apiGet } from '../lib/client.js';
import {
  type Args,
  boolean,
  COORDINATE_PROPERTIES,
  coordinate,
  date,
  daysInclusive,
  MAX_VARIABLES,
  timezone,
  UNIT_PROPERTIES,
  units,
  variables,
} from '../lib/params.js';
import {
  assertResultSize,
  shapeLocation,
  shapeSeries,
  WEATHER_ATTRIBUTION,
  type WeatherResponse,
} from '../lib/weather.js';

export const HISTORY_DEFAULTS = {
  daily: [
    'weather_code',
    'temperature_2m_max',
    'temperature_2m_min',
    'temperature_2m_mean',
    'precipitation_sum',
    'snowfall_sum',
    'wind_speed_10m_max',
  ],
  hourly: [
    'temperature_2m',
    'relative_humidity_2m',
    'precipitation',
    'weather_code',
    'wind_speed_10m',
  ],
} as const;

export const EARLIEST_DATE = '1940-01-01';
/** A year of daily values fits the result limit; hourly values are capped at 7 days. */
export const MAX_DAILY_RANGE_DAYS = 366;
export const MAX_HOURLY_RANGE_DAYS = 7;

export function registerGetHistoricalWeatherTool(app: AgentApp): void {
  app.tool('get-historical-weather', {
    description:
      `Past weather for a point and a date range, from ${EARLIEST_DATE} to yesterday (ERA5 reanalysis and ` +
      'archived model data). Daily values for up to 366 days per call; with hourly: true, also hourly values ' +
      `for ranges of up to ${MAX_HOURLY_RANGE_DAYS} days. The most recent ~5 days are provisional (model ` +
      'analysis until ERA5 catches up) and may be revised; get-forecast with pastDays also covers them. Returns { location (the grid cell: latitude, longitude, ' +
      'elevation, timezone), startDate, endDate, daily { time: [...], <variable>: [...], weather_description: ' +
      '[...], units }, hourly (same shape, if requested), attribution }. weather_code is a WMO code. ' +
      `Default daily variables: ${HISTORY_DEFAULTS.daily.join(', ')}. Get coordinates from search-locations. ` +
      'Show the attribution with the data (CC BY 4.0).',
    parameters: {
      type: 'object',
      properties: {
        ...COORDINATE_PROPERTIES,
        startDate: {
          type: 'string',
          description: `First day, "YYYY-MM-DD", ${EARLIEST_DATE} or later.`,
        },
        endDate: {
          type: 'string',
          description: `Last day (inclusive), "YYYY-MM-DD", not after yesterday. At most ${MAX_DAILY_RANGE_DAYS} days after startDate (${MAX_HOURLY_RANGE_DAYS} with hourly).`,
        },
        hourly: {
          type: 'boolean',
          description: `Also return hourly values. Requires a range of at most ${MAX_HOURLY_RANGE_DAYS} days. Default false.`,
        },
        dailyVariables: {
          type: 'array',
          items: { type: 'string' },
          maxItems: MAX_VARIABLES,
          description:
            'Daily variables instead of the defaults, Open-Meteo names such as rain_sum, sunshine_duration, wind_gusts_10m_max, apparent_temperature_max, sunrise, sunset. Up to 10.',
        },
        hourlyVariables: {
          type: 'array',
          items: { type: 'string' },
          maxItems: MAX_VARIABLES,
          description: `Hourly variables instead of the defaults (${HISTORY_DEFAULTS.hourly.join(', ')}), e.g. cloud_cover, snow_depth, pressure_msl, wind_gusts_10m. Up to 10.`,
        },
        ...UNIT_PROPERTIES,
      },
      required: ['latitude', 'longitude', 'startDate', 'endDate'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Args;
      const latitude = coordinate(a, 'latitude');
      const longitude = coordinate(a, 'longitude');
      const start = date(a, 'startDate');
      const end = date(a, 'endDate');
      const wantHourly = boolean(a, 'hourly', false);

      if (start.text < EARLIEST_DATE) {
        throw new Error(
          `[BAD_REQUEST] startDate must be ${EARLIEST_DATE} or later; got ${start.text}.`,
        );
      }
      if (end.ms < start.ms) {
        throw new Error(`[BAD_REQUEST] endDate ${end.text} is before startDate ${start.text}.`);
      }
      const today = new Date().toISOString().slice(0, 10);
      if (end.text >= today) {
        throw new Error(
          `[BAD_REQUEST] endDate must be before today (${today} UTC); for today and the future use get-forecast.`,
        );
      }
      const days = daysInclusive(start.ms, end.ms);
      const maxDays = wantHourly ? MAX_HOURLY_RANGE_DAYS : MAX_DAILY_RANGE_DAYS;
      if (days > maxDays) {
        throw new Error(
          `[BAD_REQUEST] The range has ${days} days; the maximum is ${maxDays}${wantHourly ? ' with hourly: true' : ''}. ` +
            'Split it into several calls.',
        );
      }
      const daily = variables(a, 'dailyVariables', HISTORY_DEFAULTS.daily);
      const hourly = wantHourly
        ? variables(a, 'hourlyVariables', HISTORY_DEFAULTS.hourly)
        : undefined;

      const body = await apiGet<WeatherResponse>('/v1/archive', ctx, {
        host: 'archive',
        params: {
          latitude,
          longitude,
          start_date: start.text,
          end_date: end.text,
          daily,
          hourly,
          timezone: timezone(a),
          ...units(a),
        },
      });

      return assertResultSize(
        {
          location: shapeLocation(body),
          startDate: start.text,
          endDate: end.text,
          daily: shapeSeries(body.daily, body.daily_units),
          hourly: shapeSeries(body.hourly, body.hourly_units),
          attribution: WEATHER_ATTRIBUTION,
        },
        'Use a shorter date range or fewer variables.',
      );
    },
  });
}
