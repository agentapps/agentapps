import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { extractFile, isFileId, tsToIso } from './_helpers.js';
import { wrapSlackCall } from './utils.js';

interface GetFileArgs {
  fileId: string;
  includeComments?: boolean;
  includeRaw?: boolean;
}

interface CuratedFileComment {
  id: string;
  user: string | null;
  comment: string;
  createdAt: string | null;
}

function extractComment(raw: any): CuratedFileComment {
  return {
    id: raw?.id ?? '',
    user: raw?.user ?? null,
    comment: raw?.comment ?? '',
    createdAt: tsToIso(raw?.timestamp),
  };
}

export function registerGetFileTool(app: AgentApp): void {
  app.tool('get-file', {
    description:
      'Get full info for a file (channels shared, permalinks, optional comments). Returns curated file + comments?[]. Retryable. Params: fileId (F...), includeComments (def false), includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: 'Slack file id (F...).' },
        includeComments: {
          type: 'boolean',
          description: 'Include comment list (legacy API). Default false.',
        },
        includeRaw: {
          type: 'boolean',
          description: 'Return raw Slack file object. Default false.',
        },
      },
      required: ['fileId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { fileId, includeComments, includeRaw } = args as unknown as GetFileArgs;
      if (!isFileId(fileId)) {
        throw new Error(`Invalid fileId: expected Slack file id (F...), got "${fileId}"`);
      }
      const { client } = await getSlackSession(ctx);
      const result = await wrapSlackCall(() => client.files.info({ file: fileId }));
      if (includeRaw) return result;
      const file = result.file ? extractFile(result.file) : null;
      const comments =
        includeComments && Array.isArray(result.comments)
          ? (result.comments as any[]).map(extractComment)
          : undefined;
      return {
        file,
        ...(comments ? { comments } : {}),
      };
    },
  });
}
