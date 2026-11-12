/**
 * Tool, client and health tests for the Open-Meteo Agent App. The API is mocked (fetch);
 * mock bodies follow real response shapes captured during research, with synthetic values.
 */

import { describe, expect, it, vi } from 'vitest';
import { BASE_URL } from '../src/lib/client.js';
import {
  callTool,
  jsonResponse,
  listTools,
  mockFetch,
  requestOf,
  runHealthCheck,
} from './harness.js';

describe('Open-Meteo — health', () => {
  it('reports ready when the API answers', async () => {
    const fetchMock = mockFetch(jsonResponse({}));
    const health = await runHealthCheck();
    expect(health.status).toBe('ready');
    expect(requestOf(fetchMock).url.origin).toBe(new URL(BASE_URL).origin);
  });

  it('reports degraded with a clear message when the API is unreachable', async () => {
    const err = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(err));
    const health = await runHealthCheck();
    expect(health.status).toBe('degraded');
    expect(String(health.message)).toContain(new URL(BASE_URL).host);
  });
});

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

describe('search-locations', () => {
  // Shape of a real geocoding response, synthetic values. Empty fields are omitted by the API.
  const geoBody = {
    results: [
      {
        id: 1000001,
        name: 'Testville',
        latitude: 41.5,
        longitude: 2.25,
        elevation: 15.0,
        feature_code: 'PPLA',
        country_code: 'ES',
        admin1_id: 2000001,
        admin2_id: 2000002,
        timezone: 'Europe/Madrid',
        population: 123456,
        postcodes: ['08001', '08002'],
        country_id: 3000001,
        country: 'Spain',
        admin1: 'Catalonia',
        admin2: 'Testville',
      },
    ],
    generationtime_ms: 0.5,
  };

  it('queries the geocoding host and returns curated locations with attribution', async () => {
    const fetchMock = mockFetch(jsonResponse(geoBody));
    const result = await callTool('search-locations', { name: 'Testville', count: 3 });
    expect(result.success).toBe(true);
    const { url, init } = requestOf(fetchMock);
    expect(url.origin).toBe('https://geocoding-api.open-meteo.com');
    expect(url.pathname).toBe('/v1/search');
    expect(url.searchParams.get('name')).toBe('Testville');
    expect(url.searchParams.get('count')).toBe('3');
    expect(url.searchParams.get('language')).toBe('en');
    expect(url.searchParams.has('countryCode')).toBe(false);
    expect(init.method).toBe('GET');
    const out = result.result as Record<string, any>;
    expect(out.count).toBe(1);
    expect(out.locations[0]).toEqual({
      id: 1000001,
      name: 'Testville',
      latitude: 41.5,
      longitude: 2.25,
      elevation: 15.0,
      country: 'Spain',
      countryCode: 'ES',
      admin1: 'Catalonia',
      admin2: 'Testville',
      timezone: 'Europe/Madrid',
      population: 123456,
      featureCode: 'PPLA',
    });
    expect(out.attribution.license).toBe('CC BY 4.0');
  });

  it('returns an empty list when the API omits `results` (no match)', async () => {
    mockFetch(jsonResponse({ generationtime_ms: 0.4 }));
    const result = await callTool('search-locations', { name: 'Nowhereville' });
    expect(result.success).toBe(true);
    expect((result.result as Record<string, any>).locations).toEqual([]);
  });

  it('accepts a number name (the CLI turns digit-only values into numbers)', async () => {
    const fetchMock = mockFetch(jsonResponse({ generationtime_ms: 0.4 }));
    await callTool('search-locations', { name: 10115, countryCode: 'de', language: 'DE' });
    const { url } = requestOf(fetchMock);
    expect(url.searchParams.get('name')).toBe('10115');
    expect(url.searchParams.get('countryCode')).toBe('DE');
    expect(url.searchParams.get('language')).toBe('de');
  });

  it.each([
    [{ name: 'a' }, 'name'],
    [{ name: 'Paris', count: 50 }, 'count'],
    [{ name: 'Paris', countryCode: 'ESP' }, 'countryCode'],
    [{ name: 'Paris', language: 'en&x=1' }, 'language'],
  ])('rejects bad arguments before any request: %j', async (args, field) => {
    const fetchMock = mockFetch();
    const result = await callTool('search-locations', args);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain('[BAD_REQUEST]');
    expect(JSON.stringify(result.error)).toContain(field);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// Shape of a real forecast response (current + hourly + daily), synthetic values.
const forecastBody = {
  latitude: 41.375,
  longitude: 2.125,
  generationtime_ms: 0.15,
  utc_offset_seconds: 7200,
  timezone: 'Europe/Madrid',
  timezone_abbreviation: 'GMT+2',
  elevation: 44.0,
  current_units: {
    time: 'iso8601',
    interval: 'seconds',
    temperature_2m: '°C',
    weather_code: 'wmo code',
  },
  current: { time: '2026-01-02T17:30', interval: 900, temperature_2m: 20.5, weather_code: 1 },
  hourly_units: { time: 'iso8601', temperature_2m: '°C', weather_code: 'wmo code' },
  hourly: {
    time: ['2026-01-02T00:00', '2026-01-02T01:00'],
    temperature_2m: [18.1, null],
    weather_code: [45, 2],
  },
  daily_units: {
    time: 'iso8601',
    weather_code: 'wmo code',
    temperature_2m_max: '°C',
    sunrise: 'iso8601',
  },
  daily: {
    time: ['2026-01-02', '2026-01-03'],
    weather_code: [63, 100],
    temperature_2m_max: [21.0, 19.5],
    sunrise: ['2026-01-02T08:03', '2026-01-03T08:04'],
  },
};

describe('get-forecast', () => {
  it('requests current + daily with defaults and returns a compact, described result', async () => {
    const fetchMock = mockFetch(jsonResponse({ ...forecastBody, hourly: undefined }));
    const result = await callTool('get-forecast', { latitude: 41.39, longitude: 2.16 });
    expect(result.success).toBe(true);
    const { url, init } = requestOf(fetchMock);
    expect(url.origin).toBe('https://api.open-meteo.com');
    expect(url.pathname).toBe('/v1/forecast');
    expect(init.method).toBe('GET');
    expect(url.searchParams.get('latitude')).toBe('41.39');
    expect(url.searchParams.get('longitude')).toBe('2.16');
    expect(url.searchParams.get('forecast_days')).toBe('7');
    expect(url.searchParams.has('past_days')).toBe(false);
    expect(url.searchParams.has('hourly')).toBe(false);
    expect(url.searchParams.get('timezone')).toBe('auto');
    expect(url.searchParams.get('temperature_unit')).toBe('celsius');
    expect(url.searchParams.get('daily')).toContain('temperature_2m_max');
    expect(url.searchParams.get('current')).toContain('weather_code');

    const out = result.result as Record<string, any>;
    expect(out.location).toEqual({
      latitude: 41.375,
      longitude: 2.125,
      elevation: 44.0,
      timezone: 'Europe/Madrid',
      timezoneAbbreviation: 'GMT+2',
      utcOffsetSeconds: 7200,
    });
    expect(out.current).toEqual({
      time: '2026-01-02T17:30',
      temperature_2m: 20.5,
      weather_code: 1,
      weather_description: 'Mainly clear',
      units: { temperature_2m: '°C', weather_code: 'wmo code' },
    });
    expect(out.daily.time).toEqual(['2026-01-02', '2026-01-03']);
    expect(out.daily.weather_description).toEqual(['Moderate rain', 'Unknown WMO code 100']);
    expect(out.daily.units).toEqual({
      weather_code: 'wmo code',
      temperature_2m_max: '°C',
      sunrise: 'iso8601',
    });
    expect(out.hourly).toBeUndefined();
    expect(out.attribution.text).toBe('Weather data by Open-Meteo.com');
  });

  it('passes hourly, past days, variables, units and time zone through', async () => {
    const fetchMock = mockFetch(jsonResponse(forecastBody));
    const result = await callTool('get-forecast', {
      latitude: '-33.87',
      longitude: '151.21',
      forecastDays: 3,
      pastDays: 2,
      hourly: true,
      current: false,
      hourlyVariables: 'temperature_2m, weather_code',
      dailyVariables: ['uv_index_max'],
      temperatureUnit: 'fahrenheit',
      windSpeedUnit: 'mph',
      precipitationUnit: 'inch',
      timezone: 'Australia/Sydney',
    });
    expect(result.success).toBe(true);
    const { url } = requestOf(fetchMock);
    expect(url.searchParams.get('latitude')).toBe('-33.87');
    expect(url.searchParams.get('past_days')).toBe('2');
    expect(url.searchParams.get('forecast_days')).toBe('3');
    expect(url.searchParams.get('hourly')).toBe('temperature_2m,weather_code');
    expect(url.searchParams.get('daily')).toBe('uv_index_max');
    expect(url.searchParams.has('current')).toBe(false);
    expect(url.searchParams.get('temperature_unit')).toBe('fahrenheit');
    expect(url.searchParams.get('wind_speed_unit')).toBe('mph');
    expect(url.searchParams.get('precipitation_unit')).toBe('inch');
    expect(url.searchParams.get('timezone')).toBe('Australia/Sydney');
    const out = result.result as Record<string, any>;
    expect(out.hourly.temperature_2m).toEqual([18.1, null]);
    expect(out.hourly.weather_description).toEqual(['Fog', 'Partly cloudy']);
  });

  it.each([
    [{ longitude: 2 }, 'latitude is required'],
    [{ latitude: 91, longitude: 2 }, 'latitude'],
    [{ latitude: 'north', longitude: 2 }, 'latitude'],
    [{ latitude: 1, longitude: -181 }, 'longitude'],
    [{ latitude: 1, longitude: 2, forecastDays: 17 }, 'forecastDays'],
    [{ latitude: 1, longitude: 2, pastDays: 93 }, 'pastDays'],
    [{ latitude: 1, longitude: 2, hourly: true, forecastDays: 8 }, 'hourly covers at most 7 days'],
    [{ latitude: 1, longitude: 2, hourly: true, forecastDays: 5, pastDays: 3 }, 'hourly'],
    [{ latitude: 1, longitude: 2, hourly: 'yes', forecastDays: 1 }, 'hourly'],
    [{ latitude: 1, longitude: 2, dailyVariables: ['temp&x=1'] }, 'invalid variable'],
    [
      { latitude: 1, longitude: 2, dailyVariables: Array.from({ length: 11 }, (_, i) => `v${i}`) },
      'dailyVariables',
    ],
    [{ latitude: 1, longitude: 2, temperatureUnit: 'kelvin' }, 'temperatureUnit'],
    [{ latitude: 1, longitude: 2, timezone: 'Europe/Madrid&x' }, 'timezone'],
  ])('rejects bad arguments before any request: %j', async (args, message) => {
    const fetchMock = mockFetch();
    const result = await callTool('get-forecast', args);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain('[BAD_REQUEST]');
    expect(JSON.stringify(result.error)).toContain(message);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces the API reason for a 400 (unknown variable)', async () => {
    mockFetch(
      jsonResponse(
        {
          reason:
            'Invalid value: Cannot initialize ForecastVariableDaily from invalid String value bogus_var',
          error: true,
        },
        400,
      ),
    );
    const result = await callTool('get-forecast', {
      latitude: 1,
      longitude: 2,
      dailyVariables: ['bogus_var'],
    });
    expect(result.success).toBe(false);
    const error = JSON.stringify(result.error);
    expect(error).toContain('[BAD_REQUEST] Open-Meteo rejected the request');
    expect(error).toContain('bogus_var');
  });

  it('refuses a result above the size budget with advice instead of a truncated string', async () => {
    const big = Array.from({ length: 5_000 }, () => 12.345678);
    mockFetch(jsonResponse({ ...forecastBody, daily: { time: big, temperature_2m_max: big } }));
    const result = await callTool('get-forecast', { latitude: 1, longitude: 2 });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain('[RESULT_TOO_LARGE]');
  });
});

describe('get-historical-weather', () => {
  const archiveBody = {
    latitude: 41.44,
    longitude: 2.2,
    generationtime_ms: 3.9,
    utc_offset_seconds: 7200,
    timezone: 'Europe/Madrid',
    timezone_abbreviation: 'GMT+2',
    elevation: 44.0,
    daily_units: { time: 'iso8601', weather_code: 'wmo code', precipitation_sum: 'mm' },
    daily: {
      time: ['2020-07-01', '2020-07-02'],
      weather_code: [0, null],
      precipitation_sum: [0.0, null],
    },
  };

  it('queries the archive host with the date range and returns the series', async () => {
    const fetchMock = mockFetch(jsonResponse(archiveBody));
    const result = await callTool('get-historical-weather', {
      latitude: 41.39,
      longitude: 2.16,
      startDate: '2020-07-01',
      endDate: '2020-07-02',
    });
    expect(result.success).toBe(true);
    const { url, init } = requestOf(fetchMock);
    expect(url.origin).toBe('https://archive-api.open-meteo.com');
    expect(url.pathname).toBe('/v1/archive');
    expect(init.method).toBe('GET');
    expect(url.searchParams.get('start_date')).toBe('2020-07-01');
    expect(url.searchParams.get('end_date')).toBe('2020-07-02');
    expect(url.searchParams.get('daily')).toContain('temperature_2m_mean');
    expect(url.searchParams.has('hourly')).toBe(false);
    expect(url.searchParams.get('timezone')).toBe('auto');
    const out = result.result as Record<string, any>;
    expect(out.startDate).toBe('2020-07-01');
    expect(out.location.timezone).toBe('Europe/Madrid');
    expect(out.daily.weather_description).toEqual(['Clear sky', null]);
    expect(out.daily.precipitation_sum).toEqual([0, null]);
    expect(out.attribution.license).toBe('CC BY 4.0');
  });

  it('allows hourly for a range of up to 7 days', async () => {
    const fetchMock = mockFetch(jsonResponse(archiveBody));
    const result = await callTool('get-historical-weather', {
      latitude: 1,
      longitude: 2,
      startDate: '2020-07-01',
      endDate: '2020-07-07',
      hourly: true,
    });
    expect(result.success).toBe(true);
    expect(requestOf(fetchMock).url.searchParams.get('hourly')).toContain('temperature_2m');
  });

  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  it.each([
    [{ latitude: 1, longitude: 2, endDate: '2020-01-01' }, 'startDate is required'],
    [{ latitude: 1, longitude: 2, startDate: '2020/01/01', endDate: '2020-01-02' }, 'startDate'],
    [
      { latitude: 1, longitude: 2, startDate: '2021-02-29', endDate: '2021-03-01' },
      'not a real calendar date',
    ],
    [{ latitude: 1, longitude: 2, startDate: '1939-12-31', endDate: '1940-01-02' }, '1940-01-01'],
    [
      { latitude: 1, longitude: 2, startDate: '2020-01-05', endDate: '2020-01-01' },
      'before startDate',
    ],
    [{ latitude: 1, longitude: 2, startDate: '2020-01-01', endDate: tomorrow }, 'get-forecast'],
    [
      { latitude: 1, longitude: 2, startDate: '2020-01-01', endDate: '2021-01-01' },
      'maximum is 366',
    ],
    [
      { latitude: 1, longitude: 2, startDate: '2020-01-01', endDate: '2020-01-08', hourly: true },
      'maximum is 7',
    ],
  ])('rejects bad arguments before any request: %j', async (args, message) => {
    const fetchMock = mockFetch();
    const result = await callTool('get-historical-weather', args);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain('[BAD_REQUEST]');
    expect(JSON.stringify(result.error)).toContain(message);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('client', () => {
  const args = { latitude: 1, longitude: 2 };

  it('retries a 503 and succeeds', async () => {
    const fetchMock = mockFetch(
      new Response('busy', { status: 503, headers: { 'Retry-After': '0' } }),
      jsonResponse(forecastBody),
    );
    const result = await callTool('get-forecast', args);
    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after 3 attempts on repeated 429 with a rate-limit message', async () => {
    const limited = () =>
      new Response(
        JSON.stringify({ error: true, reason: 'Minutely API request limit exceeded.' }),
        {
          status: 429,
          headers: { 'Retry-After': '0' },
        },
      );
    const fetchMock = mockFetch(limited(), limited(), limited());
    const result = await callTool('get-forecast', args);
    expect(result.success).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const error = JSON.stringify(result.error);
    expect(error).toContain('[RATE_LIMITED]');
    expect(error).toContain('Minutely API request limit exceeded.');
  });

  it('does not wait for a long Retry-After (daily quota): fails at once', async () => {
    const fetchMock = mockFetch(
      new Response(JSON.stringify({ error: true, reason: 'Daily API request limit exceeded.' }), {
        status: 429,
        headers: { 'Retry-After': '3600' },
      }),
    );
    const result = await callTool('get-forecast', args);
    expect(result.success).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result.error)).toContain('[RATE_LIMITED]');
  });

  it('does not retry other errors and caps the quoted body', async () => {
    const fetchMock = mockFetch(new Response('x'.repeat(10_000), { status: 500 }));
    const result = await callTool('get-forecast', args);
    expect(result.success).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const error = JSON.stringify(result.error);
    expect(error).toContain('[OPEN_METEO_ERROR] 500');
    expect(error.length).toBeLessThan(3_000);
  });

  it('names the host on network errors and says when it timed out', async () => {
    const err = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(err));
    let result = await callTool('search-locations', { name: 'Paris' });
    expect(JSON.stringify(result.error)).toContain(
      'Could not reach geocoding-api.open-meteo.com: ECONNRESET',
    );

    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeout));
    result = await callTool('get-historical-weather', {
      latitude: 1,
      longitude: 2,
      startDate: '2020-01-01',
      endDate: '2020-01-02',
    });
    expect(JSON.stringify(result.error)).toContain(
      'archive-api.open-meteo.com did not answer within 30 s',
    );
  });
});

describe('live-test regressions', () => {
  it('sends variable lists with literal commas, so a 400 names the one bad variable', async () => {
    // Live: with "%2C" Open-Meteo answered "invalid String value a,bogus_var" for the whole list.
    const fetchMock = mockFetch(jsonResponse(forecastBody));
    await callTool('get-forecast', {
      latitude: 1,
      longitude: 2,
      dailyVariables: 'temperature_2m_max,precipitation_sum',
    });
    const [rawUrl] = fetchMock.mock.calls[0] as [URL];
    expect(String(rawUrl)).toContain('daily=temperature_2m_max,precipitation_sum');
    expect(String(rawUrl)).not.toMatch(/%2C/i);
  });

  it('tells CLI users to pass a leading-zero postal code as a JSON object, not with --json', async () => {
    // Live: `--json` is the CLI's output flag, and `name:"08001"` still arrives as 8001.
    const tool = (await listTools()).find((t) => t.name === 'search-locations') as Record<
      string,
      unknown
    >;
    expect(String(tool.description)).toContain(`'{"name":"08001"}'`);
    expect(String(tool.description)).not.toContain('--json');
  });
});
