/**
 * Shared Twilio API client.
 *
 * - Auth via HTTP Basic Auth (AccountSid:AuthToken)
 * - POST bodies use application/x-www-form-urlencoded
 * - Add .json to URL paths for JSON responses
 */

const TWILIO_API_URL = 'https://api.twilio.com/2010-04-01/Accounts';

// ---------------------------------------------------------------------------
// Helper: get AccountSid and AuthToken from system secrets
// ---------------------------------------------------------------------------

export async function getTwilioConfig(ctx: {
  systemSecret: (key: string) => Promise<string | null>;
}): Promise<{ accountSid: string; authToken: string }> {
  const accountSid = await ctx.systemSecret('ACCOUNT_SID');
  if (!accountSid) {
    throw new Error('[TWILIO_ERROR] Missing ACCOUNT_SID system secret.');
  }
  const authToken = await ctx.systemSecret('AUTH_TOKEN');
  if (!authToken) {
    throw new Error('[TWILIO_ERROR] Missing AUTH_TOKEN system secret.');
  }
  return { accountSid, authToken };
}

// ---------------------------------------------------------------------------
// Main request function
// ---------------------------------------------------------------------------

export async function twilioRequest(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  params: Record<string, unknown> | null,
  ctx: { systemSecret: (key: string) => Promise<string | null> },
): Promise<unknown> {
  const { accountSid, authToken } = await getTwilioConfig(ctx);

  let url = `${TWILIO_API_URL}/${accountSid}${path}.json`;
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
    },
  };

  if (params && Object.keys(params).length > 0) {
    if (method === 'GET') {
      const qs = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          qs.set(key, String(value));
        }
      }
      url += `?${qs.toString()}`;
    } else {
      const body = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          body.set(key, String(value));
        }
      }
      init.headers = {
        ...init.headers,
        'Content-Type': 'application/x-www-form-urlencoded',
      };
      init.body = body.toString();
    }
  }

  const response = await fetch(url, init);
  const data = await response.json();

  if (!response.ok) {
    const message = data?.message || response.statusText;
    throw new Error(`[TWILIO_ERROR] ${response.status}: ${message}`);
  }

  return data;
}

// ---------------------------------------------------------------------------
// Lookups API (different base URL)
// ---------------------------------------------------------------------------

const TWILIO_LOOKUPS_URL = 'https://lookups.twilio.com/v1/PhoneNumbers';

export async function twilioLookupRequest(
  phoneNumber: string,
  params: Record<string, unknown> | null,
  ctx: { systemSecret: (key: string) => Promise<string | null> },
): Promise<unknown> {
  const { accountSid, authToken } = await getTwilioConfig(ctx);

  let url = `${TWILIO_LOOKUPS_URL}/${encodeURIComponent(phoneNumber)}`;

  const qs = new URLSearchParams();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        qs.set(key, String(value));
      }
    }
  }
  const qsStr = qs.toString();
  if (qsStr) url += `?${qsStr}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    const message = data?.message || response.statusText;
    throw new Error(`[TWILIO_ERROR] ${response.status}: ${message}`);
  }

  return data;
}
