import type { AgentApp } from '@agentapps/sdk';
import {
  createGraphClient,
  formatSectionGroup,
  optionalId,
  SECTION_GROUP_EXPAND,
} from '../lib/index.js';

/** list-section-groups — GET /me/onenote[/notebooks/{id}]/sectionGroups. */
export function registerListSectionGroupsTool(app: AgentApp): void {
  app.tool('list-section-groups', {
    description:
      'List OneNote section groups — the folders that hold sections inside a notebook. Scoped to one notebook when notebookId is given.',
    parameters: {
      type: 'object',
      properties: {
        notebookId: {
          type: 'string',
          description:
            'Optional notebook id from list-notebooks. Omit to list section groups across all notebooks.',
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
      const notebook = optionalId(a, ['notebookId']);
      const base = notebook
        ? `/me/onenote/notebooks/${notebook.encoded}/sectionGroups`
        : '/me/onenote/sectionGroups';

      const response = await graphRequest<{ value?: any[] }>(
        'GET',
        `${base}?$expand=${SECTION_GROUP_EXPAND}&$orderby=displayName`,
      );
      const sectionGroups = (response.value || []).map((g) => formatSectionGroup(g));

      return {
        account: email,
        notebookId: notebook?.id ?? null,
        count: sectionGroups.length,
        sectionGroups,
      };
    },
  });
}
