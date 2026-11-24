import { createApp } from '@agentapps/sdk';
import { createGraphClient } from './lib/index.js';
import { registerTools } from './tools/index.js';

// Exported (not just wrapped in `factory`) so tests can call `app.toManifest()`
// and compare it against `agentapp.json` — the two are meant to describe the
// same app and must not be hand-edited out of sync with each other.
export const app = createApp({
  id: 'app.microsoft.onedrive',
  version: '1.1.0',
  name: 'OneDrive',
  description:
    'Microsoft OneDrive file management — browse, upload, download, organize, and share files via Microsoft Graph API.',
  tagline: 'Browse, upload, organize, and share OneDrive files via Microsoft Graph',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  logo: 'assets/logo.svg',
  logoMono: 'assets/logo-mono.svg',
  terms: 'https://agentapps.tech/terms',
  category: 'productivity',
  keywords: ['onedrive', 'files', 'microsoft', 'storage', 'drive', 'office365', 'sharepoint'],
  entrypoint: { type: 'module', path: 'src/app.ts', export: 'factory' },
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'oauth2',
    provider: 'microsoft',
    systemSecrets: ['CLIENT_ID', 'CLIENT_SECRET'],
    installationSecrets: ['ACCESS_TOKEN', 'REFRESH_TOKEN', 'EMAIL', 'EXPIRY_DATE'],
    authorizeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: [
      'openid',
      'profile',
      'email',
      'offline_access',
      'User.Read',
      'Files.ReadWrite.All',
      'Sites.Read.All',
    ],
    pkce: false,
  },
});

app.health(async (ctx) => {
  const { graphRequest } = await createGraphClient(ctx);
  await graphRequest('GET', '/me/drive?$select=id,driveType');
  return { status: 'ready' as const, message: 'Microsoft OneDrive connected' };
});

registerTools(app);

export const factory = app.toFactory();
