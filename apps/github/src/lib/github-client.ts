/**
 * GitHub REST API client — adapted for Agent Apps SDK.
 *
 * Stateless: credentials are read from `ctx.secrets` on every call.
 * Uses user-to-server tokens from the GitHub App OAuth flow.
 */

import type { ToolContext } from '@agentapps/sdk';
import { resolveUserToken } from './github-user-token.js';

const BASE_URL = 'https://api.github.com';

export class GitHubApiError extends Error {
  readonly status: number;
  readonly body: GitHubErrorBody | string | null;
  readonly documentationUrl: string | null;
  readonly rateLimitRemaining: number | null;
  readonly rateLimitReset: number | null;

  constructor(opts: {
    status: number;
    statusText: string;
    body: GitHubErrorBody | string | null;
    documentationUrl: string | null;
    rateLimitRemaining: number | null;
    rateLimitReset: number | null;
  }) {
    const literal =
      (typeof opts.body === 'object' && opts.body && opts.body.message) ||
      (typeof opts.body === 'string' && opts.body) ||
      opts.statusText ||
      `HTTP ${opts.status}`;
    super(literal);
    this.name = 'GitHubApiError';
    this.status = opts.status;
    this.body = opts.body;
    this.documentationUrl = opts.documentationUrl;
    this.rateLimitRemaining = opts.rateLimitRemaining;
    this.rateLimitReset = opts.rateLimitReset;
  }
}

export interface GitHubErrorBody {
  message?: string;
  documentation_url?: string;
  errors?: Array<{ resource?: string; field?: string; code?: string; message?: string }>;
}

async function resolveToken(ctx: ToolContext): Promise<string> {
  return resolveUserToken(ctx);
}

export async function githubRequest(
  ctx: ToolContext,
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
    params?: Record<string, string | number | boolean | undefined>;
    accept?: string;
  } = {},
): Promise<unknown> {
  const token = await resolveToken(ctx);
  const { method = 'GET', body, params, accept } = options;

  let url = path.startsWith('http') ? path : `${BASE_URL}${path}`;

  if (params) {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      const encoded = encodeURIComponent(String(value)).replace(/%2F/g, '/');
      parts.push(`${encodeURIComponent(key)}=${encoded}`);
    }
    if (parts.length > 0) url += `?${parts.join('&')}`;
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: accept ?? 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'AgentApps-GitHub',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const rawText = await response.text().catch(() => '');
    let parsed: GitHubErrorBody | string | null = null;
    if (rawText) {
      try {
        parsed = JSON.parse(rawText) as GitHubErrorBody;
      } catch {
        parsed = rawText;
      }
    }
    const docUrl =
      typeof parsed === 'object' && parsed?.documentation_url ? parsed.documentation_url : null;
    const remaining = response.headers.get('x-ratelimit-remaining');
    const reset = response.headers.get('x-ratelimit-reset');
    throw new GitHubApiError({
      status: response.status,
      statusText: response.statusText,
      body: parsed,
      documentationUrl: docUrl,
      rateLimitRemaining: remaining ? Number.parseInt(remaining, 10) : null,
      rateLimitReset: reset ? Number.parseInt(reset, 10) : null,
    });
  }

  if (response.status === 204) return { success: true };
  if (accept && accept !== 'application/vnd.github+json' && !accept.includes('json')) {
    return response.text();
  }
  return response.json();
}
