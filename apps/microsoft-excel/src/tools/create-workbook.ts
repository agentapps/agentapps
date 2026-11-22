import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient, encodePathSegments, normalizePath } from '../lib/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
/** A minimal valid empty .xlsx. A zero-byte file is not a usable workbook. */
const TEMPLATE_PATH = join(__dirname, '..', '..', 'assets', 'empty-workbook.xlsx');

/**
 * create-workbook — PUT an empty .xlsx to OneDrive.
 *
 * This is not a workbook API call. The workbook endpoints only become
 * available on a drive item once a valid .xlsx exists there.
 */
export function registerCreateWorkbookTool(app: AgentApp): void {
  app.tool('create-workbook', {
    description:
      'Create a new, empty Excel workbook in OneDrive. Fails if a file already exists at that path unless overwrite is set. This is not a workbook API call: it uploads an empty .xlsx, after which the workbook endpoints become available on that item. Returns the drive item, whose id addresses every other Excel tool.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description:
            'File name for the new workbook. ".xlsx" is appended if missing. Pass a literal name, not a pre-encoded one.',
        },
        parentPath: {
          type: 'string',
          description:
            'Destination folder path relative to the drive root, e.g. "Finance". Defaults to the drive root. Pass literal folder names, not pre-encoded ones.',
        },
        overwrite: {
          type: 'boolean',
          description:
            'When true, replaces any existing file at that path with a new empty workbook, discarding its contents permanently. Defaults to false, which fails instead.',
        },
      },
      required: ['name'],
    },
    annotations: {
      readOnlyHint: false,
      // Only with overwrite:true — but the hint has no way to say "conditionally",
      // and understating a data-losing path is the worse error.
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = (args ?? {}) as Record<string, unknown>;
      // `required` in the JSON schema is declarative only — the SDK runs no
      // argument validation before the handler, so a missing `name` must be
      // guarded explicitly rather than trusted.
      if (typeof a.name !== 'string' || !a.name.trim()) {
        throw new Error('Specify name for the new workbook, for example "Budget.xlsx".');
      }
      const rawName = a.name.trim();
      const name = rawName.toLowerCase().endsWith('.xlsx') ? rawName : `${rawName}.xlsx`;
      const folder = encodePathSegments(normalizePath((a.parentPath as string) || ''));
      const target = `/me/drive/root:${folder}/${encodeURIComponent(name)}:`;

      // Default to `fail`: an agent creating "Q3 Budget.xlsx" where one already
      // exists must not silently replace a populated workbook with an empty one.
      // `replace` is opt-in through the documented `overwrite` parameter.
      const conflictBehavior = a.overwrite === true ? 'replace' : 'fail';

      const template = readFileSync(TEMPLATE_PATH);
      const workbook = await graphRequest<Record<string, unknown>>(
        'PUT',
        `${target}/content?@microsoft.graph.conflictBehavior=${conflictBehavior}`,
        undefined,
        { headers: { 'Content-Type': 'application/octet-stream' }, rawBody: template },
      );

      return {
        success: true,
        account: email,
        workbook: {
          id: workbook.id,
          name: workbook.name,
          size: workbook.size,
          webUrl: workbook.webUrl,
        },
      };
    },
  });
}
