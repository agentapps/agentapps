import type { AgentApp } from '@agentapps/sdk';
import { buildGraphError, createGraphClient, pollOperation, requireId } from '../lib/index.js';

/** Extracts the copied page id from an operation's resourceLocation URL. */
function pageIdFromResourceLocation(resourceLocation?: string): string | null {
  if (!resourceLocation) return null;
  const match = resourceLocation.match(/\/pages\/([^/?]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** copy-page-to-section — POST /me/onenote/pages/{id}/copyToSection. */
export function registerCopyPageToSectionTool(app: AgentApp): void {
  app.tool('copy-page-to-section', {
    description:
      'Copy a OneNote page into another section, including across notebooks. Waits for the copy to finish and returns the new page id.',
    parameters: {
      type: 'object',
      properties: {
        pageId: {
          type: 'string',
          description: 'Id of the page to copy, from list-pages or search-pages.',
        },
        destinationSectionId: {
          type: 'string',
          description: 'Id of the section to copy the page into, from list-sections.',
        },
      },
      required: ['pageId', 'destinationSectionId'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = (args ?? {}) as Record<string, unknown>;
      // No `sectionId` alias here on purpose: with a source page and a target
      // section in play, a bare `sectionId` is genuinely ambiguous, and
      // guessing which one a caller meant is exactly the failure spec §3.4
      // exists to prevent.
      const page = requireId(a, ['pageId'], 'the page to copy, from list-pages');
      const destination = requireId(
        a,
        ['destinationSectionId'],
        'the section to copy the page into, from list-sections',
      );

      const response = await graphRequest<Response>(
        'POST',
        `/me/onenote/pages/${page.encoded}/copyToSection`,
        { id: destination.id },
        { responseType: 'raw' },
      );

      // 'raw' returns before the client's !response.ok check, so a 4xx arrives
      // here as an ordinary Response. Checking it is this tool's job.
      if (!response.ok) throw await buildGraphError(response);

      // Only the raw response carries Location; no decoded body has it.
      const operationUrl = response.headers.get('location');
      if (!operationUrl) {
        // Graph is documented to return one. A missing header means the copy
        // was accepted but cannot be tracked — say that, rather than
        // reporting a completion that was never observed.
        return {
          success: true,
          account: email,
          pageId: page.id,
          destinationSectionId: destination.id,
          status: 'Accepted',
          newPageId: null,
          note: 'OneNote accepted the copy but returned no operation URL, so its completion was not confirmed.',
        };
      }

      // The operation URL is a Graph resource and needs the bearer token —
      // unlike OneDrive's copy monitor, which is pre-authenticated and may be
      // hosted elsewhere. Do not pass skipAuth here.
      //
      // Because we do send credentials, the URL's host is trusted implicitly.
      // It comes straight from Graph's own Location header, so that trust is
      // deliberate — but make the assumption explicit rather than silent.
      if (!operationUrl.startsWith('https://graph.microsoft.com/')) {
        throw new Error(
          `OneNote returned an unexpected operation URL host; refusing to send credentials to it: ${operationUrl}`,
        );
      }

      const operation = await pollOperation(graphRequest, operationUrl);

      return {
        success: true,
        account: email,
        pageId: page.id,
        destinationSectionId: destination.id,
        status: operation.status ?? 'Completed',
        newPageId: pageIdFromResourceLocation(operation.resourceLocation),
      };
    },
  });
}
