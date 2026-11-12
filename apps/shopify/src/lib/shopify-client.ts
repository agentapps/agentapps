/**
 * Shared Shopify Admin API client.
 *
 * - Auth via X-Shopify-Access-Token header
 * - JSON request/response bodies
 * - Base URL: https://{shop}.myshopify.com/admin/api/2024-01
 */

const API_VERSION = '2024-01';

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
// Helper: get Shopify config from installation secrets
// ---------------------------------------------------------------------------

export interface ShopifyConfig {
  shopDomain: string;
  accessToken: string;
}

export async function getShopifyConfig(ctx: {
  installationSecret: (key: string) => Promise<string | null>;
}): Promise<ShopifyConfig> {
  const shopDomain = await ctx.installationSecret('SHOP_DOMAIN');
  const accessToken = await ctx.installationSecret('ACCESS_TOKEN');

  if (!shopDomain) {
    throw new Error('[SHOPIFY_ERROR] Missing SHOP_DOMAIN user secret.');
  }
  if (!accessToken) {
    throw new Error('[SHOPIFY_ERROR] Missing ACCESS_TOKEN user secret.');
  }

  // Clean the shop domain — strip protocol, trailing slashes, /admin, .myshopify.com suffix
  let cleaned = shopDomain.trim();
  cleaned = cleaned.replace(/^https?:\/\//, '');
  cleaned = cleaned.replace(/\/+$/, '');
  cleaned = cleaned.replace(/\/admin.*$/, '');
  cleaned = cleaned.replace(/\.myshopify\.com$/, '');

  return { shopDomain: cleaned, accessToken };
}

// ---------------------------------------------------------------------------
// Main request function
// ---------------------------------------------------------------------------

export async function shopifyRequest(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  options: { params?: Record<string, unknown>; body?: Record<string, unknown> } | null,
  ctx: { installationSecret: (key: string) => Promise<string | null> },
): Promise<unknown> {
  const config = await getShopifyConfig(ctx);

  let url = `https://${config.shopDomain}.myshopify.com/admin/api/${API_VERSION}${path}`;
  const init: RequestInit = {
    method,
    headers: {
      'X-Shopify-Access-Token': config.accessToken,
      'Content-Type': 'application/json',
    },
  };

  if (options?.params && Object.keys(options.params).length > 0) {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined && value !== null) {
        qs.set(key, String(value));
      }
    }
    url += `?${qs.toString()}`;
  }

  if (options?.body && (method === 'POST' || method === 'PUT')) {
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, init);
  const data = await response.json();

  if (!response.ok) {
    const message = data?.errors
      ? typeof data.errors === 'string'
        ? data.errors
        : JSON.stringify(data.errors)
      : response.statusText;
    throw new Error(`[SHOPIFY_ERROR] ${response.status}: ${message}`);
  }

  return data;
}
