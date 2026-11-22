/**
 * create_discount — create a price rule (discount) in Shopify.
 */

import type { AgentApp } from '@agentapps/sdk';
import { shopifyRequest } from '../lib/shopify-client.js';

export function registerCreateDiscountTool(app: AgentApp): void {
  app.tool('create_discount', {
    description:
      'Create a discount (price rule) in your Shopify store. Supports percentage and fixed amount discounts.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'The title of the price rule (e.g. "SUMMER20").',
        },
        valueType: {
          type: 'string',
          enum: ['percentage', 'fixed_amount'],
          description: 'The type of discount value.',
        },
        value: {
          type: 'string',
          description: 'The discount value (negative, e.g. "-20.0" for 20% off or $20 off).',
        },
        targetType: {
          type: 'string',
          enum: ['line_item', 'shipping_line'],
          description: 'What the price rule applies to (default: line_item).',
        },
        targetSelection: {
          type: 'string',
          enum: ['all', 'entitled'],
          description: 'Which items the discount applies to (default: all).',
        },
        allocationMethod: {
          type: 'string',
          enum: ['across', 'each'],
          description: 'How the discount is allocated (default: across).',
        },
        startsAt: {
          type: 'string',
          description: 'Start date in ISO 8601 format.',
        },
        endsAt: {
          type: 'string',
          description: 'End date in ISO 8601 format (optional).',
        },
      },
      required: ['title', 'valueType', 'value'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const priceRule: Record<string, unknown> = {
        title: args.title,
        value_type: args.valueType,
        value: args.value,
        target_type: (args.targetType as string) || 'line_item',
        target_selection: (args.targetSelection as string) || 'all',
        allocation_method: (args.allocationMethod as string) || 'across',
        customer_selection: 'all',
        starts_at: (args.startsAt as string) || new Date().toISOString(),
      };
      if (args.endsAt !== undefined) priceRule.ends_at = args.endsAt;

      return await shopifyRequest(
        'POST',
        '/price_rules.json',
        { body: { price_rule: priceRule } },
        ctx,
      );
    },
  });
}
