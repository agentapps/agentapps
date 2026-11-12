import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { extractCanvas } from './_canvas-helpers.js';
import { SlackApiError } from './_slack-error.js';
import { sanitiseBody, wrapSlackMutation } from './utils.js';

interface CreateCanvasArgs {
  title: string;
  contentMarkdown?: string;
}

export function registerCreateCanvasTool(app: AgentApp): void {
  app.tool('create-canvas', {
    description:
      'Create a standalone Slack Canvas (rich-text doc). Returns curated canvas. EXPERIMENTAL. Params: title, contentMarkdown? (initial content).',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Canvas title.' },
        contentMarkdown: {
          type: 'string',
          description: 'Initial markdown content (h1/h2/h3, bullets, **bold**, etc.).',
        },
      },
      required: ['title'],
    },
    annotations: { readOnlyHint: false },
    handler: async (args, ctx) => {
      const { title, contentMarkdown } = args as unknown as CreateCanvasArgs;
      if (typeof title !== 'string' || title.trim().length === 0) {
        throw new Error('title must be a non-empty string.');
      }
      const { client } = await getSlackSession(ctx);
      const document_content = contentMarkdown
        ? { type: 'markdown' as const, markdown: contentMarkdown }
        : undefined;
      const result = await wrapSlackMutation(() =>
        (client as any).canvases.create(sanitiseBody({ title, document_content }) as any),
      );
      const curated = extractCanvas(result?.canvas ?? result);
      if (!curated.id) {
        throw new SlackApiError({
          code: 'FEATURE_GATED',
          action: {
            type: 'admin_action',
            description:
              'Slack Canvas API returned an empty response. Canvas is a 2024+ feature gated by workspace plan. Upgrade the plan or enable Canvas in workspace settings.',
          },
          retryable: false,
          httpStatus: null,
          upstreamMessage: 'canvas_disabled_or_empty_response',
        });
      }
      return curated;
    },
  });
}
