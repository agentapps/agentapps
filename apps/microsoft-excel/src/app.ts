import { createApp } from '@agentapps/sdk';
import { createGraphClient } from './lib/index.js';
import { registerTools } from './tools/index.js';

// Exported (not just wrapped in `factory`) so tests can call `app.toManifest()`
// and compare it against `agentapp.json` — the two are meant to describe the
// same app and must not be hand-edited out of sync with each other.
export const app = createApp({
  id: 'app.microsoft.excel',
  version: '1.0.0',
  name: 'Excel',
  description:
    'Microsoft Excel workbook automation — read and write ranges, formulas, tables, and charts via the Microsoft Graph workbook API.',
  tagline: 'Read and write Excel ranges, formulas, tables, and charts via Microsoft Graph',
  author: { name: 'Pablo Lopez Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  logo: 'assets/logo.svg',
  logoMono: 'assets/logo-mono.svg',
  terms: 'https://agentapps.tech/terms',
  category: 'productivity',
  keywords: ['excel', 'spreadsheet', 'microsoft', 'workbook', 'xlsx', 'office365', 'formulas'],
  entrypoint: { type: 'module', path: 'src/app.ts', export: 'factory' },
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'oauth2',
    provider: 'microsoft',
    systemSecrets: ['CLIENT_ID', 'CLIENT_SECRET', 'REDIRECT_URI'],
    installationSecrets: ['ACCESS_TOKEN', 'REFRESH_TOKEN', 'EMAIL', 'EXPIRY_DATE'],
    authorizeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: ['openid', 'profile', 'email', 'offline_access', 'User.Read', 'Files.ReadWrite.All'],
    pkce: false,
  },
});

app.health(async (ctx) => {
  const { graphRequest } = await createGraphClient(ctx);
  // The workbook API rides on the user's drive; confirm we can reach it.
  await graphRequest('GET', '/me/drive?$select=id');
  return { status: 'ready' as const, message: 'Microsoft Excel connected' };
});

registerTools(app);

export const factory = app.toFactory();
