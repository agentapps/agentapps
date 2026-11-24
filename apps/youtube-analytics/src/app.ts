import { createApp } from '@agentapps/sdk';
import { isoDay } from './lib/args.js';
import { getAccessToken } from './lib/client.js';
import { queryReport } from './lib/report.js';
import { registerTools } from './tools/index.js';

// Exported (not only wrapped in `factory`) so the tests can compare `app.toManifest()` with
// agentapp.json: both describe the same app and must not drift apart.
export const app = createApp({
  id: 'app.youtube-analytics',
  name: 'YouTube Analytics',
  version: '1.1.0',
  description:
    "Read YouTube channel analytics with the YouTube Analytics API and the YouTube Data API v3: views, watch time, subscribers, traffic sources, devices, geography, demographics, top videos, audience retention, and the channel's videos and playlists. Read-only; Google OAuth.",
  tagline:
    'Channel and video analytics for your YouTube channel: views, watch time, retention and audience',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  logo: 'assets/logo.svg',
  logoMono: 'assets/logo-mono.svg',
  terms: 'https://agentapps.tech/terms',
  category: 'google',
  keywords: [
    'youtube',
    'youtube analytics',
    'video',
    'channel',
    'marketing',
    'watch time',
    'subscribers',
    'audience retention',
  ],
  entrypoint: {
    type: 'module',
    path: 'src/app.ts',
    export: 'factory',
  },
  runtime: {
    transport: 'stdio',
    command: 'tsx',
    args: ['src/app.ts'],
  },
  capabilities: {
    tools: true,
    health: true,
  },
  auth: {
    type: 'oauth2',
    provider: 'google',
    // The host uses the client id and secret for the token exchange and refresh; the app
    // itself only ever reads the access token.
    systemSecrets: ['CLIENT_ID', 'CLIENT_SECRET'],
    installationSecrets: ['ACCESS_TOKEN', 'REFRESH_TOKEN', 'EMAIL', 'EXPIRY_DATE'],
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/yt-analytics.readonly',
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    pkce: false,
  },
});

app.health(async (ctx) => {
  try {
    await getAccessToken(ctx);
  } catch (err) {
    const message = (err as Error).message;
    return {
      status: 'not_ready' as const,
      message,
      issues: [{ code: 'MISSING_SECRET', message, severity: 'error' as const }],
    };
  }
  try {
    // The cheapest call that proves the token, the analytics scope and the channel: one
    // metric for one day.
    const yesterday = isoDay(new Date(Date.now() - 86_400_000));
    await queryReport(ctx, {
      startDate: yesterday,
      endDate: yesterday,
      metrics: ['views'],
      timeoutMs: 5_000,
    });
    return { status: 'ready' as const, message: 'YouTube Analytics reachable' };
  } catch (err) {
    const message = (err as Error).message;
    const code = /^\[(\w+)\]/.exec(message)?.[1];
    if (code && ['AUTH_EXPIRED', 'AUTH_REQUIRED', 'MISSING_SCOPE', 'FORBIDDEN'].includes(code)) {
      return {
        status: 'not_ready' as const,
        message,
        issues: [{ code, message, severity: 'error' as const }],
      };
    }
    return {
      status: 'degraded' as const,
      message,
      issues: [{ code: 'DEPENDENCY_UNAVAILABLE', message, severity: 'warning' as const }],
    };
  }
});

registerTools(app);

export const factory = app.toFactory();
export default factory;
