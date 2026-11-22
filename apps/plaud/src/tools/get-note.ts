import type { AgentApp } from '@agentapps/sdk';
import { getPlaudClient, mapNoteDetail } from '../lib/index.js';

const TRANSCRIPT_WARN_THRESHOLD = 100_000;

export function registerGetNoteTool(app: AgentApp): void {
  app.tool('get-note', {
    description:
      'Get full details for a PLAUD recording: transcript (concatenated), AI summary, and metadata.',
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
      destructiveHint: false,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const id = (args as Record<string, unknown>).id as string;

      const client = await getPlaudClient(ctx);
      const raw = (await client.getFileDetail(id)) as Record<string, unknown>;

      // Unwrap if the API wraps the detail in a data envelope
      const detail = (raw.data ?? raw) as Record<string, unknown>;
      // get_file returns the same shape as get_transcript; note_list is the AI summary.
      const note = mapNoteDetail(detail);

      const result: Record<string, unknown> = { ...note };

      if (note.transcript.length > TRANSCRIPT_WARN_THRESHOLD) {
        result._warning = `Transcript is very long (${note.transcript.length} characters). Consider using get-transcript for segment-level access.`;
      }

      return result;
    },
  });
}
