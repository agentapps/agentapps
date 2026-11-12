/**
 * ElevenLabs API types and fetch helper.
 */

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

// ---------------------------------------------------------------------------
// API types
// ---------------------------------------------------------------------------

export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category: string;
  description: string;
  labels: Record<string, string>;
  preview_url: string;
}

export interface ElevenLabsSubscription {
  tier: string;
  character_count: number;
  character_limit: number;
  next_character_count_reset_unix: number;
  voice_limit: number;
  professional_voice_limit: number;
  can_extend_character_limit: boolean;
  allowed_to_extend_character_limit: boolean;
  status: string;
}

export interface TTSConfig {
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  speakerBoost?: boolean;
  outputFormat?: string;
}

export const TTS_MODELS = [
  'eleven_flash_v2_5',
  'eleven_turbo_v2_5',
  'eleven_turbo_v2',
  'eleven_multilingual_v2',
  'eleven_multilingual_v1',
  'eleven_monolingual_v1',
] as const;

export const OUTPUT_FORMATS = [
  'mp3_44100_128',
  'mp3_44100_192',
  'pcm_16000',
  'pcm_22050',
  'pcm_24000',
  'pcm_44100',
] as const;

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

export async function elevenLabsRequest(
  endpoint: string,
  apiKey: string,
  options: RequestInit = {},
): Promise<Response> {
  return fetch(`${ELEVENLABS_API_URL}${endpoint}`, {
    ...options,
    headers: {
      'xi-api-key': apiKey,
      ...options.headers,
    },
  });
}

export async function assertOk(response: Response): Promise<void> {
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`ElevenLabs API error ${response.status}: ${body}`);
  }
}
