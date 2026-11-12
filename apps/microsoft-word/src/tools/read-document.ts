import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient, itemAction, itemRef } from '../lib/index.js';
import { docxToHtml, docxToMarkdown } from '../lib/read-docx.js';

/** read-document — the document's prose, for an agent to reason about. */
export function registerReadDocumentTool(app: AgentApp): void {
  app.tool('read-document', {
    description:
      'Read a Word document as markdown (default) or HTML. Returns prose, not structure — use list-paragraphs when you need indices to edit.',
    parameters: {
      type: 'object',
      properties: {
        itemId: {
          type: 'string',
          description: 'OneDrive item id of the .docx. Takes precedence over path.',
        },
        path: {
          type: 'string',
          description:
            'Path to the .docx relative to the drive root. Pass literal names, not pre-encoded ones.',
        },
        format: {
          type: 'string',
          enum: ['markdown', 'html'],
          description: 'Output format. Defaults to markdown.',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = (args ?? {}) as Record<string, unknown>;
      const ref = itemRef(a);
      const format = a.format === 'html' ? 'html' : 'markdown';
      const raw = await graphRequest<Buffer>('GET', itemAction(ref, '/content'), undefined, {
        responseType: 'buffer',
      });
      const bytes = Buffer.from(raw);
      const content = format === 'html' ? await docxToHtml(bytes) : await docxToMarkdown(bytes);

      return { account: email, format, content };
    },
  });
}
