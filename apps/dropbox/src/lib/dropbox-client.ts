/**
 * Dropbox API client helpers.
 *
 * Dropbox uses an RPC-style API: every operation is a POST with a JSON body.
 * Metadata/RPC endpoints live at https://api.dropboxapi.com/2/.
 * Content endpoints (upload/download) live at https://content.dropboxapi.com/2/.
 */

const DROPBOX_API_URL = 'https://api.dropboxapi.com/2';

export interface DropboxContext {
  installationSecret: (key: string) => Promise<string | null>;
}

/**
 * Retrieve the Dropbox access token from installation secrets.
 */
export async function getDropboxToken(ctx: DropboxContext): Promise<string> {
  const token = await ctx.installationSecret('ACCESS_TOKEN');
  if (!token) throw new Error('[DROPBOX_ERROR] Missing ACCESS_TOKEN user secret.');
  return token;
}

/**
 * Make an authenticated POST request to the Dropbox RPC API.
 *
 * @param endpoint - API endpoint path (e.g. "files/list_folder")
 * @param body     - JSON body to send, or null for endpoints that require no body
 * @param ctx      - context providing access to installation secrets
 */
export async function dropboxRequest(
  endpoint: string,
  body: Record<string, unknown> | null,
  ctx: DropboxContext,
): Promise<unknown> {
  const token = await getDropboxToken(ctx);
  const url = `${DROPBOX_API_URL}/${endpoint}`;

  const init: RequestInit = {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : JSON.stringify(null),
  };

  const response = await fetch(url, init);
  const data = await response.json();

  if (!response.ok) {
    const message = data?.error_summary || data?.error?.message || response.statusText;
    throw new Error(`[DROPBOX_ERROR] ${response.status}: ${message}`);
  }

  return data;
}
