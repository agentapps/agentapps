/**
 * Google Calendar Agent App — external change polling.
 *
 * Polls the Google Calendar API for changes and emits `calendar_updated`
 * events when events are created, updated, or deleted outside the app.
 * Uses the Calendar API `nextSyncToken` incremental sync when available,
 * falling back to a full windowed list when syncing for the first time.
 *
 * The poller is created at module load time but only started when the
 * `onSubscribe` lifecycle hook fires for `calendar_updated` (or the wildcard
 * `*`). This keeps the app idle when nobody is listening.
 */

import { createPoller, type ToolContext } from '@agentapps/sdk';
import { ensureAuthenticated, type GoogleCalendarEvent, googleCalendarFetch } from './types.js';

const DEFAULT_POLL_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes
const SYNC_LOOKAHEAD_DAYS = 30;

interface PollingState {
  lastSyncToken: string | null;
  /** Whether the previous poll established a baseline (no emissions yet). */
  hasBaseline: boolean;
  knownEventIds: Set<string>;
  lastUpdatedById: Map<string, string>;
}

const state: PollingState = {
  lastSyncToken: null,
  hasBaseline: false,
  knownEventIds: new Set(),
  lastUpdatedById: new Map(),
};

let activePoller: ReturnType<typeof createPoller> | null = null;

/**
 * Create (or return the existing) poller for external calendar changes.
 *
 * The poller is bound to the provided ToolContext so it can read secrets,
 * refresh tokens, and emit events. Calling this twice is a no-op: only one
 * poller runs per process.
 */
export function getOrCreatePoller(
  ctx: ToolContext,
  intervalMs = DEFAULT_POLL_INTERVAL_MS,
): ReturnType<typeof createPoller> {
  if (activePoller) {
    return activePoller;
  }

  const poller = createPoller(
    async (pollCtx) => {
      // Skip expensive polling when no one is listening anymore. This can
      // happen when the session is still open but the subscription was removed.
      if (!pollCtx.hasSubscribers('calendar_updated')) {
        return;
      }

      const tokens = await ensureAuthenticated(pollCtx);
      const calendarId = 'primary';

      const query = new URLSearchParams({
        maxResults: '250',
        singleEvents: 'true',
        orderBy: 'startTime',
      });

      if (state.lastSyncToken) {
        query.set('syncToken', state.lastSyncToken);
      } else {
        const timeMin = new Date().toISOString();
        const timeMax = new Date(
          Date.now() + SYNC_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000,
        ).toISOString();
        query.set('timeMin', timeMin);
        query.set('timeMax', timeMax);
      }

      let data: { items?: GoogleCalendarEvent[]; nextSyncToken?: string };
      try {
        data = await googleCalendarFetch<{ items?: GoogleCalendarEvent[]; nextSyncToken?: string }>(
          tokens.accessToken,
          `/calendars/${encodeURIComponent(calendarId)}/events`,
          { query },
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Sync token expired (410) → reset and re-baseline on the next tick.
        if (message.includes('410')) {
          pollCtx.log('info', 'Calendar sync token expired, re-baselining');
          resetState();
          return;
        }
        throw err;
      }

      const items = data.items ?? [];

      if (!state.hasBaseline) {
        // First successful sync: establish baseline without emitting events.
        updateState(items);
        state.hasBaseline = true;
      } else {
        const changes = classifyChanges(items);

        if (changes.created.length > 0) {
          pollCtx.emit('calendar_updated', { kind: 'created', events: changes.created });
        }
        if (changes.updated.length > 0) {
          pollCtx.emit('calendar_updated', { kind: 'updated', events: changes.updated });
        }
        if (changes.deleted.length > 0) {
          pollCtx.emit('calendar_updated', { kind: 'deleted', eventIds: changes.deleted });
        }

        updateState(items);
      }

      if (data.nextSyncToken) {
        state.lastSyncToken = data.nextSyncToken;
      }
    },
    intervalMs,
    { immediate: true, continueOnError: true },
  );

  poller.start(ctx);
  activePoller = poller;
  return poller;
}

export function stopPolling(): void {
  activePoller?.stop();
  activePoller = null;
  resetState();
}

export function resetState(): void {
  state.lastSyncToken = null;
  state.hasBaseline = false;
  state.knownEventIds.clear();
  state.lastUpdatedById.clear();
}

function classifyChanges(items: GoogleCalendarEvent[]): {
  created: GoogleCalendarEvent[];
  updated: GoogleCalendarEvent[];
  deleted: string[];
} {
  const created: GoogleCalendarEvent[] = [];
  const updated: GoogleCalendarEvent[] = [];
  const deleted: string[] = [];

  for (const event of items) {
    // Google Calendar incremental sync marks deleted events as cancelled.
    if (event.status === 'cancelled') {
      deleted.push(event.id);
      continue;
    }

    if (!state.knownEventIds.has(event.id)) {
      created.push(event);
    } else if (event.updated && state.lastUpdatedById.get(event.id) !== event.updated) {
      updated.push(event);
    } else {
      // The event is known and the updated timestamp has not changed, but it
      // was still returned by the sync — treat it as an update to be safe.
      updated.push(event);
    }
  }

  return { created, updated, deleted };
}

function updateState(events: GoogleCalendarEvent[]): void {
  for (const event of events) {
    if (event.status === 'cancelled') {
      state.knownEventIds.delete(event.id);
      state.lastUpdatedById.delete(event.id);
      continue;
    }
    state.knownEventIds.add(event.id);
    if (event.updated) {
      state.lastUpdatedById.set(event.id, event.updated);
    }
  }
}
