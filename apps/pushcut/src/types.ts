/**
 * Pushcut API types and fetch helper.
 */

const PUSHCUT_API_URL = 'https://api.pushcut.io/v1';

// ---------------------------------------------------------------------------
// API types
// ---------------------------------------------------------------------------

export interface PushcutNotification {
  text?: string;
  title?: string;
  input?: string;
  defaultAction?: PushcutAction;
  image?: string;
  sound?: string;
  actions?: PushcutAction[];
  devices?: string[];
}

export interface PushcutAction {
  name: string;
  url?: string;
  shortcut?: string;
  homekit?: string;
  input?: string;
  keepNotification?: boolean;
}

export interface PushcutExecute {
  shortcut?: string;
  homekit?: string;
  input?: string;
}

export interface PushcutDevice {
  id: string;
  name?: string;
}

export interface PushcutNotificationDef {
  id: string;
  title?: string;
}

export interface PushcutSubscription {
  actionName: string;
  url: string;
  isLocalUrl?: boolean;
}

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

/**
 * Resolve the Pushcut API key. The key identifies one user's Pushcut account
 * (their devices receive the notifications), so it is strictly a USER secret —
 * no system-level fallback: a missing key is a configuration error and must
 * fail loudly.
 */
export async function resolveApiKey(ctx: {
  installationSecret(name: string): Promise<string | undefined>;
}): Promise<string> {
  const apiKey = await ctx.installationSecret('API_KEY');
  if (!apiKey) throw new Error('Missing API_KEY user secret.');
  return apiKey;
}

export async function pushcutRequest(
  endpoint: string,
  apiKey: string,
  options: RequestInit = {},
): Promise<Response> {
  return fetch(`${PUSHCUT_API_URL}${endpoint}`, {
    ...options,
    headers: {
      'API-Key': apiKey,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}

export async function assertOk(response: Response): Promise<void> {
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Pushcut API error ${response.status}: ${body}`);
  }
}
