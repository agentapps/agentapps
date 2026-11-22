import type { AgentApp } from '@agentapps/sdk';
import { salesforceRequest } from '../lib/index.js';

/**
 * describe-object — Describe a Salesforce object's metadata (fields, relationships, etc.).
 * GET /services/data/v59.0/sobjects/{objectType}/describe
 */
export function registerDescribeObjectTool(app: AgentApp): void {
  app.tool('describe-object', {
    description:
      "Describe a Salesforce object's metadata. Returns fields, relationships, record type info, and other schema details. Params: objectType (required).",
    parameters: {
      type: 'object',
      properties: {
        objectType: {
          type: 'string',
          description: 'Salesforce object type (e.g. Account, Contact, Opportunity, Lead, Case).',
        },
      },
      required: ['objectType'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { objectType } = args as { objectType: string };

      const data = (await salesforceRequest(
        'GET',
        `sobjects/${encodeURIComponent(objectType)}/describe`,
        undefined,
        ctx,
      )) as any;

      return {
        name: data.name ?? objectType,
        label: data.label ?? null,
        labelPlural: data.labelPlural ?? null,
        keyPrefix: data.keyPrefix ?? null,
        custom: data.custom ?? false,
        createable: data.createable ?? false,
        updateable: data.updateable ?? false,
        deletable: data.deletable ?? false,
        queryable: data.queryable ?? false,
        fields: (data.fields ?? []).map((f: any) => ({
          name: f.name,
          label: f.label,
          type: f.type,
          length: f.length ?? null,
          required: !f.nillable && !f.defaultedOnCreate,
          createable: f.createable ?? false,
          updateable: f.updateable ?? false,
          externalId: f.externalId ?? false,
        })),
        recordTypeInfos: (data.recordTypeInfos ?? []).map((rt: any) => ({
          name: rt.name,
          recordTypeId: rt.recordTypeId,
          active: rt.active ?? false,
          defaultRecordTypeMapping: rt.defaultRecordTypeMapping ?? false,
        })),
        childRelationships: (data.childRelationships ?? []).length,
      };
    },
  });
}
