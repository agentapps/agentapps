/**
 * get-transcript — paginated access to a Granola meeting transcript.
 *
 * The Granola API returns the full transcript in one shot (no server-side
 * pagination). This tool fetches the complete transcript once and returns
 * a window of segments controlled by offset/limit, keeping each response
 * well within the SDK's 50K-char result ceiling.
 */

import type { AgentApp } from '@agentapps/sdk';
import { GranolaClient } from '../lib/index.js';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

export function registerGetTranscriptTool(app: AgentApp): void {
  app.tool('get-transcript', {
    description:
      'Get the transcript of a Granola meeting note, paginated by segments. ' +
      'Returns a window of transcript segments (speaker, text, timestamps) ' +
      'plus totalSegments, hasMore, and nextOffset for iteration. ' +
      'Start with offset 0 and follow nextOffset until hasMore is false.',
    parameters: {
      type: 'object',
      properties: {
        noteId: {
          type: 'string',
          description: 'Note ID (format: not_XXXXXXXXXXXXXX).',
        },
        offset: {
          type: 'number',
          description: 'Segment index to start from (default: 0).',
          default: 0,
        },
        limit: {
          type: 'number',
          description: `Max segments to return (default: ${DEFAULT_LIMIT}, max: ${MAX_LIMIT}).`,
          default: DEFAULT_LIMIT,
        },
      },
      required: ['noteId'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const apiKey = await ctx.installationSecret('API_KEY');
      if (!apiKey) throw new Error('Missing API_KEY user secret.');

      const noteId = args.noteId as string;
      const offset = Math.max(0, (args.offset as number | undefined) ?? 0);
      const limit = Math.min(
        Math.max(1, (args.limit as number | undefined) ?? DEFAULT_LIMIT),
        MAX_LIMIT,
      );

      const client = new GranolaClient(apiKey);
      const note = await client.getNote(noteId, true);

      const allSegments = note.transcript ?? [];
      const totalSegments = allSegments.length;

      if (totalSegments === 0) {
        return {
          noteId,
          title: note.title,
          totalSegments: 0,
          offset: 0,
          limit,
          hasMore: false,
          segments: [],
        };
      }

      const clampedOffset = Math.min(offset, totalSegments);
      const page = allSegments.slice(clampedOffset, clampedOffset + limit);
      const nextOffset = clampedOffset + page.length;

      return {
        noteId,
        title: note.title,
        totalSegments,
        offset: clampedOffset,
        limit,
        returned: page.length,
        hasMore: nextOffset < totalSegments,
        nextOffset: nextOffset < totalSegments ? nextOffset : undefined,
        segments: page,
      };
    },
  });
}
