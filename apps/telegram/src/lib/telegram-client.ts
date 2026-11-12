/**
 * Shared Telegram Bot API client.
 *
 * - Auth via bot token in the URL path
 * - All methods use POST with JSON body (Content-Type: application/json)
 * - Response: { ok: boolean, result: ... } or { ok: false, description: "error" }
 */

const TELEGRAM_API_URL = 'https://api.telegram.org';

// ---------------------------------------------------------------------------
// Helper: get the bot token from system secrets
// ---------------------------------------------------------------------------

export async function getBotToken(ctx: {
  systemSecret: (key: string) => Promise<string | null>;
}): Promise<string> {
  const token = await ctx.systemSecret('BOT_TOKEN');
  if (!token) {
    throw new Error('[TELEGRAM_ERROR] Missing BOT_TOKEN system secret.');
  }
  return token;
}

// ---------------------------------------------------------------------------
// Main request function
// ---------------------------------------------------------------------------

export async function telegramRequest(
  method: string,
  params: Record<string, unknown> | null,
  ctx: { systemSecret: (key: string) => Promise<string | null> },
): Promise<unknown> {
  const token = await getBotToken(ctx);

  const url = `${TELEGRAM_API_URL}/bot${token}/${method}`;
  const init: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (params && Object.keys(params).length > 0) {
    init.body = JSON.stringify(params);
  }

  const response = await fetch(url, init);
  const data = (await response.json()) as { ok: boolean; result?: unknown; description?: string };

  if (!data.ok) {
    const message = data.description || response.statusText;
    throw new Error(`[TELEGRAM_ERROR] ${response.status}: ${message}`);
  }

  return data.result;
}
