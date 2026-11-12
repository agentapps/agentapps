import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient, formatItem, itemAction, itemRef } from '../lib/index.js';
import { coreProperties, documentXmlOf, listParagraphs } from '../lib/read-docx.js';

/** get-document-info — metadata plus a cheap structural summary. */
export function registerGetDocumentInfoTool(app: AgentApp): void {
  app.tool('get-document-info', {
    description:
      "Get a Word document's OneDrive metadata, its Word document properties, and its paragraph and word counts.",
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

      const item = await graphRequest<Record<string, any>>(
        'GET',
        `${ref}?$select=id,name,size,createdDateTime,lastModifiedDateTime,webUrl`,
      );
      // One download serves both the paragraph count and the properties.
      const raw = await graphRequest<Buffer>('GET', itemAction(ref, '/content'), undefined, {
        responseType: 'buffer',
      });
      const bytes = Buffer.from(raw);
      const paragraphs = listParagraphs(await documentXmlOf(bytes));
      const words = paragraphs
        .map((p) => p.text)
        .join(' ')
        .split(/\s+/)
        .filter(Boolean).length;

      return {
        account: email,
        item: formatItem(item),
        properties: await coreProperties(bytes),
        paragraphCount: paragraphs.length,
        wordCount: words,
      };
    },
  });
}
