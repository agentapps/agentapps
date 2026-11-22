import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient, formatSection, optionalId, SECTION_EXPAND } from '../lib/index.js';

/** list-sections — GET /me/onenote[/notebooks/{id}]/sections. */
export function registerListSectionsTool(app: AgentApp): void {
  app.tool('list-sections', {
    description:
      "List OneNote sections. Scoped to one notebook when notebookId is given, this returns only that notebook's top-level sections — sections nested inside a section group are not included. Omit notebookId to list every section the account can reach, section groups included.",
    parameters: {
      type: 'object',
      properties: {
        notebookId: {
          type: 'string',
          description:
            "Optional notebook id from list-notebooks. Returns only that notebook's top-level sections — sections inside a section group are not included. Omit to list sections across all notebooks, including ones inside section groups.",
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = (args ?? {}) as Record<string, unknown>;
      const notebook = optionalId(a, ['notebookId']);
      // Read-only, so a whole-account default is safe. Spec §3.4's
      // no-fallback rule binds destructive tools.
      const base = notebook
        ? `/me/onenote/notebooks/${notebook.encoded}/sections`
        : '/me/onenote/sections';

      const response = await graphRequest<{ value?: any[] }>(
        'GET',
        `${base}?$expand=${SECTION_EXPAND}&$orderby=displayName`,
      );
      const sections = (response.value || []).map((s) => formatSection(s));

      return { account: email, notebookId: notebook?.id ?? null, count: sections.length, sections };
    },
  });
}
