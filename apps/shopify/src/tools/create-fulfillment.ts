/**
 * create_fulfillment — create a fulfillment for a Shopify order.
 */

import type { AgentApp } from '@agentapps/sdk';
import { shopifyRequest } from '../lib/shopify-client.js';

export function registerCreateFulfillmentTool(app: AgentApp): void {
  app.tool('create_fulfillment', {
    description:
      'Create a fulfillment for an order in your Shopify store. Marks items as shipped with optional tracking info.',
    parameters: {
      type: 'object',
      properties: {
        orderId: {
          type: 'string',
          description: 'The Shopify order ID to fulfill.',
        },
        trackingNumber: {
          type: 'string',
          description: 'The tracking number for the shipment.',
        },
        trackingCompany: {
          type: 'string',
          description: 'The name of the shipping company (e.g. UPS, FedEx, USPS).',
        },
        trackingUrl: {
          type: 'string',
          description: 'The URL for tracking the shipment.',
        },
        notifyCustomer: {
          type: 'boolean',
          description: 'Whether to notify the customer of the fulfillment (default: true).',
        },
      },
      required: ['orderId'],
    },
    annotations: { readOnlyHint: false, idempotentHint: false },
    handler: async (args, ctx) => {
      const orderId = args.orderId as string;
      const fulfillment: Record<string, unknown> = {};
      if (args.trackingNumber !== undefined) fulfillment.tracking_number = args.trackingNumber;
      if (args.trackingCompany !== undefined) fulfillment.tracking_company = args.trackingCompany;
      if (args.trackingUrl !== undefined) fulfillment.tracking_url = args.trackingUrl;
      if (args.notifyCustomer !== undefined) {
        fulfillment.notify_customer = args.notifyCustomer;
      }

      return await shopifyRequest(
        'POST',
        `/orders/${orderId}/fulfillments.json`,
        { body: { fulfillment } },
        ctx,
      );
    },
  });
}
