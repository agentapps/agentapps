import type { AgentApp } from '@agentapps/sdk';
import {
  buildPageBreakXml,
  createGraphClient,
  editDocxInPlace,
  insertParagraphsXml,
  itemRef,
  readPart,
  writePart,
} from '../lib/index.js';

/** insert-page-break — append a page break to the end of the body. */
export function registerInsertPageBreakTool(app: AgentApp): void {
  app.tool('insert-page-break', {
    description:
      'Append a page break to a Word document, so subsequent content starts on a new page. Overwrites the stored file; earlier states are recoverable only through OneDrive version history.',
    parameters: {
      type: 'object',
      properties: {
        itemId: {
          type: 'string',
          description: 'OneDrive item id of the .docx. Takes precedence over path.',
        },
        path: {
          type: 'string',
          description: 'Path to the .docx relative to the drive root. Pass literal names.',
        },
      },
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = (args ?? {}) as Record<string, unknown>;
      const ref = itemRef(a);

      const { uploadedBytes } = await editDocxInPlace(graphRequest, ref, async (zip) => {
        const doc = await readPart(zip, 'word/document.xml');
        writePart(zip, 'word/document.xml', insertParagraphsXml(doc, buildPageBreakXml()));
      });

      return { success: true, account: email, uploadedBytes };
    },
  });
}
