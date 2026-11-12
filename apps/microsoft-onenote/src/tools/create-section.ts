import type { AgentApp } from '@agentapps/sdk';
import { assertDisplayName, createGraphClient, formatSection, requireId } from '../lib/index.js';

/** create-section — POST /me/onenote/notebooks/{id}/sections. */
export function registerCreateSectionTool(app: AgentApp): void {
  app.tool('create-section', {
    description:
      'Create a section inside a OneNote notebook. Names may not contain ? * \\ / : < > | \' " # and are limited to 50 characters.',
    parameters: {
      type: 'object',
      properties: {
        parentNotebookId: {
          type: 'string',
          description:
            'Id of the notebook to create the section in, from list-notebooks. Also accepted as notebookId.',
        },
        notebookId: {
          type: 'string',
          description: 'Alias for parentNotebookId.',
        },
        displayName: {
          type: 'string',
          description: 'Section name. Max 50 characters; ? * \\ / : < > | \' " # are not allowed.',
        },
      },
      required: ['parentNotebookId', 'displayName'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = (args ?? {}) as Record<string, unknown>;
      const notebook = requireId(
        a,
        ['parentNotebookId', 'notebookId'],
        'the notebook to create the section in, from list-notebooks',
      );
      const displayName = assertDisplayName(a.displayName, 'section name');

      const created = await graphRequest<Record<string, any>>(
        'POST',
        `/me/onenote/notebooks/${notebook.encoded}/sections`,
        { displayName },
      );

      return {
        success: true,
        account: email,
        notebookId: notebook.id,
        section: formatSection(created),
      };
    },
  });
}
