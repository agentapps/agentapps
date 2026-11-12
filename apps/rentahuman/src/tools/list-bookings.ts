import type { AgentApp } from '@agentapps/sdk';
import { type Booking, formatBooking } from '../lib/formatters.js';
import { rahRequest } from '../lib/rah-client.js';

interface ListBookingsResponse {
  success: boolean;
  bookings: Booking[];
}

/**
 * list-bookings — GET /bookings.
 *
 * Requires RENTAHUMAN_API_KEY. Optionally filter by status.
 */
export function registerListBookingsTool(app: AgentApp): void {
  app.tool('list-bookings', {
    description:
      'List bookings for the current agent. Optionally filter by status. Requires a RENTAHUMAN_API_KEY.',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'],
          description: 'Filter by booking status',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 20)',
          default: 20,
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const status = a.status as string | undefined;
      const limit = Math.min(Number(a.limit) || 20, 100);

      const data = await rahRequest<ListBookingsResponse>(ctx, '/bookings', {
        query: { status, limit },
      });

      if (!data.bookings || data.bookings.length === 0) {
        return status ? `No bookings found with status "${status}".` : 'No bookings found.';
      }

      const lines: string[] = [`**${data.bookings.length} booking(s):**\n`];

      for (const booking of data.bookings) {
        lines.push(formatBooking(booking));
        lines.push('---');
      }

      return lines.join('\n');
    },
  });
}
