import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { extractCanvas } from './_canvas-helpers.js';
import { validateChannelId } from './_helpers.js';
import { SlackApiError } from './_slack-error.js';
import { sanitiseBody, wrapSlackMutation } from './utils.js';

interface CreateChannelCanvasArgs {
  channelId: string;
  title?: string;
  contentMarkdown?: string;
}

export function registerCreateChannelCanvasTool(app: AgentApp): void {
  app.tool('create-channel-canvas', {
    description:
      'Create a canvas attached to a channel (visible to all members). Returns curated canvas. EXPERIMENTAL. Params: channelId, title?, contentMarkdown?.',
    parameters: {
      type: 'object',
      properties: {
        channelId: { type: 'string', description: 'Channel id.' },
        title: { type: 'string', description: 'Optional title (def channel name).' },
        contentMarkdown: { type: 'string', description: 'Initial markdown content.' },
      },
      required: ['channelId'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { channelId, title, contentMarkdown } = args as unknown as CreateChannelCanvasArgs;
      validateChannelId(channelId, 'channelId');
      const document_content = contentMarkdown
        ? { type: 'markdown' as const, markdown: contentMarkdown }
        : undefined;
      const { client } = await getSlackSession(ctx);
      const result = await wrapSlackMutation(() =>
        (client as any).conversations.canvases.create(
          sanitiseBody({ channel_id: channelId, title, document_content }) as any,
        ),
      );
      const curated = extractCanvas(result?.canvas ?? result, channelId);
      if (!curated.id) {
        throw new SlackApiError({
          code: 'FEATURE_GATED',
          action: {
            type: 'admin_action',
            description:
              'Slack Channel Canvas API returned an empty response. Canvas is a 2024+ feature gated by workspace plan, and some channel types reject canvases. Upgrade the plan or verify the channel is eligible.',
          },
          retryable: false,
          httpStatus: null,
          upstreamMessage: 'channel_canvas_disabled_or_empty_response',
        });
      }
      return curated;
    },
  });
}
