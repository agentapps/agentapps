import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient, escapeHtml, markdownToHtmlFragment, requireId } from '../lib/index.js';

/** replace-page-content — PATCH /me/onenote/pages/{id}/content. */
export function registerReplacePageContentTool(app: AgentApp): void {
  app.tool('replace-page-content', {
    description:
      'Replace the content of a OneNote page, or just its title. This overwrites what was there and cannot be undone — use append-to-page to add without removing.',
    parameters: {
      type: 'object',
      properties: {
        pageId: {
          type: 'string',
          description: 'Page id, as returned by list-pages or search-pages.',
        },
        content: {
          type: 'string',
          description:
            'Replacement content, in markdown unless contentFormat says otherwise. When target is "title", this is plain text.',
        },
        contentFormat: {
          type: 'string',
          enum: ['markdown', 'html'],
          description: 'Format of `content`. Defaults to markdown. Ignored when target is "title".',
        },
        target: {
          type: 'string',
          description:
            'What to replace: "body" (default), "title", or a data-id from get-page-content with includeIDs: true.',
        },
      },
      required: ['pageId', 'content'],
    },
    annotations: {
      readOnlyHint: false,
      // Irreversible: the previous content is not recoverable from here.
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = (args ?? {}) as Record<string, unknown>;
      const page = requireId(a, ['pageId'], 'the page id from list-pages or search-pages');
      if (typeof a.content !== 'string' || a.content.trim() === '') {
        // This tool is irreversible, so an empty replacement is treated as a
        // caller bug rather than an instruction to blank the page.
        throw new Error(
          'Specify content — replace-page-content overwrites the target and cannot blank it.',
        );
      }

      const target = typeof a.target === 'string' && a.target.trim() ? a.target.trim() : 'body';
      const format = a.contentFormat === 'html' ? 'html' : 'markdown';

      // A page title is text, not markup: rendering markdown into it would put
      // literal tags in the heading, and not escaping it would inject markup.
      const content =
        target === 'title'
          ? escapeHtml(a.content.trim())
          : await markdownToHtmlFragment(a.content, format);

      // `position` is meaningless for a replace and is not sent.
      await graphRequest('PATCH', `/me/onenote/pages/${page.encoded}/content`, [
        { target, action: 'replace', content },
      ]);

      return { success: true, account: email, pageId: page.id, target, replaced: true };
    },
  });
}
