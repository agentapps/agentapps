/**
 * Shared Stripe API client.
 *
 * - Auth via Bearer token (sk_live_... / sk_test_...)
 * - POST bodies use application/x-www-form-urlencoded (NOT JSON)
 * - Nested objects use Stripe bracket notation: metadata[key]=value
 */

const STRIPE_API_URL = 'https://api.stripe.com/v1';

// ---------------------------------------------------------------------------
// Context interface (matches AgentApp handler context)
// ---------------------------------------------------------------------------

export interface SecretsContext {
  secrets: {
    getSystem: () => Promise<Record<string, string> | null>;
    getInstallation: () => Promise<Record<string, string> | null>;
  };
}

// ---------------------------------------------------------------------------
// Helper: get the API key from system secrets
// ---------------------------------------------------------------------------

export async function getStripeKey(ctx: {
  systemSecret: (key: string) => Promise<string | null>;
}): Promise<string> {
  const apiKey = await ctx.systemSecret('API_KEY');
  if (!apiKey) {
    throw new Error('[STRIPE_ERROR] Missing API_KEY system secret.');
  }
  return apiKey;
}

// ---------------------------------------------------------------------------
// Helper: flatten nested objects for form-urlencoded encoding
// ---------------------------------------------------------------------------

export function flattenParams(
  obj: Record<string, unknown>,
  prefix?: string,
): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];

  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;

    const fullKey = prefix ? `${prefix}[${key}]` : key;

    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (typeof item === 'object' && item !== null) {
          pairs.push(...flattenParams(item as Record<string, unknown>, `${fullKey}[${i}]`));
        } else {
          pairs.push([`${fullKey}[${i}]`, String(item)]);
        }
      }
    } else if (typeof value === 'object') {
      pairs.push(...flattenParams(value as Record<string, unknown>, fullKey));
    } else {
      pairs.push([fullKey, String(value)]);
    }
  }

  return pairs;
}

// ---------------------------------------------------------------------------
// Main request function
// ---------------------------------------------------------------------------

export async function stripeRequest(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  params: Record<string, unknown> | null,
  ctx: { systemSecret: (key: string) => Promise<string | null> },
): Promise<unknown> {
  const apiKey = await getStripeKey(ctx);

  let url = `${STRIPE_API_URL}${path}`;
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  };

  if (params && Object.keys(params).length > 0) {
    const flattened = flattenParams(params);

    if (method === 'GET') {
      const qs = new URLSearchParams(flattened);
      url += `?${qs.toString()}`;
    } else {
      const body = new URLSearchParams(flattened);
      init.headers = {
        ...init.headers,
        'Content-Type': 'application/x-www-form-urlencoded',
      };
      init.body = body.toString();
    }
  }

  const response = await fetch(url, init);
  const data = await response.json();

  if (!response.ok) {
    const message = data?.error?.message || response.statusText;
    throw new Error(`[STRIPE_ERROR] ${response.status}: ${message}`);
  }

  return data;
}
