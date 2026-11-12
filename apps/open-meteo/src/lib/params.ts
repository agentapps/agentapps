/**
 * Argument parsing shared by the tools.
 *
 * JSON Schema is advisory in this stack: nothing validates arguments at runtime, so every
 * handler checks them again here. The CLI turns anything `Number()` accepts into a number
 * (`latitude:41.39`, `count:5`), so numeric parameters accept numeric strings too.
 */

export type Args = Record<string, unknown>;

function bad(message: string): Error {
  return new Error(`[BAD_REQUEST] ${message}`);
}

/** A finite number from a number or a numeric string; undefined when the argument is absent. */
function toNumber(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n)) throw bad(`${name} must be a number; got ${JSON.stringify(value)}.`);
  return n;
}

export function coordinate(args: Args, name: 'latitude' | 'longitude'): number {
  const n = toNumber(args[name], name);
  if (n === undefined) {
    throw bad(`${name} is required. Use search-locations to turn a place name into coordinates.`);
  }
  const limit = name === 'latitude' ? 90 : 180;
  if (n < -limit || n > limit) {
    throw bad(`${name} must be between -${limit} and ${limit}; got ${n}.`);
  }
  return n;
}

export function integer(args: Args, name: string, min: number, max: number, fallback: number) {
  const n = toNumber(args[name], name);
  if (n === undefined) return fallback;
  if (!Number.isInteger(n) || n < min || n > max) {
    throw bad(`${name} must be a whole number from ${min} to ${max}; got ${n}.`);
  }
  return n;
}

export function boolean(args: Args, name: string, fallback: boolean): boolean {
  const v = args[name];
  if (v === undefined || v === null) return fallback;
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === 'false') return v === 'true';
  throw bad(`${name} must be true or false; got ${JSON.stringify(v)}.`);
}

export function oneOf<T extends string>(
  args: Args,
  name: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const v = args[name];
  if (v === undefined || v === null || v === '') return fallback;
  if (typeof v === 'string' && (allowed as readonly string[]).includes(v)) return v as T;
  throw bad(`${name} must be one of ${allowed.join(', ')}; got ${JSON.stringify(v)}.`);
}

/** IANA time zone name, GMT or "auto" (the coordinates' own zone). */
export function timezone(args: Args): string {
  const v = args.timezone;
  if (v === undefined || v === null || v === '') return 'auto';
  if (typeof v === 'string' && /^[A-Za-z0-9_+\-/]{1,64}$/.test(v)) return v;
  throw bad(
    `timezone must be "auto" or an IANA name such as "Europe/Madrid"; got ${JSON.stringify(v)}.`,
  );
}

export const MAX_VARIABLES = 10;

/**
 * A list of Open-Meteo variable names, from an array or a comma-separated string.
 * Returns the defaults when the argument is absent.
 */
export function variables(args: Args, name: string, defaults: readonly string[]): string[] {
  const v = args[name];
  if (v === undefined || v === null || v === '') return [...defaults];
  const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : null;
  if (!list) throw bad(`${name} must be a list of variable names.`);
  const names = [...new Set(list.map((x) => (typeof x === 'string' ? x.trim() : '')))];
  if (names.length === 0 || names.length > MAX_VARIABLES) {
    throw bad(`${name} takes 1 to ${MAX_VARIABLES} variable names; got ${names.length}.`);
  }
  for (const n of names) {
    if (!/^[a-z0-9_]{1,64}$/.test(n)) {
      throw bad(
        `${name} has an invalid variable name ${JSON.stringify(n)} (use e.g. "temperature_2m").`,
      );
    }
  }
  return names;
}

const DAY_MS = 86_400_000;

/** A calendar date "YYYY-MM-DD" as a UTC timestamp at midnight. */
export function date(args: Args, name: string): { text: string; ms: number } {
  const v = args[name];
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    throw bad(`${name} is required as a date "YYYY-MM-DD"; got ${JSON.stringify(v)}.`);
  }
  const ms = Date.parse(`${v}T00:00:00Z`);
  // Date.parse accepts 2026-02-30 in some engines; round-trip to reject impossible dates.
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== v) {
    throw bad(`${name} ${v} is not a real calendar date.`);
  }
  return { text: v, ms };
}

/** Number of days in an inclusive date range. */
export function daysInclusive(startMs: number, endMs: number): number {
  return Math.round((endMs - startMs) / DAY_MS) + 1;
}

/** Units shared by the forecast and archive APIs. */
export function units(args: Args) {
  return {
    temperature_unit: oneOf(args, 'temperatureUnit', ['celsius', 'fahrenheit'] as const, 'celsius'),
    wind_speed_unit: oneOf(args, 'windSpeedUnit', ['kmh', 'ms', 'mph', 'kn'] as const, 'kmh'),
    precipitation_unit: oneOf(args, 'precipitationUnit', ['mm', 'inch'] as const, 'mm'),
  };
}

/** JSON Schema properties for the parameters `units()` and `timezone()` read. */
export const UNIT_PROPERTIES = {
  temperatureUnit: {
    type: 'string',
    enum: ['celsius', 'fahrenheit'],
    description: 'Temperature unit. Default celsius.',
  },
  windSpeedUnit: {
    type: 'string',
    enum: ['kmh', 'ms', 'mph', 'kn'],
    description: 'Wind speed unit. Default kmh.',
  },
  precipitationUnit: {
    type: 'string',
    enum: ['mm', 'inch'],
    description: 'Precipitation unit. Default mm.',
  },
  timezone: {
    type: 'string',
    description:
      'Time zone for timestamps and day boundaries: "auto" (default, the location\'s own zone), "GMT" or an IANA name like "Europe/Madrid".',
  },
} as const;

export const COORDINATE_PROPERTIES = {
  latitude: {
    type: 'number',
    minimum: -90,
    maximum: 90,
    description: 'Latitude in decimal degrees (WGS84), e.g. 41.3888. Get it from search-locations.',
  },
  longitude: {
    type: 'number',
    minimum: -180,
    maximum: 180,
    description: 'Longitude in decimal degrees (WGS84), e.g. 2.159. West is negative.',
  },
} as const;
