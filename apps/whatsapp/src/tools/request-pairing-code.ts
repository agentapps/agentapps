import type { AgentApp } from '@agentapps/sdk';
import { wahaFetch } from '../lib/api.js';

export function registerRequestPairingCodeTool(app: AgentApp): void {
  app.tool('request-pairing-code', {
    description:
      'Request a numeric pairing code to link a WhatsApp session. This is the ONLY supported way to authenticate/link a session in Agent Apps. The session must be in SCAN_QR_CODE state — WAHA\'s "waiting to be linked" state (if not, it will be stopped and restarted automatically). Returns an 8-digit code like "XXXX-YYYY" to enter in WhatsApp > Linked Devices > Link with phone number.',
    parameters: {
      type: 'object',
      properties: {
        session: {
          type: 'string',
          description: 'Session name (default: "default")',
        },
        phoneNumber: {
          type: 'string',
          description: 'Phone number with country code, no + or spaces (e.g. "34612345678")',
        },
      },
      required: ['phoneNumber'],
    },
    annotations: {
      readOnlyHint: false,
      // May stop and restart the session; start-session brings it back.
      destructiveHint: false,
      idempotentHint: false,
      // WAHA is a separate process reached over HTTP, and WhatsApp issues the code.
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { session = 'default', phoneNumber } = args as {
        session?: string;
        phoneNumber: string;
      };

      // 1. Ensure session is in SCAN_QR_CODE state
      const statusRes = await wahaFetch(ctx, `/sessions/${session}`);
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        if (statusData.status !== 'SCAN_QR_CODE') {
          // Stop and restart to get into SCAN_QR_CODE
          await wahaFetch(ctx, `/sessions/${session}/stop`, { method: 'POST' });
          const startRes = await wahaFetch(ctx, `/sessions/${session}/start`, { method: 'POST' });
          if (!startRes.ok) {
            return { success: false, error: `Failed to restart session: ${startRes.status}` };
          }
          // Give WAHA a moment to transition to SCAN_QR_CODE
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      } else {
        return {
          success: false,
          error: `Session "${session}" not found. Use start-session first.`,
        };
      }

      // 2. Request the pairing code
      const codeRes = await wahaFetch(ctx, `/${session}/auth/request-code`, {
        method: 'POST',
        body: JSON.stringify({ phoneNumber }),
      });
      if (!codeRes.ok) {
        const err = await codeRes.json().catch(() => ({}));
        return { success: false, error: `WAHA returned HTTP ${codeRes.status}`, detail: err };
      }
      const codeData = await codeRes.json();
      return {
        success: true,
        code: codeData.code,
        instructions:
          'On your phone: WhatsApp > Settings > Linked Devices > Link a Device > Link with phone number > enter the code above',
      };
    },
  });
}
