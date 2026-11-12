/**
 * Ensures the "default" WAHA session exists and is started.
 * Called once at startup after WAHA is ready.
 *
 * Behaviour:
 *   1. Wait for WAHA to finish auto-starting persisted sessions
 *      (WHATSAPP_RESTART_ALL_SESSIONS=true). We retry up to
 *      AUTO_START_RETRIES times with a short delay.
 *   2. If the session already exists → update webhook config and
 *      ensure it is running. WAHA will reconnect using saved
 *      credentials (no re-linking needed).
 *   3. If the session truly does not exist → create it fresh.
 *      It enters SCAN_QR_CODE; the user links via request-pairing-code.
 *
 * Called from `app.onSubscribe` once the webhook listener is running, so the
 * session's webhook config can point WAHA at it.
 */
import type { SecretsContext } from './api.js';
import { wahaFetch } from './api.js';
import { WEBHOOK_PATH } from './webhook-listener.js';

/** How many times to retry on 404 before deciding the session is truly new. */
const AUTO_START_RETRIES = 5;
/** Delay between retries in ms. WAHA takes a few seconds to auto-start. */
const AUTO_START_RETRY_DELAY_MS = 3_000;

/** Build the webhook config that tells WAHA to POST events to the Agent App. */
function buildWebhookConfig(port: number): Array<{ url: string; events: string[] }> {
  return [
    {
      url: `http://localhost:${port}${WEBHOOK_PATH}`,
      events: ['message', 'message.any', 'message.reaction', 'session.status'],
    },
  ];
}

/** GOWS session config shared between create and update. */
const GOWS_STORAGE_CONFIG = {
  gows: {
    storage: { messages: true, groups: true, chats: true, labels: true },
  },
};

/**
 * Ensure the default WAHA session exists and is started.
 *
 * @param ctx - SecretsContext for fetching config.
 * @param options.webhookPort - when set, the session's webhook config is
 *   pointed at the app's listener on that port.
 */
export async function ensureDefaultSession(
  ctx: SecretsContext,
  options: { webhookPort?: number } = {},
): Promise<void> {
  const SESSION = 'default';
  const doFetch = (path: string, init?: RequestInit) => wahaFetch(ctx, path, init);

  const webhooks =
    options.webhookPort !== undefined ? buildWebhookConfig(options.webhookPort) : undefined;

  try {
    // ── Step 1: Wait for session, retrying to give WAHA time to auto-start ──
    let statusRes: Response | null = null;
    for (let attempt = 1; attempt <= AUTO_START_RETRIES; attempt++) {
      statusRes = await doFetch(`/sessions/${SESSION}`);

      if (statusRes.status !== 404) {
        // Session found (or unexpected error) — stop retrying
        break;
      }

      // 404: session not found. If WHATSAPP_RESTART_ALL_SESSIONS is enabled,
      // WAHA may still be auto-starting it. Wait and retry.
      if (attempt < AUTO_START_RETRIES) {
        console.error(
          `[app.whatsapp] Session "${SESSION}" not found (attempt ${attempt}/${AUTO_START_RETRIES}), ` +
            `waiting ${AUTO_START_RETRY_DELAY_MS}ms for auto-start...`,
        );
        await new Promise((r) => setTimeout(r, AUTO_START_RETRY_DELAY_MS));
      }
    }

    if (!statusRes) return; // should never happen

    // ── Step 2: Handle session state ──
    if (statusRes.status === 404) {
      // Session truly doesn't exist after all retries → create fresh
      console.error(
        `[app.whatsapp] Session "${SESSION}" not found after ${AUTO_START_RETRIES} attempts. ` +
          'Creating new session with GOWS config...',
      );
      const createRes = await doFetch('/sessions', {
        method: 'POST',
        body: JSON.stringify({
          name: SESSION,
          config: {
            ...(webhooks ? { webhooks } : {}),
            ...GOWS_STORAGE_CONFIG,
          },
        }),
      });
      if (!createRes.ok) {
        const err = await createRes.text().catch(() => '');
        console.error(
          `[app.whatsapp] Failed to create default session: ${createRes.status} ${err}`,
        );
        return;
      }
      console.error(
        `[app.whatsapp] Session "${SESSION}" created. ` +
          'Link your WhatsApp account using request-pairing-code.',
      );
    } else if (statusRes.ok) {
      const sessionData = await statusRes.json();
      const status = sessionData?.status;
      console.error(`[app.whatsapp] Session "${SESSION}" exists with status: ${status}`);

      // Update webhook config on existing session (in case it was created
      // before webhooks were configured, or the port changed).
      if (webhooks) {
        try {
          const updateRes = await doFetch(`/sessions/${SESSION}`, {
            method: 'PUT',
            body: JSON.stringify({
              config: { webhooks, ...GOWS_STORAGE_CONFIG },
            }),
          });
          if (updateRes.ok) {
            console.error(`[app.whatsapp] Webhook config updated for session "${SESSION}".`);
          } else {
            const err = await updateRes.text().catch(() => '');
            console.error(
              `[app.whatsapp] Failed to update webhook config: ${updateRes.status} ${err}`,
            );
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[app.whatsapp] Webhook config update error: ${msg}`);
        }
      }

      if (status === 'STOPPED') {
        const startRes = await doFetch(`/sessions/${SESSION}/start`, { method: 'POST' });
        if (!startRes.ok) {
          const err = await startRes.text().catch(() => '');
          console.error(
            `[app.whatsapp] Failed to start default session: ${startRes.status} ${err}`,
          );
        } else {
          console.error(`[app.whatsapp] Session "${SESSION}" started successfully.`);
        }
      } else if (status === 'FAILED') {
        console.error(`[app.whatsapp] Session "${SESSION}" is FAILED, attempting recovery...`);
        await doFetch(`/sessions/${SESSION}/stop`, { method: 'POST' });
        await new Promise((r) => setTimeout(r, 1000));
        const startRes = await doFetch(`/sessions/${SESSION}/start`, { method: 'POST' });
        if (!startRes.ok) {
          const err = await startRes.text().catch(() => '');
          console.error(
            `[app.whatsapp] Failed to recover default session: ${startRes.status} ${err}`,
          );
        } else {
          console.error(`[app.whatsapp] Session "${SESSION}" recovered successfully.`);
        }
      } else {
        // STARTING, SCAN_QR_CODE, WORKING — leave it alone
        console.error(
          `[app.whatsapp] Session "${SESSION}" is already active (${status}), no action needed.`,
        );
      }
    } else {
      console.error(
        `[app.whatsapp] Unexpected status checking session "${SESSION}": ${statusRes.status}`,
      );
    }
  } catch (err) {
    // Non-fatal: log and continue — the app server still starts
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[app.whatsapp] ensureDefaultSession error: ${message}`);
  }
}
