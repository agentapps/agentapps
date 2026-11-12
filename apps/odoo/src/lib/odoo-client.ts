/**
 * Odoo JSON-RPC client.
 *
 * Stateless: secrets are read from `ctx.secrets.getInstallation()` on every call
 * (per-app container — each user's own credentials). Uses plain `fetch`
 * against the user's Odoo instance URL.
 */

// =============================================================================
// TYPES
// =============================================================================

export interface OdooSecretsContext {
  secrets: {
    getSystem: () => Promise<Record<string, string> | null>;
    getInstallation: () => Promise<Record<string, string> | null>;
  };
}

export interface OdooSecrets {
  BASE_URL?: string;
  DATABASE?: string;
  API_KEY?: string;
}

export type OdooDomain = Array<string | number | boolean | null | undefined | OdooDomain>;

export interface OdooRpcOptions {
  model?: string;
  service?: 'object' | 'common' | 'db';
  method: string;
  args?: unknown[];
  kwargs?: Record<string, unknown>;
}

export interface OdooSearchOptions {
  domain?: OdooDomain;
  fields?: string[];
  offset?: number;
  limit?: number;
  order?: string;
}

export interface OdooRecord {
  id: number;
  [key: string]: unknown;
}

// =============================================================================
// SECRETS
// =============================================================================

export async function getOdooSecrets(ctx: OdooSecretsContext): Promise<Required<OdooSecrets>> {
  let installationSecrets: Record<string, string> = {};
  try {
    const raw = await ctx.secrets.getInstallation();
    if (raw) installationSecrets = raw;
  } catch {
    // fall through to missing-key errors below
  }

  const baseUrl = (installationSecrets.BASE_URL || '').trim();
  const database = (installationSecrets.DATABASE || '').trim();
  const apiKey = (installationSecrets.API_KEY || '').trim();

  if (!baseUrl) {
    throw new Error(
      'Odoo BASE_URL is not configured. Please set your Odoo instance URL (e.g. https://mycompany.odoo.com).',
    );
  }
  if (!database) {
    throw new Error('Odoo DATABASE is not configured. Please set your Odoo database name.');
  }
  if (!apiKey) {
    throw new Error(
      'Odoo API_KEY is not configured. Please set an API key from your Odoo user profile.',
    );
  }

  return {
    BASE_URL: baseUrl.replace(/\/$/, ''),
    DATABASE: database,
    API_KEY: apiKey,
  };
}

// =============================================================================
// JSON-RPC REQUEST
// =============================================================================

/**
 * Execute a JSON-RPC call against Odoo's /jsonrpc endpoint.
 */
