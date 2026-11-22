/**
 * QuickBooks Online Agent App — manage invoices, customers, payments,
 * accounts, items, and reports via the QuickBooks Online API.
 */

import { createApp } from '@agentapps/sdk';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.quickbooks',
  version: '2.0.2',
  name: 'QuickBooks',
  description:
    'QuickBooks Online accounting — manage invoices, customers, payments, accounts, items, and reports.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'finance',
  keywords: ['quickbooks', 'accounting', 'invoices', 'payments', 'intuit'],
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'oauth2',
    provider: 'quickbooks',
    authorizeUrl: 'https://appcenter.intuit.com/connect/oauth2',
    tokenUrl: 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
    scopes: ['com.intuit.quickbooks.accounting'],
    pkce: false,
    systemSecrets: ['CLIENT_ID', 'CLIENT_SECRET', 'REDIRECT_URI'],
    installationSecrets: ['ACCESS_TOKEN', 'REFRESH_TOKEN', 'REALM_ID'],
  },
});

app.health(async (ctx) => {
  ctx.log('debug', 'Running QuickBooks health check');

  const installationSecrets = await ctx.secrets.getInstallation();
  if (!installationSecrets?.ACCESS_TOKEN) {
    return {
      status: 'not_ready',
      message: 'Missing QuickBooks access token',
      issues: [
        {
          code: 'MISSING_SECRET',
          message: 'ACCESS_TOKEN user secret is required — complete OAuth2 authorization first.',
          severity: 'error' as const,
        },
      ],
    };
  }

  if (!installationSecrets?.REALM_ID) {
    return {
      status: 'not_ready',
      message: 'Missing QuickBooks realm ID',
      issues: [
        {
          code: 'MISSING_SECRET',
          message: 'REALM_ID user secret is required — this is your QuickBooks company ID.',
          severity: 'error' as const,
        },
      ],
    };
  }

  // Validate credentials by fetching CompanyInfo
  const realmId = installationSecrets.REALM_ID;
  const res = await fetch(
    `https://quickbooks.api.intuit.com/v3/company/${realmId}/companyinfo/${realmId}?minorversion=73`,
    {
      headers: {
        Authorization: `Bearer ${installationSecrets.ACCESS_TOKEN}`,
        Accept: 'application/json',
      },
    },
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = body?.Fault?.Error?.[0]?.Message || res.statusText;
    throw new Error(`QuickBooks API error: ${message}`);
  }

  return { status: 'ready', message: 'QuickBooks connected' };
});

registerTools(app);

export const factory = app.toFactory();
export default factory;
