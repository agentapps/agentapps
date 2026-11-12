/**
 * Perplexity API types and fetch helper.
 */

// ---------------------------------------------------------------------------
// API types
// ---------------------------------------------------------------------------

export interface PerplexityMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface PerplexityResponse {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  citations?: string[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export const PERPLEXITY_MODELS = ['sonar', 'sonar-pro', 'sonar-reasoning'] as const;
export type PerplexityModel = (typeof PERPLEXITY_MODELS)[number];

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';

/**
 * Call the Perplexity chat/completions API.
 * Returns the answer text and optional citation URLs.
 */
export async function perplexityFetch(
  apiKey: string,
  messages: PerplexityMessage[],
  model: PerplexityModel = 'sonar',
): Promise<{ answer: string; citations: string[] }> {
  const res = await fetch(PERPLEXITY_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, messages }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Perplexity API error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as PerplexityResponse;
  const answer = data.choices?.[0]?.message?.content ?? '';
  const citations = data.citations ?? [];

  return { answer, citations };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Append numbered source citations to an answer string.
 */
export function formatWithSources(answer: string, citations: string[]): string {
  if (citations.length === 0) return answer;
  const sources = citations.map((url, i) => `[${i + 1}] ${url}`).join('\n');
  return `${answer}\n\nSources:\n${sources}`;
}
