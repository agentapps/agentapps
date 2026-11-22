import type { AgentApp } from '@agentapps/sdk';
import {
  buildMultipartPage,
  buildPageHtml,
  createGraphClient,
  formatPage,
  markdownToHtmlFragment,
  requireId,
} from '../lib/index.js';

/**
 * create-page — POST /me/onenote/sections/{id}/pages.
 *
 * OneNote page creation is multipart/form-data with an HTML `Presentation`
 * part, not JSON. The envelope is built in helpers.ts; this tool resolves the
 * section, renders the content, and hands the client bytes plus a content type.
 */
export function registerCreatePageTool(app: AgentApp): void {
  app.tool('create-page', {
    description:
      'Create a OneNote page in a section. Content is markdown by default and is converted to the HTML OneNote stores.',
    parameters: {
      type: 'object',
      properties: {
        parentSectionId: {
          type: 'string',
          description:
            'Id of the section to create the page in, from list-sections. Also accepted as sectionId.',
        },
        sectionId: {
          type: 'string',
          description: 'Alias for parentSectionId.',
        },
        title: {
          type: 'string',
          description:
            "Page title. OneNote stores this as the page's <title> element — there is no separate title field.",
        },
        content: {
          type: 'string',
          description: 'Page body, in markdown unless contentFormat says otherwise.',
        },
        contentFormat: {
          type: 'string',
          enum: ['markdown', 'html'],
          description:
            'Format of `content`. Defaults to markdown. Use html to pass OneNote markup through unchanged.',
        },
      },
      required: ['parentSectionId', 'title', 'content'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = (args ?? {}) as Record<string, unknown>;
      const section = requireId(
        a,
        ['parentSectionId', 'sectionId'],
        'the section to create the page in, from list-sections',
      );
      if (typeof a.title !== 'string' || a.title.trim() === '') {
        throw new Error('Specify title — OneNote stores it as the page heading.');
      }
      if (typeof a.content !== 'string' || a.content.trim() === '') {
        throw new Error(
          'Specify content — the page body, in markdown unless contentFormat says otherwise.',
        );
      }
      const format = a.contentFormat === 'html' ? 'html' : 'markdown';

      // Everything validatable is validated first: this POST is never retried
      // (spec §8.2), so a failed request is a failed request.
      const bodyHtml = await markdownToHtmlFragment(a.content, format);
      const html = buildPageHtml(a.title.trim(), bodyHtml);
      const { body, contentType } = buildMultipartPage(html);

      const created = await graphRequest<Record<string, any>>(
        'POST',
        `/me/onenote/sections/${section.encoded}/pages`,
        undefined,
        { rawBody: body, headers: { 'Content-Type': contentType } },
      );

      return {
        success: true,
        account: email,
        sectionId: section.id,
        page: formatPage(created),
      };
    },
  });
}
