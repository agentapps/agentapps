import type { AgentApp } from '@agentapps/sdk';
import {
  createGraphClient,
  editDocxInPlace,
  itemRef,
  readPart,
  removeParagraph,
  writePart,
} from '../lib/index.js';

/** delete-paragraph — remove one paragraph by its list-paragraphs index. */
export function registerDeleteParagraphTool(app: AgentApp): void {
  app.tool('delete-paragraph', {
    description:
      'Delete one paragraph from a Word document by its index from list-paragraphs. Indices shift after a delete, so re-list before deleting again. Cannot delete table content. Recoverable only through OneDrive version history.',
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
        paragraphIndex: {
          type: 'number',
          description: 'Zero-based paragraph index, as reported by list-paragraphs.',
        },
      },
      required: ['paragraphIndex'],
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
      // A destructive tool never guesses its target. Nothing validates
      // arguments before the handler runs, so an absent index would otherwise
      // become NaN and delete whatever that resolves to.
      if (typeof a.paragraphIndex !== 'number' || !Number.isInteger(a.paragraphIndex)) {
        throw new Error('Specify paragraphIndex — a whole number from list-paragraphs.');
      }

      const { uploadedBytes } = await editDocxInPlace(graphRequest, ref, async (zip) => {
        const doc = await readPart(zip, 'word/document.xml');
        writePart(zip, 'word/document.xml', removeParagraph(doc, a.paragraphIndex as number));
      });

      return { success: true, account: email, deletedIndex: a.paragraphIndex, uploadedBytes };
    },
  });
}
