/**
 * Shared PostHog API client.
 *
 * - Auth via `Authorization: Bearer ${API_KEY}` header
 * - Base URL: `https://app.posthog.com/api/projects/${PROJECT_ID}`
 * - All request/response bodies are JSON
 * - Credentials come from system secrets (API_KEY, PROJECT_ID)
 */

const POSTHOG_API_URL = 'https://app.posthog.com/api/projects';

// ---------------------------------------------------------------------------
// Config helper
// ---------------------------------------------------------------------------

export interface PostHogConfig {
  apiKey: string;
  projectId: string;
}

export async function getPostHogConfig(ctx: {
  systemSecret: (key: string) => Promise<string | undefined>;
}): Promise<PostHogConfig> {
  const apiKey = await ctx.systemSecret('API_KEY');
  if (!apiKey) {
    throw new Error('[POSTHOG_ERROR] Missing API_KEY system secret.');
  }
  const projectId = await ctx.systemSecret('PROJECT_ID');
  if (!projectId) {
    throw new Error('[POSTHOG_ERROR] Missing PROJECT_ID system secret.');
  }
  return { apiKey, projectId };
}

// ---------------------------------------------------------------------------
// Main request function
// ---------------------------------------------------------------------------

export interface PostHogRequestOptions {
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
}

export async function posthogRequest(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  options: PostHogRequestOptions | null,
  ctx: { systemSecret: (key: string) => Promise<string | undefined> },
): Promise<unknown> {
  const { apiKey, projectId } = await getPostHogConfig(ctx);

  let url = `${POSTHOG_API_URL}/${projectId}/${path}`;
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  };

  if (options?.query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(options.query)) {
      if (v !== undefined && v !== null) params.set(k, String(v));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  if (options?.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, init);
  const data = await response.json();

  if (!response.ok) {
    const message =
      (data as Record<string, unknown>)?.detail ??
      (data as Record<string, unknown>)?.message ??
      response.statusText;
    throw new Error(`[POSTHOG_ERROR] ${response.status}: ${message}`);
  }

  return data;
}
