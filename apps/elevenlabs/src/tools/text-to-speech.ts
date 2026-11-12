/**
 * text_to_speech — generate speech from text using ElevenLabs.
 *
 * Returns the audio as base64-encoded data so the caller can save,
 * play, or forward it without requiring filesystem access.
 */

import type { AgentApp } from '@agentapps/sdk';
import { assertOk, elevenLabsRequest, OUTPUT_FORMATS, TTS_MODELS } from '../types.js';

export function registerTextToSpeechTool(app: AgentApp): void {
  app.tool('text_to_speech', {
    description:
      'Generate speech from text using ElevenLabs. Returns base64-encoded audio data. ' +
      'Use list_voices to discover available voices. Default model: eleven_flash_v2_5.',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The text to convert to speech.',
        },
        voiceId: {
          type: 'string',
          description:
            'Voice ID to use. Run list_voices to see available voices. ' +
            'If omitted, uses the ElevenLabs default voice.',
        },
        modelId: {
          type: 'string',
          enum: TTS_MODELS as unknown as string[],
          description: 'TTS model to use (default: eleven_flash_v2_5).',
        },
        stability: {
          type: 'number',
          description: 'Voice stability 0.0–1.0 (default: 0.5). Higher = more consistent.',
        },
        similarityBoost: {
          type: 'number',
          description:
            'Similarity boost 0.0–1.0 (default: 0.75). Higher = closer to original voice.',
        },
        style: {
          type: 'number',
          description: 'Style exaggeration 0.0–1.0 (default: 0). Higher = more expressive.',
        },
        outputFormat: {
          type: 'string',
          enum: OUTPUT_FORMATS as unknown as string[],
          description: 'Audio output format (default: mp3_44100_128).',
        },
      },
      required: ['text'],
    },
    annotations: { readOnlyHint: false },
    handler: async (args, ctx) => {
      const apiKey = await ctx.systemSecret('API_KEY');
      if (!apiKey) throw new Error('Missing API_KEY system secret.');

      const text = args.text as string;
      const voiceId = (args.voiceId as string) || 'JBFqnCBsd6RMkjVDRZzb';
      const modelId = (args.modelId as string) || 'eleven_flash_v2_5';
      const stability = (args.stability as number) ?? 0.5;
      const similarityBoost = (args.similarityBoost as number) ?? 0.75;
      const style = (args.style as number) ?? 0;
      const outputFormat = (args.outputFormat as string) || 'mp3_44100_128';

      ctx.log('info', `Generating speech: "${text.slice(0, 50)}..."`, { voiceId, modelId });

      const response = await elevenLabsRequest(
        `/text-to-speech/${voiceId}?output_format=${outputFormat}`,
        apiKey,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            model_id: modelId,
            voice_settings: {
              stability,
              similarity_boost: similarityBoost,
              style,
              use_speaker_boost: true,
            },
          }),
        },
      );
      await assertOk(response);

      const audioBuffer = await response.arrayBuffer();
      const base64 = Buffer.from(audioBuffer).toString('base64');
      const extension = outputFormat.startsWith('mp3') ? 'mp3' : 'wav';
      const mimeType = extension === 'mp3' ? 'audio/mpeg' : 'audio/wav';

      return {
        audio: base64,
        mimeType,
        format: outputFormat,
        voiceId,
        modelId,
        textLength: text.length,
        audioSizeBytes: audioBuffer.byteLength,
      };
    },
  });
}
