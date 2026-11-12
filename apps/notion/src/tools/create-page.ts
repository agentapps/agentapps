import type { AgentApp } from '@agentapps/sdk';
import { getNotionClient } from '../lib/notion-client.js';
import { buildPropertiesFromSimple } from './_build-property-value.js';
import { resolveDataSourceId } from './_data-source-resolver.js';
import { PAGE_COMPACT_FIELDS } from './_fields.js';
import { extractPageShape, resolveNotionId } from './_notion-helpers.js';
import { withSchemaCache } from './_schema-cache.js';
import { resolveFields, wrapNotionWrite } from './utils.js';

export function registerCreatePageTool(app: AgentApp): void {
  app.tool('create-page', {
    description:
      "Create a new page under a page (parentType='page') or database (parentType='database'). For database parents, the row is added to the first data source unless `dataSourceId` is provided. Returns curated { id, url, title, icon, cover, parentType, parentId, createdTime }. Not retryable (no idempotency key).",
    parameters: {
      type: 'object',
      properties: {
        parentId: {
          type: 'string',
          description: 'Parent page or database UUID.',
        },
        parentType: {
          type: 'string',
          description: "'page' or 'database'.",
          enum: ['page', 'database'],
        },
        dataSourceId: {
          type: 'string',
          description:
            'For multi-source DBs, the specific data source UUID to insert under. Ignored when parentType=page.',
        },
        title: {
          type: 'string',
          description:
            'Page title. For database pages ignored when `properties` is provided; defaults to "Untitled".',
        },
        properties: {
          type: 'object',
          description:
            'Full Notion properties object for database pages (used as-is). Overrides `title` for the title column.',
        },
        propertiesSimple: {
          type: 'object',
          description:
            "Agent-friendly flat map: `{ Status: 'Done', Tags: ['urgent'] }`. Schema is resolved automatically. parentType=database only. If both `properties` and `propertiesSimple` are passed, raw `properties` wins (with warning).",
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Override default whitelist on the returned page.',
        },
        includeRaw: {
          type: 'boolean',
          description: 'Return raw Notion page object. Default false.',
        },
      },
      required: ['parentId', 'parentType'],
    },
    annotations: { readOnlyHint: false, version: '2.0.0', stability: 'stable' },
    handler: async (args: any, ctx) => {
      const client = await getNotionClient(ctx);
      const {
        parentId: rawParentId,
        parentType,
        dataSourceId: rawDataSourceId,
        title,
        properties: customProperties,
        propertiesSimple,
        fields,
        includeRaw,
      } = args as {
        parentId: string;
        parentType: 'page' | 'database';
        dataSourceId?: string;
        title?: string;
        properties?: Record<string, any>;
        propertiesSimple?: Record<string, unknown>;
        fields?: string[];
        includeRaw?: boolean;
      };
      const parentId = resolveNotionId(rawParentId, 'parentId');
      const dataSourceId = rawDataSourceId
        ? resolveNotionId(rawDataSourceId, 'dataSourceId')
        : undefined;

      if (propertiesSimple && parentType !== 'database') {
        throw new Error(
          'propertiesSimple is only valid when parentType=database (it needs a schema to resolve simple values).',
        );
      }

      let parent: Record<string, string>;
      if (parentType === 'database') {
        const resolvedDataSourceId = dataSourceId ?? (await resolveDataSourceId(client, parentId));
        parent = { data_source_id: resolvedDataSourceId };
      } else {
        parent = { page_id: parentId };
      }

      let properties: any;
      if (parentType === 'database') {
        if (customProperties && Object.keys(customProperties).length > 0) {
          if (propertiesSimple) {
            // Both supplied: raw wins, simple ignored. Surface a soft warning
            // via the response so the agent can self-correct on the next call.
            // eslint-disable-next-line no-console
            console.warn(
              '[app.notion] create-page: both `properties` and `propertiesSimple` supplied — using raw `properties`.',
            );
          }
          properties = customProperties;
        } else if (propertiesSimple) {
          properties = await withSchemaCache(client, parentId, async (schema) =>
            buildPropertiesFromSimple(schema, propertiesSimple),
          );
          // Title may not be in propertiesSimple; default if absent.
          const titleKey = Object.keys(properties).find(
            (k) => 'title' in (properties[k] as Record<string, unknown>),
          );
          if (!titleKey) {
            properties.Name = { title: [{ text: { content: title || 'Untitled' } }] };
          }
        } else {
          properties = { Name: { title: [{ text: { content: title || 'Untitled' } }] } };
        }
      } else {
        properties = { title: [{ text: { content: title || 'Untitled' } }] };
      }

      const raw: any = await wrapNotionWrite(() =>
        client.pages.create({ parent, properties } as any),
      );
      const shape = extractPageShape(raw);
      return resolveFields(shape as any, raw, {
        includeRaw,
        fields,
        defaultFields: PAGE_COMPACT_FIELDS,
      });
    },
  });
}
