import { createApp } from '@agentapps/sdk';
import { createGraphClient } from './lib/index.js';
import { registerTools } from './tools/index.js';

// Exported (not just wrapped in `factory`) so tests can call `app.toManifest()`
// and compare it against `agentapp.json` — the two describe the same app and
// must not be hand-edited out of sync.
export const app = createApp({
  id: 'app.microsoft.word',
  version: '1.0.0',
  name: 'Word',
  description:
    'Microsoft Word document automation — create documents, read their text and structure, and make surgical edits that leave the rest of the file untouched. Edits overwrite the stored file; recover earlier states through OneDrive version history.',
  tagline: 'Create, read, and surgically edit Word documents in OneDrive',
  author: { name: 'Pablo Lopez Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  logo: 'assets/logo.svg',
  logoMono: 'assets/logo-mono.svg',
  terms: 'https://agentapps.tech/terms',
  category: 'productivity',
  keywords: ['word', 'docx', 'document', 'microsoft', 'office365', 'ooxml'],
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
  // Word documents live in the user's drive; confirm we can reach it.
  await graphRequest('GET', '/me/drive?$select=id');
  return { status: 'ready' as const, message: 'Microsoft Word connected' };
});

registerTools(app);

export const factory = app.toFactory();
