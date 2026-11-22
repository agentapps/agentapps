import type { AgentApp } from '@agentapps/sdk';
import { canvaRequest } from '../lib/index.js';
import { validateNonEmpty } from './_validate.js';

export function registerGetBrandTemplateDatasetTool(app: AgentApp): void {
  app.tool('get-brand-template-dataset', {
    description:
      'Get the autofill dataset (named fields like {title}, {body}, {image}) for a brand template. Returned shape mirrors Canva — useful before calling autofill-design. Params: brandTemplateId.',
    parameters: {
      type: 'object',
      properties: {
        brandTemplateId: { type: 'string', description: 'Canva brand template ID.' },
      },
      required: ['brandTemplateId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { brandTemplateId } = args as { brandTemplateId: string };
      validateNonEmpty(brandTemplateId, 'brandTemplateId');
      return canvaRequest(ctx, `/brand-templates/${encodeURIComponent(brandTemplateId)}/dataset`);
    },
  });
}
