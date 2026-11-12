import type { AgentApp } from '@agentapps/sdk';
import {
  buildParagraphXml,
  createGraphClient,
  editDocxInPlace,
  insertParagraphsXml,
  itemRef,
  readPart,
  writePart,
} from '../lib/index.js';

/** append-paragraphs — add paragraphs to the end of the body. */
export function registerAppendParagraphsTool(app: AgentApp): void {
  app.tool('append-paragraphs', {
    description:
      'Add paragraphs to the end of a Word document, leaving everything already there untouched. Overwrites the stored file; earlier states are recoverable only through OneDrive version history.',
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
        paragraphs: {
          type: 'array',
          description: 'Paragraphs to append, in order. Each is { text, style? }.',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              style: { type: 'string', enum: ['Heading1', 'Heading2', 'Heading3'] },
            },
            required: ['text'],
          },
        },
      },
      required: ['paragraphs'],
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
      if (!Array.isArray(a.paragraphs) || a.paragraphs.length === 0) {
        throw new Error('Specify paragraphs — at least one { text } entry to append.');
      }
      const entries = a.paragraphs as Array<{ text?: unknown; style?: unknown }>;
      const xml = entries
        .map((entry) => {
          if (typeof entry?.text !== 'string') {
            throw new Error('Every paragraph needs a text string.');
          }
          return buildParagraphXml(
            entry.text,
            typeof entry.style === 'string' ? entry.style : undefined,
          );
        })
        .join('');

      const { uploadedBytes } = await editDocxInPlace(graphRequest, ref, async (zip) => {
        const doc = await readPart(zip, 'word/document.xml');
        writePart(zip, 'word/document.xml', insertParagraphsXml(doc, xml));
      });

      return { success: true, account: email, paragraphsAppended: entries.length, uploadedBytes };
    },
  });
}
