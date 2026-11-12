import type { AgentApp } from '@agentapps/sdk';
import { apiGet } from '../lib/client.js';
import { type Args, integer } from '../lib/params.js';
import { LOCATION_ATTRIBUTION } from '../lib/weather.js';

/** One result of the geocoding search, as the API sends it (empty fields are omitted). */
interface GeoResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  elevation?: number;
  feature_code?: string;
  country_code?: string;
  country?: string;
  admin1?: string;
  admin2?: string;
  admin3?: string;
  admin4?: string;
  timezone?: string;
  population?: number;
  postcodes?: string[];
}

export function registerSearchLocationsTool(app: AgentApp): void {
  app.tool('search-locations', {
    description:
      'Find places by name (city, town, region, landmark) or postal code and return their coordinates, ' +
      'for get-forecast and get-historical-weather. Returns { locations: [{ id, name, latitude, longitude, ' +
      'elevation, country, countryCode, admin1..admin4 (state, province, county...), timezone, population, ' +
      'featureCode }], attribution }; an empty list when nothing matches. Names of 3+ characters match by ' +
      'prefix. To disambiguate, add the country or first-level region after a comma ("Springfield, Illinois") ' +
      'or pass countryCode. A postal code with a leading zero must be sent as a JSON string: on the CLI pass ' +
      `the arguments as one JSON object, '{"name":"08001"}', because name:08001 (even quoted) arrives as the number 8001.`,
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: ['string', 'number'],
          description:
            'Place name or postal code, at least 2 characters. Optional qualifier after a comma: a country or first-level region name, matched exactly.',
        },
        count: {
          type: 'integer',
          minimum: 1,
          maximum: 20,
          description: 'Maximum number of results, 1-20. Default 5.',
        },
        countryCode: {
          type: 'string',
          description: 'Only places in this country: ISO 3166-1 alpha-2 code such as "ES" or "US".',
        },
        language: {
          type: 'string',
          description:
            'Language for place names, lowercase ISO 639-1 code such as "en", "de", "es". Default "en".',
        },
      },
      required: ['name'],
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
      const name =
        typeof a.name === 'number'
          ? String(a.name)
          : typeof a.name === 'string'
            ? a.name.trim()
            : '';
      if (name.length < 2 || name.length > 200) {
        throw new Error(
          `[BAD_REQUEST] name must be 2-200 characters; got ${JSON.stringify(a.name)}.`,
        );
      }
      const count = integer(a, 'count', 1, 20, 5);
      let countryCode: string | undefined;
      if (a.countryCode !== undefined && a.countryCode !== null && a.countryCode !== '') {
        if (typeof a.countryCode !== 'string' || !/^[A-Za-z]{2}$/.test(a.countryCode)) {
          throw new Error(
            `[BAD_REQUEST] countryCode must be a 2-letter ISO code such as "ES"; got ${JSON.stringify(a.countryCode)}.`,
          );
        }
        countryCode = a.countryCode.toUpperCase();
      }
      let language = 'en';
      if (a.language !== undefined && a.language !== null && a.language !== '') {
        if (typeof a.language !== 'string' || !/^[A-Za-z]{2,3}$/.test(a.language)) {
          throw new Error(
            `[BAD_REQUEST] language must be a 2-letter code such as "en"; got ${JSON.stringify(a.language)}.`,
          );
        }
        language = a.language.toLowerCase();
      }

      const body = await apiGet<{ results?: GeoResult[] }>('/v1/search', ctx, {
        host: 'geocoding',
        params: { name, count, language, countryCode, format: 'json' },
      });
      // The API omits `results` entirely when nothing matches.
      const locations = (body.results ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        latitude: r.latitude,
        longitude: r.longitude,
        elevation: r.elevation,
        country: r.country,
        countryCode: r.country_code,
        admin1: r.admin1,
        admin2: r.admin2,
        admin3: r.admin3,
        admin4: r.admin4,
        timezone: r.timezone,
        population: r.population,
        featureCode: r.feature_code,
      }));
      return { query: name, count: locations.length, locations, attribution: LOCATION_ATTRIBUTION };
    },
  });
}
