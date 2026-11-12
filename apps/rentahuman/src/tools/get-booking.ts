import type { AgentApp } from '@agentapps/sdk';
import { type Booking, formatBooking } from '../lib/formatters.js';
import { rahRequest } from '../lib/rah-client.js';

interface GetBookingResponse {
  success: boolean;
  booking: Booking;
}

/**
 * get-booking — GET /bookings/{bookingId}.
 *
 * Requires RENTAHUMAN_API_KEY.
 */
export function registerGetBookingTool(app: AgentApp): void {
  app.tool('get-booking', {
    description:
      'Get the details and current status of a specific booking. Requires a RENTAHUMAN_API_KEY.',
    parameters: {
      type: 'object',
      properties: {
        bookingId: {
          type: 'string',
          description: 'The booking ID to retrieve',
        },
      },
      required: ['bookingId'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { bookingId } = args as { bookingId: string };
      if (!bookingId) throw new Error('bookingId is required');

      const data = await rahRequest<GetBookingResponse>(
        ctx,
        `/bookings/${encodeURIComponent(bookingId)}`,
      );

      return formatBooking(data.booking);
    },
  });
}
