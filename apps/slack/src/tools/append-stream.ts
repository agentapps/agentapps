import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { wrapSlackMutation } from './utils.js';

interface AppendStreamArgs {
  streamId: string;
  content: string;
}

export function registerAppendStreamTool(app: AgentApp): void {
  app.tool('append-stream', {
    description:
      'Append a chunk of content to an active streaming message. Returns { streamId, appended: true }. Not retryable (each call appends — retry would duplicate content). EXPERIMENTAL. Params: streamId, content.',
    parameters: {
      type: 'object',
      properties: {
        streamId: { type: 'string', description: 'Stream id from start-stream.' },
        content: { type: 'string', description: 'Markdown chunk to append.' },
      },
      required: ['streamId', 'content'],
    },
    annotations: { readOnlyHint: false },
    handler: async (args, ctx) => {
      const { streamId, content } = args as unknown as AppendStreamArgs;
      if (typeof streamId !== 'string' || streamId.trim().length === 0) {
        throw new Error('streamId must be a non-empty string.');
      }
      if (typeof content !== 'string' || content.length === 0) {
        throw new Error('content must be a non-empty string.');
      }
      const { client } = await getSlackSession(ctx);
      await wrapSlackMutation(() =>
        (client as any).chat.appendStream({ stream_id: streamId, content }),
      );
      return { streamId, appended: true, length: content.length };
    },
  });
}
