/**
 * Google Calendar Agent App — full Google Calendar API integration via @agentapps/sdk.
 *
 * Features:
 * - Real OAuth2 with Google (system secrets CLIENT_ID / CLIENT_SECRET).
 * - Automatic access-token refresh using persisted REFRESH_TOKEN.
 * - Full CRUD against the Google Calendar API:
 *     list_events, get_event, create_event, update_event, delete_event,
 *     quick_add_event, move_event.
 * - Calendar management: list_calendars, create_calendar.
 * - Free/busy queries: get_freebusy.
 * - Real-time events (calendar_updated) emitted on mutating operations.
 * - Explicit authenticate tool and open_calendar helper.
 * - Health check with secrets validation.
 *
 * Token refresh is delegated to the host via ctx.auth.refresh(): the host owns
 * the token exchange and persistence, so the client secret never enters the app
 * process and concurrent instances don't race on refresh.
 */

import { createApp } from '@agentapps/sdk';
import { registerCalendarUpdatedEvent } from './events/calendar-updated.js';
import { getOrCreatePoller } from './polling.js';
import { registerTools } from './tools/index.js';

// ---------------------------------------------------------------------------
// App configuration
// ---------------------------------------------------------------------------

const app = createApp({
  id: 'app.google.calendar',
  version: '1.0.0',
  name: 'Google Calendar',
  description:
    'Full Google Calendar integration with real OAuth2, token refresh, and complete event CRUD.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'productivity',
  keywords: ['google', 'calendar', 'oauth', 'crud', 'events'],
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
  capabilities: { tools: true, events: true, health: true, auth: true },
  auth: {
    type: 'oauth2',
    provider: 'google',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: ['https://www.googleapis.com/auth/calendar'],
    systemSecrets: ['CLIENT_ID', 'CLIENT_SECRET', 'REDIRECT_URI'],
    installationSecrets: ['ACCESS_TOKEN', 'REFRESH_TOKEN', 'expiresAt'],
  },
  installation: { singleton: true, requiresUserConsent: true },
});

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

registerCalendarUpdatedEvent(app);

// Start a background poller that emits calendar_updated for external changes.
// The poller is created now but only runs when a subscriber binds a context.
app.onSubscribe((ctx, eventTypes) => {
  if (eventTypes.includes('calendar_updated') || eventTypes.includes('*')) {
    const intervalMs = Number(process.env.GOOGLE_CALENDAR_POLL_INTERVAL_MS) || undefined;
    getOrCreatePoller(ctx, intervalMs);
  }
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.health(async (ctx) => {
  const system = await ctx.secrets.getSystem();
  if (!system?.CLIENT_ID || !system?.CLIENT_SECRET) {
    return {
      status: 'not_ready',
      message: 'Missing Google OAuth system secrets (CLIENT_ID / CLIENT_SECRET)',
      issues: [
        {
          code: 'MISSING_SECRET',
          message: 'CLIENT_ID and CLIENT_SECRET are required for Google OAuth',
          severity: 'error' as const,
        },
      ],
    };
  }
  return { status: 'ready', message: 'Google Calendar ready' };
});

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

registerTools(app);

// ---------------------------------------------------------------------------
// Export factory
// ---------------------------------------------------------------------------

export const factory = app.toFactory();
export default factory;
