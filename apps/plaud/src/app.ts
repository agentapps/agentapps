import { createApp, HealthCheckBuilder } from '@agentapps/sdk';
import { getPlaudClient, getPlaudSecrets, mapRecording } from './lib/index.js';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.plaud',
  version: '2.0.1',
  name: 'PLAUD',
  description:
    'Access your PLAUD voice recordings, transcripts, and AI summaries through the official Plaud MCP server. Search and retrieve notes from your PLAUD library.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'productivity',
  keywords: ['plaud', 'voice', 'recordings', 'transcripts', 'notes', 'ai-summary', 'productivity'],
  runtime: { transport: 'stdio', command: 'node', args: ['dist/app.js'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'oauth2',
    provider: 'plaud',
    systemSecrets: ['CLIENT_ID'],
    installationSecrets: ['ACCESS_TOKEN', 'REFRESH_TOKEN', 'EXPIRY_DATE'],
    authorizeUrl: 'https://mcp.plaud.ai/authorize',
    tokenUrl: 'https://mcp.plaud.ai/token',
    scopes: ['recordings:read'],
    pkce: true,
  },
});

app.health(async (ctx) => {
  const builder = new HealthCheckBuilder(ctx.secrets, ctx.auth);
  await builder.requireUserSecret('ACCESS_TOKEN', 'plaud');

  try {
    const secrets = await getPlaudSecrets(ctx);
    if (!secrets.ACCESS_TOKEN) {
      return builder.build('PLAUD access token is missing.');
    }

    const client = await getPlaudClient(ctx);
    const raw = (await client.listRecordings()) as Record<string, unknown>;

    const list = Array.isArray(raw)
      ? raw
      : Array.isArray((raw as any).data)
        ? (raw as any).data
        : Array.isArray((raw as any).list)
          ? (raw as any).list
          : [];

    const recordings = list.map((item: Record<string, unknown>) => mapRecording(item));

    return builder.build(`Connected to Plaud MCP. ${recordings.length} recording(s) found.`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    if (
      message.includes('authorization required') ||
      message.toLowerCase().includes('unauthorized')
    ) {
      builder.addIssue({
        code: 'auth_required:plaud',
        message: 'PLAUD OAuth authorization is required.',
        severity: 'error',
        action: { type: 'oauth', url: '/auth/plaud', label: 'Connect PLAUD' },
      });
    } else if (message.includes('401') || message.toLowerCase().includes('authentication failed')) {
      builder.addIssue({
        code: 'auth_expired:plaud',
        message: 'PLAUD access token is invalid or expired.',
        severity: 'error',
        action: { type: 'oauth', url: '/auth/plaud', label: 'Reconnect PLAUD' },
      });
    } else {
      builder.addIssue({
        code: 'api_error:plaud',
        message: `Plaud MCP error: ${message}`,
        severity: 'error',
      });
    }

    return builder.build();
  }
});

registerTools(app);

export const factory = app.toFactory();
