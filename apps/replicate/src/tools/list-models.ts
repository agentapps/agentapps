/**
 * list_models — discover models on Replicate and get their input schemas.
 *
 * Three modes:
 *   (1) collection: list models in a category (e.g. "video-generation")
 *   (2) query: search models by name or description
 *   (3) model: get the full input/output schema for a specific "owner/name" model
 */

import type { AgentApp } from '@agentapps/sdk';
import { assertOk, type ReplicateModelSummary, replicateRequest } from '../types.js';

export function registerListModelsTool(app: AgentApp): void {
  app.tool('list_models', {
    description:
      'Discover models available on Replicate and their exact input parameters. ' +
      'Three modes: ' +
      '(1) collection: list models in a category (e.g. "video-generation", "image-to-video", "text-to-image", "image-to-image", "audio-generation"). ' +
      '(2) query: search models by name or description. ' +
      '(3) model: get the full input/output schema for a specific model in "owner/name" format (e.g. "google/veo-3.1") — use this before run to know exactly what parameters to pass.',
    parameters: {
      type: 'object',
      properties: {
        collection: {
          type: 'string',
          description:
            'Collection slug to browse. Examples: "video-generation", "image-to-video", "text-to-image", "image-to-image", "audio-generation".',
        },
        query: {
          type: 'string',
          description: 'Free-text search query to find models by name or description.',
        },
        model: {
          type: 'string',
          description:
            'Get the full schema for a specific model in "owner/name" format (e.g. "google/veo-3.1", "runwayml/gen-4.5"). Returns all input parameters with types, defaults and descriptions.',
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
      const apiToken = await ctx.systemSecret('API_TOKEN');
      if (!apiToken) {
        throw new Error('Missing API_TOKEN system secret — configure it to use Replicate.');
      }

      // Mode 1: full schema for a specific model
      if (args.model) {
        const modelId = args.model as string;
        const [owner, name] = modelId.split('/');
        if (!owner || !name) throw new Error('model must be in "owner/name" format');

        ctx.log('info', `Getting schema for model ${modelId}`);

        const response = await replicateRequest(`/models/${owner}/${name}`, apiToken);
        await assertOk(response);
        const data = await response.json();

        const schema = data.latest_version?.openapi_schema?.components?.schemas?.Input || null;

        return {
          id: `${data.owner}/${data.name}`,
          description: data.description,
          url: data.url,
          run_count: data.run_count,
          latest_version: data.latest_version?.id || null,
          input_schema: schema,
        };
      }

      // Mode 2: browse a collection
      if (args.collection) {
        const collection = args.collection as string;
        ctx.log('info', `Browsing collection: ${collection}`);

        const response = await replicateRequest(`/collections/${collection}`, apiToken);
        await assertOk(response);
        const data = await response.json();

        return {
          collection,
          description: data.description,
          models: (data.models || []).map(
            (m: Record<string, unknown>): ReplicateModelSummary => ({
              id: `${m.owner}/${m.name}`,
              description: m.description as string,
              run_count: m.run_count as number,
              url: m.url as string,
            }),
          ),
        };
      }

      // Mode 3: search by query
      if (args.query) {
        const query = args.query as string;
        ctx.log('info', `Searching models: "${query}"`);

        const params = new URLSearchParams({ q: query });
        const response = await replicateRequest(`/models?${params}`, apiToken);
        await assertOk(response);
        const data = await response.json();

        return (data.results || []).map(
          (m: Record<string, unknown>): ReplicateModelSummary => ({
            id: `${m.owner}/${m.name}`,
            description: m.description as string,
            run_count: m.run_count as number,
            url: m.url as string,
          }),
        );
      }

      throw new Error('Provide at least one of: collection, query, or model');
    },
  });
}
