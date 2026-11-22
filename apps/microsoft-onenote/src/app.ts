import { createApp } from '@agentapps/sdk';
import { createGraphClient } from './lib/index.js';
import { registerTools } from './tools/index.js';

// Exported (not just wrapped in `factory`) so tests can call `app.toManifest()`
// and compare it against `agentapp.json` — the two are meant to describe the
// same app and must not be hand-edited out of sync with each other.
export const app = createApp({
  id: 'app.microsoft.onenote',
  version: '1.0.1',
  name: 'OneNote',
  description:
    'Microsoft OneNote automation — browse notebooks and sections, read and write pages as markdown, and search notes via the Microsoft Graph OneNote API.',
  tagline: 'Read, write, and search OneNote notebooks, sections, and pages',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  logo: 'assets/logo.svg',
  logoMono: 'assets/logo-mono.svg',
  terms: 'https://agentapps.tech/terms',
  category: 'productivity',
  keywords: ['onenote', 'notes', 'notebook', 'microsoft', 'office365', 'markdown'],
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
    scopes: [
      'openid',
      'profile',
      'email',
      'offline_access',
      'User.Read',
      'Notes.ReadWrite.All',
      'Notes.Create',
    ],
    pkce: false,
  },
});

app.health(async (ctx) => {
  const { graphRequest } = await createGraphClient(ctx);
  // Touch OneNote itself, not just /me: an account that authenticated but was
  // never granted Notes consent must not report ready.
  await graphRequest('GET', '/me/onenote/notebooks?$top=1&$select=id');
  return { status: 'ready' as const, message: 'Microsoft OneNote connected' };
});

registerTools(app);

export const factory = app.toFactory();
