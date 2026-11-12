/**
 * Shared Supabase API client.
 *
 * - Auth via apikey header + Bearer token
 * - POST/PATCH/DELETE bodies use application/json
 * - PostgREST filtering via query parameters
 */

// ---------------------------------------------------------------------------
// Helper: get Supabase config from system secrets
// ---------------------------------------------------------------------------

export async function getSupabaseConfig(ctx: {
  systemSecret: (key: string) => Promise<string | null>;
}): Promise<{ url: string; key: string }> {
  const url = await ctx.systemSecret('SUPABASE_URL');
  if (!url) {
    throw new Error('[SUPABASE_ERROR] Missing SUPABASE_URL system secret.');
  }

  const key = await ctx.systemSecret('SUPABASE_KEY');
  if (!key) {
    throw new Error('[SUPABASE_ERROR] Missing SUPABASE_KEY system secret.');
  }

  // Remove trailing slash if present
  return { url: url.replace(/\/+$/, ''), key };
}

// ---------------------------------------------------------------------------
// Main request function
// ---------------------------------------------------------------------------

export interface SupabaseRequestOptions {
  body?: unknown;
  params?: Record<string, string>;
  headers?: Record<string, string>;
}

export async function supabaseRequest(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  options: SupabaseRequestOptions | null,
  ctx: { systemSecret: (key: string) => Promise<string | null> },
): Promise<unknown> {
  const { url, key } = await getSupabaseConfig(ctx);

  let fullUrl = `${url}${path}`;

  if (options?.params && Object.keys(options.params).length > 0) {
    const qs = new URLSearchParams(options.params);
    fullUrl += `?${qs.toString()}`;
  }

  const init: RequestInit = {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  };

  if (options?.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(fullUrl, init);
  const text = await response.text();

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!response.ok) {
    const message =
      (data && typeof data === 'object' && 'message' in data
        ? (data as Record<string, unknown>).message
        : null) || response.statusText;
    throw new Error(`[SUPABASE_ERROR] ${response.status}: ${message}`);
  }

  return { data, headers: Object.fromEntries(response.headers.entries()) };
}
