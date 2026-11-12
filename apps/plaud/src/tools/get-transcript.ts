import type { AgentApp } from '@agentapps/sdk';
import { getPlaudClient, mapNoteDetail, mapSegments } from '../lib/index.js';

export function registerGetTranscriptTool(app: AgentApp): void {
  app.tool('get-transcript', {
    description:
      'Get raw transcript segments for a PLAUD recording. Returns each segment with text and optional timing. Use this instead of get-note when you only need the transcript and want to save token budget.',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The recording file ID (32-char hex string)',
        },
      },
      required: ['id'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const id = (args as Record<string, unknown>).id as string;

      const client = await getPlaudClient(ctx);
      const raw = (await client.getTranscript(id)) as Record<string, unknown>;

      // Unwrap if the API wraps the detail in a data envelope
      const detail = (raw.data ?? raw) as Record<string, unknown>;
      // The get_transcript MCP tool may return either a full note-like object or
      // a slim object with just segments. We map defensively for both shapes.
      // Plaud's official detail shape stores transcript segments in `source_list`.
      const segments = mapSegments(
        detail.source_list ??
          detail.segments ??
          detail.transcript_segments ??
          detail.content_list ??
          [],
      );
      const metadata = mapNoteDetail(detail);

      return {
        id: metadata.id || id,
        title: metadata.title,
        duration_seconds: metadata.duration_seconds,
        segments,
      };
    },
  });
}
