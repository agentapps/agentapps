import { createApp, HealthCheckBuilder } from '@agentapps/sdk';
import { initializeGoogleClients } from './lib/index.js';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.google.forms',
  version: '2.1.0',
  name: 'Google Forms',
  description:
    'Manage Google Forms — create forms, add questions, and read responses via Google Forms API.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'google',
  keywords: ['google', 'forms', 'survey', 'responses', 'questions'],
  runtime: { transport: 'stdio', command: 'node', args: ['dist/app.js'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'oauth2',
    provider: 'google',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/forms.body',
      'https://www.googleapis.com/auth/forms.responses.readonly',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    pkce: false,
    systemSecrets: ['CLIENT_ID', 'CLIENT_SECRET'],
    installationSecrets: ['ACCESS_TOKEN', 'REFRESH_TOKEN'],
  },
});

app.health(async (ctx) => {
  const builder = new HealthCheckBuilder(ctx.secrets, ctx.auth);

  await builder.requireSystemSecret('CLIENT_ID');
  await builder.requireSystemSecret('CLIENT_SECRET');
  await builder.requireUserSecret('ACCESS_TOKEN', 'google');
  await builder.requireUserSecret('REFRESH_TOKEN', 'google');

  // If system secrets are present, validate connectivity with a real API call
  const systemSecrets = await ctx.secrets.getSystem();
  const installationSecrets = await ctx.secrets.getInstallation();

  if (
    systemSecrets?.CLIENT_ID &&
    systemSecrets?.CLIENT_SECRET &&
    installationSecrets?.ACCESS_TOKEN &&
    installationSecrets?.REFRESH_TOKEN
  ) {
    await builder.requireApiAccess(
      'https://www.googleapis.com/drive/v3/files',
      async () => {
        const clients = await initializeGoogleClients(ctx);
        await clients.drive.files.list({
          q: "mimeType='application/vnd.google-apps.form' and trashed=false",
          pageSize: 1,
          fields: 'files(id)',
        });
        return true;
      },
      { label: 'Google Forms API', provider: 'google' },
    );
  }

  return builder.build('Google Forms health check completed');
});

registerTools(app);

export const factory = app.toFactory();
