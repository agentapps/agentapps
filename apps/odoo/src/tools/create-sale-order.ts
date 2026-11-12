import type { AgentApp } from '@agentapps/sdk';
import { odooCreate, odooRead } from '../lib/odoo-client.js';

/**
 * create-sale-order — create a new Odoo sales order with optional order lines.
 */
export function registerCreateSaleOrderTool(app: AgentApp): void {
  app.tool('create-sale-order', {
    description: 'Create a new Odoo sales order with optional order lines.',
    parameters: {
      type: 'object',
      properties: {
        partnerId: { type: 'number', description: 'Customer partner ID' },
        orderLines: {
          type: 'array',
          description: 'Order lines as objects with productId, quantity, priceUnit',
          items: {
            type: 'object',
            properties: {
              productId: { type: 'number' },
              quantity: { type: 'number' },
              priceUnit: { type: 'number' },
            },
            required: ['productId', 'quantity'],
          },
        },
        dateOrder: { type: 'string', description: 'Order date (ISO 8601)' },
        note: { type: 'string', description: 'Internal note' },
      },
      required: ['partnerId'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const orderLines = a.orderLines as
        | Array<{ productId: number; quantity: number; priceUnit?: number }>
        | undefined;

      const lines: [number, number, Record<string, unknown>][] =
        orderLines?.map((line) => [
          0,
          0,
          {
            product_id: line.productId,
            product_uom_qty: line.quantity,
            price_unit: line.priceUnit ?? 0,
          },
        ]) ?? [];

      const orderId = await odooCreate(ctx, 'sale.order', {
        partner_id: a.partnerId,
        date_order: a.dateOrder,
        order_line: lines,
        note: a.note,
      });

      return odooRead(ctx, 'sale.order', orderId, [
        'id',
        'name',
        'partner_id',
        'amount_total',
        'state',
      ]);
    },
  });
}
