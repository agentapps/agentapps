import type { AgentApp } from '@agentapps/sdk';
import {
  assertXlsx,
  createGraphClient,
  formatWorksheet,
  terminalRef,
  workbookItemRef,
  workbookRef,
} from '../lib/index.js';

/** Must include `file` and `name` — this tool branches on both. */
const WORKBOOK_SELECT = 'id,name,size,webUrl,lastModifiedDateTime,file';

/** get-workbook — drive-item metadata plus the workbook's worksheets. */
export function registerGetWorkbookTool(app: AgentApp): void {
  app.tool('get-workbook', {
    description:
      "Get an Excel workbook: its file metadata and the list of worksheets it contains. Confirms the item is a usable .xlsx — this is the only tool that validates the extension when addressing by itemId, because it is the only one that fetches the item metadata; the others surface Graph's own error for a wrong item type.",
    parameters: {
      type: 'object',
      properties: {
        itemId: {
          type: 'string',
          description: 'Workbook drive item ID. Takes precedence over path.',
        },
        path: {
          type: 'string',
          description:
            'Workbook path relative to the drive root, e.g. "Finance/Budget.xlsx". Pass literal names, not pre-encoded ones.',
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
      // The path form's trailing `:` is only correct when a child segment
      // follows it (`:/workbook`); here the ref is the final resource before
      // `?$select=`, so it must be stripped.
      const meta = await graphRequest<Record<string, any>>(
        'GET',
        `${terminalRef(workbookItemRef(a))}?$select=${WORKBOOK_SELECT}`,
      );

      // Addressing by itemId cannot be validated before the request; do it here.
      if (!meta.file) {
        throw new Error(`"${meta.name}" is a folder, not a workbook.`);
      }
      assertXlsx(meta.name ?? '');

      const sheets = await graphRequest<{ value?: any[] }>('GET', `${workbookRef(a)}/worksheets`);
      const worksheets = (sheets.value || []).map((ws) => formatWorksheet(ws));

      return {
        account: email,
        id: meta.id,
        name: meta.name,
        size: meta.size,
        webUrl: meta.webUrl,
        lastModifiedDateTime: meta.lastModifiedDateTime,
        worksheetCount: worksheets.length,
        worksheets,
      };
    },
  });
}
