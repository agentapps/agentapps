/**
 * Replicate API types and fetch helper.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const REPLICATE_API_URL = 'https://api.replicate.com/v1';

// ---------------------------------------------------------------------------
// API types
// ---------------------------------------------------------------------------

export interface ReplicatePrediction {
  id: string;
  model: string;
  version?: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  input: Record<string, unknown>;
  output: unknown;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  urls: {
    get: string;
    cancel: string;
  };
}

export interface ReplicateModel {
  owner: string;
  name: string;
  description: string;
  url: string;
  run_count: number;
  latest_version?: {
    id: string;
    openapi_schema?: {
      components?: {
        schemas?: {
          Input?: Record<string, unknown>;
        };
      };
    };
  };
}

export interface ReplicateModelSummary {
  id: string;
  description: string;
  run_count: number;
  url: string;
}

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

/**
 * Make an authenticated request to the Replicate API.
 */
export async function replicateRequest(
  endpoint: string,
  apiToken: string,
  options: RequestInit = {},
): Promise<Response> {
  return fetch(`${REPLICATE_API_URL}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Token ${apiToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}

/**
 * Check the API response and throw a descriptive error if not OK.
 */
export async function assertOk(response: Response): Promise<void> {
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Replicate API error ${response.status}: ${body}`);
  }
}
