import type { AgentApp } from '@agentapps/sdk';
import { apiGet } from '../lib/client.js';
import {
  type Args,
  boolean,
  COORDINATE_PROPERTIES,
  coordinate,
  integer,
  MAX_VARIABLES,
  timezone,
  UNIT_PROPERTIES,
  units,
  variables,
} from '../lib/params.js';
import {
  assertResultSize,
  shapeCurrent,
  shapeLocation,
  shapeSeries,
  WEATHER_ATTRIBUTION,
  type WeatherResponse,
} from '../lib/weather.js';

export const FORECAST_DEFAULTS = {
  current: [
    'temperature_2m',
    'apparent_temperature',
    'relative_humidity_2m',
    'precipitation',
    'weather_code',
    'cloud_cover',
    'wind_speed_10m',
    'wind_direction_10m',
    'wind_gusts_10m',
    'is_day',
  ],
  daily: [
    'weather_code',
    'temperature_2m_max',
    'temperature_2m_min',
    'precipitation_sum',
    'precipitation_probability_max',
    'wind_speed_10m_max',
    'sunrise',
    'sunset',
  ],
  hourly: [
    'temperature_2m',
    'precipitation_probability',
    'precipitation',
    'weather_code',
    'wind_speed_10m',
  ],
} as const;

/** Hourly series are capped at 7 days (168 values per variable) to stay under the result limit. */
export const MAX_HOURLY_DAYS = 7;

export function registerGetForecastTool(app: AgentApp): void {
  app.tool('get-forecast', {
    description:
      'Weather forecast for a point: current conditions, a daily forecast for up to 16 days and, on request, ' +
      `hourly values (at most ${MAX_HOURLY_DAYS} days in total, pastDays included). pastDays adds up to 92 ` +
      'recent past days (use it for "yesterday" or last week; older dates: get-historical-weather). ' +
      'Returns { location (the model grid cell: latitude, longitude, elevation, timezone, utcOffsetSeconds), ' +
      'current { time, <variable>: value, weather_description, units }, daily { time: [...], <variable>: [...], ' +
      'weather_description: [...], units }, hourly (same shape, if requested), attribution }. Times are local ' +
      'to `timezone`, ISO 8601 without offset. weather_code is a WMO code; weather_description is its text. ' +
      `Default daily variables: ${FORECAST_DEFAULTS.daily.join(', ')}. Get coordinates from search-locations. ` +
      'Show the attribution with the data (CC BY 4.0).',
    parameters: {
      type: 'object',
      properties: {
        ...COORDINATE_PROPERTIES,
        forecastDays: {
          type: 'integer',
          minimum: 1,
          maximum: 16,
          description: 'Days of forecast starting today, 1-16. Default 7.',
        },
        pastDays: {
          type: 'integer',
          minimum: 0,
          maximum: 92,
          description: 'Recent past days to include before today, 0-92. Default 0.',
        },
        hourly: {
          type: 'boolean',
          description: `Also return hourly values. Requires pastDays + forecastDays <= ${MAX_HOURLY_DAYS}. Default false.`,
        },
        current: {
          type: 'boolean',
          description: 'Return current conditions. Default true.',
        },
        dailyVariables: {
          type: 'array',
          items: { type: 'string' },
          maxItems: MAX_VARIABLES,
          description:
            'Daily variables instead of the defaults, Open-Meteo names such as temperature_2m_max, rain_sum, snowfall_sum, uv_index_max, sunshine_duration, wind_gusts_10m_max. Up to 10.',
        },
        hourlyVariables: {
          type: 'array',
          items: { type: 'string' },
          maxItems: MAX_VARIABLES,
          description: `Hourly variables instead of the defaults (${FORECAST_DEFAULTS.hourly.join(', ')}), e.g. relative_humidity_2m, cloud_cover, snowfall, uv_index, visibility. Up to 10.`,
        },
        currentVariables: {
          type: 'array',
          items: { type: 'string' },
          maxItems: MAX_VARIABLES,
          description:
            'Current-condition variables instead of the defaults; any hourly variable name. Up to 10.',
        },
        ...UNIT_PROPERTIES,
      },
      required: ['latitude', 'longitude'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      // Repeating the call changes nothing; the answer only moves as new model runs arrive.
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Args;
      const latitude = coordinate(a, 'latitude');
      const longitude = coordinate(a, 'longitude');
      const forecastDays = integer(a, 'forecastDays', 1, 16, 7);
      const pastDays = integer(a, 'pastDays', 0, 92, 0);
      const wantHourly = boolean(a, 'hourly', false);
      const wantCurrent = boolean(a, 'current', true);
      if (wantHourly && pastDays + forecastDays > MAX_HOURLY_DAYS) {
        throw new Error(
          `[BAD_REQUEST] hourly covers at most ${MAX_HOURLY_DAYS} days; pastDays + forecastDays is ` +
            `${pastDays + forecastDays}. Lower forecastDays/pastDays or call again for another window.`,
        );
      }
      const daily = variables(a, 'dailyVariables', FORECAST_DEFAULTS.daily);
      const hourly = wantHourly
        ? variables(a, 'hourlyVariables', FORECAST_DEFAULTS.hourly)
        : undefined;
      const current = wantCurrent
        ? variables(a, 'currentVariables', FORECAST_DEFAULTS.current)
        : undefined;

      const body = await apiGet<WeatherResponse>('/v1/forecast', ctx, {
        host: 'forecast',
        params: {
          latitude,
          longitude,
          forecast_days: forecastDays,
          past_days: pastDays || undefined,
          daily,
          hourly,
          current,
          timezone: timezone(a),
          ...units(a),
        },
      });

      return assertResultSize(
        {
          location: shapeLocation(body),
          current: shapeCurrent(body.current, body.current_units),
          daily: shapeSeries(body.daily, body.daily_units),
          hourly: shapeSeries(body.hourly, body.hourly_units),
          attribution: WEATHER_ATTRIBUTION,
        },
        'Ask for fewer days or fewer variables.',
      );
    },
  });
}
