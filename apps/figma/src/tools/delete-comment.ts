import type { AgentApp } from '@agentapps/sdk';
import { figmaRequest } from '../lib/index.js';
import { validateFileKey } from './utils.js';

export function registerDeleteCommentTool(app: AgentApp): void {
  app.tool('delete-comment', {
    description:
      'Delete a comment from a Figma file. Returns { ok: true, fileKey, commentId } on success. Not reversible. Params: fileKey, commentId.',
    parameters: {
      type: 'object',
      properties: {
        fileKey: { type: 'string', description: 'The file key from a Figma URL.' },
        commentId: { type: 'string', description: 'ID of the comment to delete.' },
      },
      required: ['fileKey', 'commentId'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { fileKey, commentId } = args as { fileKey: string; commentId: string };

      const safeKey = validateFileKey(fileKey);
      if (typeof commentId !== 'string' || commentId.trim().length === 0)
        throw new Error('commentId must be a non-empty string');

      await figmaRequest<unknown>(
        `/files/${safeKey}/comments/${encodeURIComponent(commentId.trim())}`,
        ctx,
        { method: 'DELETE' },
      );

      return { ok: true, fileKey: safeKey, commentId: commentId.trim() };
    },
  });
}
