/**
 * Netlify REST API client (file-digest deploy flow).
 *
 * Stateless: the API token is read from `ctx.secrets.getInstallation()` on every call
 * (per-app container — each user's own token). Auth is the Bearer header.
 *
 * Uses plain `fetch` + `AbortController` (no safeFetch dependency).
 */

import { classify, extractMessage, NetlifyApiError } from './netlify-error.js';

export type { NetlifyErrorCode } from './netlify-error.js';
export { NetlifyApiError } from './netlify-error.js';

export const NETLIFY_API_BASE = 'https://api.netlify.com/api/v1';

/** Per-page size for paginated list endpoints (Netlify max is 100). */
export const SITES_PER_PAGE = 100;
/** Safety cap so a misbehaving API can never spin the pager forever. */
export const MAX_SITES_PAGES = 50;

export interface NetlifySite {
  id: string;
  name: string;
  url?: string;
  ssl_url?: string;
}

export interface NetlifyDeploy {
  id: string;
  state: string;
  site_id?: string;
  /** SHA1s the API still needs uploaded. May be empty. */
  required?: string[];
  /** Site primary HTTPS URL (published deploys). */
  ssl_url?: string;
  /** Per-deploy permalink HTTPS URL (e.g. https://<id>--site.netlify.app). */
  deploy_ssl_url?: string;
  error_message?: string | null;
}

export interface NetlifyUser {
  id: string;
  email?: string;
  full_name?: string;
}

export interface SecretsContext {
  secrets: {
    getSystem: () => Promise<Record<string, string> | null>;
    getUser: () => Promise<Record<string, string> | null>;
  };
}

/**
 * Collect every page of a list endpoint. Stops at the first short/empty page
 * (`< perPage` items) — the standard "no more pages" signal — and is bounded by
 * `maxPages` so a server that keeps returning full pages can't loop forever.
 */
export async function collectPages<T>(
  fetchPage: (page: number, perPage: number) => Promise<T[]>,
  perPage: number = SITES_PER_PAGE,
  maxPages: number = MAX_SITES_PAGES,
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const batch = await fetchPage(page, perPage);
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < perPage) break;
  }
  return all;
}

/** Build the file-upload URL path: strip the leading slash and escape segments. */
export function uploadPath(deployPath: string): string {
  return deployPath
    .replace(/^\/+/, '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

async function getToken(ctx: SecretsContext): Promise<string> {
  let secrets: Record<string, string> = {};
  try {
    const installationSecrets = await ctx.secrets.getInstallation();
    if (installationSecrets) secrets = installationSecrets;
  } catch {
    // fall through to the missing-key error below
  }
  const token = secrets.NETLIFY_TOKEN;
  if (!token || token.trim().length === 0) {
    throw new NetlifyApiError(
      'AUTH_INVALID',
      'No Netlify Personal Access Token configured. Add NETLIFY_TOKEN in the app settings.',
      401,
    );
  }
  return token.trim();
}

export class NetlifyClient {
  constructor(
    private readonly token: string,
    private readonly signal?: AbortSignal,
  ) {}

  private async request<T>(
    method: string,
    path: string,
    opts: { jsonBody?: unknown; rawBody?: Uint8Array } = {},
  ): Promise<T> {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.token}` };
    let body: BodyInit | undefined;
    if (opts.jsonBody !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.jsonBody);
    } else if (opts.rawBody !== undefined) {
      headers['Content-Type'] = 'application/octet-stream';
      body = opts.rawBody as BodyInit;
    }

    if (this.signal?.aborted) {
      throw new NetlifyApiError('CANCELLED', 'request aborted before it was sent');
    }

    let res: Response;
    try {
      res = await fetch(`${NETLIFY_API_BASE}${path}`, {
        method,
        headers,
        body,
        signal: this.signal,
      });
    } catch (err) {
      if (this.signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
        throw new NetlifyApiError('CANCELLED', 'request aborted');
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new NetlifyApiError('NETWORK_ERROR', msg);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new NetlifyApiError(
        classify(res.status),
        extractMessage(text, res.statusText),
        res.status,
      );
    }

    if (res.status === 204) return undefined as T;
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) return undefined as T;
    return (await res.json()) as T;
  }

  /** GET /user — validates the token. */
  getUser(): Promise<NetlifyUser> {
    return this.request<NetlifyUser>('GET', '/user');
  }

  /**
   * GET /sites — every site the token can access, across ALL pages.
   *
   * Netlify caps `/sites` at 100 items/page. Fetching only the first page would
   * make `deploy-site`'s "find existing site by name" miss anything on page 2+
   * and create a DUPLICATE site.
   */
  listSites(): Promise<NetlifySite[]> {
    return collectPages<NetlifySite>((page, perPage) =>
      this.request<NetlifySite[]>('GET', `/sites?page=${page}&per_page=${perPage}`),
    );
  }

  /** POST /sites — create a site (Netlify auto-names it when `name` is omitted). */
  createSite(name?: string): Promise<NetlifySite> {
    return this.request<NetlifySite>('POST', '/sites', { jsonBody: name ? { name } : {} });
  }

  /** POST /sites/{id}/deploys — declare the file digest, get back `required`. */
  createDeploy(
    siteId: string,
    files: Record<string, string>,
    draft: boolean,
  ): Promise<NetlifyDeploy> {
    return this.request<NetlifyDeploy>('POST', `/sites/${encodeURIComponent(siteId)}/deploys`, {
      jsonBody: { files, draft },
    });
  }

  /** PUT /deploys/{id}/files/{path} — upload one file's raw bytes. */
  uploadFile(deployId: string, deployPath: string, bytes: Uint8Array): Promise<NetlifyDeploy> {
    return this.request<NetlifyDeploy>(
      'PUT',
      `/deploys/${encodeURIComponent(deployId)}/files/${uploadPath(deployPath)}`,
      { rawBody: bytes },
    );
  }

  /** GET /deploys/{id} — deploy state for polling. */
  getDeploy(deployId: string): Promise<NetlifyDeploy> {
    return this.request<NetlifyDeploy>('GET', `/deploys/${encodeURIComponent(deployId)}`);
  }

  /** GET /sites/{siteId}/deploys/{deployId} — site-scoped deploy lookup. */
  getSiteDeploy(siteId: string, deployId: string): Promise<NetlifyDeploy> {
    return this.request<NetlifyDeploy>(
      'GET',
      `/sites/${encodeURIComponent(siteId)}/deploys/${encodeURIComponent(deployId)}`,
    );
  }
}

/** Get a token from secrets context and build a client. */
export async function netlifyClient(
  ctx: SecretsContext,
  signal?: AbortSignal,
): Promise<NetlifyClient> {
  const token = await getToken(ctx);
  return new NetlifyClient(token, signal);
}
