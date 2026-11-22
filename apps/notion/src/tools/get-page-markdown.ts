import type { AgentApp } from '@agentapps/sdk';
import { getNotionClient } from '../lib/notion-client.js';
import { resolveNotionId } from './_notion-helpers.js';
import { wrapNotionCall } from './utils.js';

export function registerGetPageMarkdownTool(app: AgentApp): void {
  app.tool('get-page-markdown', {
    description:
      "Retrieve a page's full content as markdown using the native Notion v5 endpoint. Replaces `get-page-content` (eliminated 2026-05). Pass `includeTranscript=true` to inline meeting_notes transcripts. Response: { markdown }.",
    parameters: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'Page UUID.' },
        includeTranscript: {
          type: 'boolean',
          description: 'Inline transcripts of meeting_notes blocks. Default false.',
        },
      },
      required: ['pageId'],
    },
    annotations: {
      version: '1.0.0',
      stability: 'stable',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args: any, ctx) => {
      const client = await getNotionClient(ctx);
      const {
        pageId: rawPageId,
        includeTranscript,
        includeRaw,
      } = args as {
        pageId: string;
        includeTranscript?: boolean;
        includeRaw?: boolean;
      };
      const pageId = resolveNotionId(rawPageId, 'pageId');

      const params: any = { page_id: pageId };
      if (includeTranscript) params.include_transcript = true;

      const response: any = await wrapNotionCall(() =>
        (client as any).pages.retrieveMarkdown(params),
      );
      if (includeRaw) return response;
      return { markdown: response.markdown ?? '' };
    },
  });
}