export async function odooJsonRpc<T = unknown>(
  ctx: OdooSecretsContext,
  options: OdooRpcOptions,
): Promise<T> {
  const { BASE_URL, DATABASE, API_KEY } = await getOdooSecrets(ctx);
  const service = options.service ?? 'object';
  const model = options.model;
  const method = options.method;
  const args = options.args ?? [];
  const kwargs = options.kwargs ?? {};

  const url = `${BASE_URL}/jsonrpc`;

  const rpcArgs =
    service === 'object'
      ? [DATABASE, 1, API_KEY, model, method, args]
      : service === 'common'
        ? [DATABASE, '', API_KEY, {}]
        : args;

  const body = {
    jsonrpc: '2.0',
    method: 'call',
    params: {
      service,
      method: service === 'object' ? 'execute_kw' : method,
      args: rpcArgs,
      kwargs,
    },
    id: Math.floor(Math.random() * 1_000_000_000),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text().catch(() => 'Unknown error');
  let data: {
    error?: { message?: string; data?: { message?: string }; code?: number };
    result?: T;
  };

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Odoo returned non-JSON response (${response.status}): ${text}`);
  }

  if (data.error) {
    const odooMessage = data.error.data?.message || data.error.message || 'Unknown Odoo error';
    throw new Error(`Odoo error (${data.error.code ?? 'N/A'}): ${odooMessage}`);
  }

  return data.result as T;
}

// =============================================================================
// AUTHENTICATION
// =============================================================================

/**
 * Authenticate against Odoo and return the user ID.
 */
export async function authenticate(ctx: OdooSecretsContext): Promise<number> {
  return odooJsonRpc<number>(ctx, {
    service: 'common',
    method: 'authenticate',
  });
}

// =============================================================================
// GENERIC CRUD HELPERS
// =============================================================================

export async function odooSearchRead(
  ctx: OdooSecretsContext,
  model: string,
  options: OdooSearchOptions = {},
): Promise<OdooRecord[]> {
  const kwargs: Record<string, unknown> = {};
  if (options.fields && options.fields.length > 0) kwargs.fields = options.fields;
  if (options.offset !== undefined) kwargs.offset = options.offset;
  if (options.limit !== undefined) kwargs.limit = options.limit;
  if (options.order) kwargs.order = options.order;

  return odooJsonRpc<OdooRecord[]>(ctx, {
    model,
    method: 'search_read',
    args: [options.domain ?? []],
    kwargs,
  });
}

export async function odooRead(
  ctx: OdooSecretsContext,
  model: string,
  id: number,
  fields?: string[],
): Promise<OdooRecord | null> {
  const result = await odooJsonRpc<OdooRecord[]>(ctx, {
    model,
    method: 'read',
    args: [[id]],
    kwargs: fields && fields.length > 0 ? { fields } : {},
  });
  return result?.[0] ?? null;
}

export async function odooCreate(
  ctx: OdooSecretsContext,
  model: string,
  values: Record<string, unknown>,
): Promise<number> {
  return odooJsonRpc<number>(ctx, {
    model,
    method: 'create',
    args: [values],
  });
}

export async function odooWrite(
  ctx: OdooSecretsContext,
  model: string,
  id: number,
  values: Record<string, unknown>,
): Promise<boolean> {
  return odooJsonRpc<boolean>(ctx, {
    model,
    method: 'write',
    args: [[id], values],
  });
}

export async function odooUnlink(
  ctx: OdooSecretsContext,
  model: string,
  id: number,
): Promise<boolean> {
  return odooJsonRpc<boolean>(ctx, {
    model,
    method: 'unlink',
    args: [[id]],
  });
}

export async function odooSearchCount(
  ctx: OdooSecretsContext,
  model: string,
  domain: OdooDomain = [],
): Promise<number> {
  return odooJsonRpc<number>(ctx, {
    model,
    method: 'search_count',
    args: [domain],
  });
}

export async function odooCallMethod(
  ctx: OdooSecretsContext,
  model: string,
  method: string,
  args: unknown[] = [],
  kwargs: Record<string, unknown> = {},
): Promise<unknown> {
  return odooJsonRpc<unknown>(ctx, {
    model,
    method,
    args,
    kwargs,
  });
}

// =============================================================================
// FILTER PARSER
// =============================================================================

/**
 * Parse a simple filter string into an Odoo domain.
 * Supports: key=value, key!=value, key>value, key<value, key>=value, key<=value.
 * Multiple filters are ANDed.
 */
export function parseFilters(filters?: string): OdooDomain {
  if (!filters || filters.trim().length === 0) return [];

  const domain: OdooDomain = [];
  const pairs = filters
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  for (const pair of pairs) {
    const match = pair.match(/^([^!=<>]+)(!=|>=|<=|>|<|=)(.*)$/);
    if (!match) continue;

    const [, key, operator, rawValue] = match;
    const field = key.trim();
    const value = parseValue(rawValue.trim());

    domain.push([field, operator, value]);
  }

  return domain;
}

function parseValue(value: string): string | number | boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null' || value === 'None') return false;

  const num = Number(value);
  if (!Number.isNaN(num) && value !== '') return num;

  return value;
}
