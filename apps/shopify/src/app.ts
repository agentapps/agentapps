/**
 * Shopify Agent App — manage products, orders, customers, inventory,
 * and collections via the Shopify Admin API.
 */

import { createApp } from '@agentapps/sdk';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.shopify',
  version: '3.0.0',
  name: 'Shopify',
  description:
    'Shopify store management — manage products, orders, customers, inventory, collections, fulfillments, discounts, pages, and webhooks.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'ecommerce',
  keywords: [
    'shopify',
    'ecommerce',
    'store',
    'products',
    'orders',
    'inventory',
    'fulfillments',
    'discounts',
  ],
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'api-key',
    installationSecrets: ['SHOP_DOMAIN', 'ACCESS_TOKEN'],
  },
});

app.health(async (ctx) => {
  ctx.log('debug', 'Running Shopify health check');

  const secrets = await ctx.secrets.getInstallation();
  if (!secrets?.SHOP_DOMAIN || !secrets?.ACCESS_TOKEN) {
    return {
      status: 'not_ready',
      message: 'Missing Shopify credentials',
      issues: [
        {
          code: 'MISSING_SECRET',
          message:
            'SHOP_DOMAIN and ACCESS_TOKEN installation secrets are required — provide your .myshopify.com domain and Admin API access token',
          severity: 'error' as const,
        },
      ],
    };
  }

  // Clean shop domain
  let shopDomain = secrets.SHOP_DOMAIN.trim();
  shopDomain = shopDomain.replace(/^https?:\/\//, '');
  shopDomain = shopDomain.replace(/\/+$/, '');
  shopDomain = shopDomain.replace(/\/admin.*$/, '');
  shopDomain = shopDomain.replace(/\.myshopify\.com$/, '');

  const res = await fetch(`https://${shopDomain}.myshopify.com/admin/api/2024-01/shop.json`, {
    headers: { 'X-Shopify-Access-Token': secrets.ACCESS_TOKEN },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = body?.errors
      ? typeof body.errors === 'string'
        ? body.errors
        : JSON.stringify(body.errors)
      : res.statusText;
    throw new Error(`Shopify API error: ${message}`);
  }

  const result = (await res.json()) as { shop: { name: string } };
  return { status: 'ready' as const, message: `Shopify store ${result.shop.name} connected` };
});

registerTools(app);

export const factory = app.toFactory();
export default factory;
