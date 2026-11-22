import type { AgentApp } from '@agentapps/sdk';
import { type Booking, formatBooking } from '../lib/formatters.js';
import { rahRequest } from '../lib/rah-client.js';

interface CreateBookingResponse {
  success: boolean;
  booking: Booking;
  message?: string;
}

/**
 * create-booking — POST /bookings.
 *
 * Requires RENTAHUMAN_API_KEY. Creates a booking with task details, start time,
 * and estimated duration.
 */
export function registerCreateBookingTool(app: AgentApp): void {
  app.tool('create-booking', {
    description:
      'Book a human for a physical-world task. Requires a RENTAHUMAN_API_KEY. Returns booking details and payment instructions.',
    parameters: {
      type: 'object',
      properties: {
        humanId: {
          type: 'string',
          description: 'The ID of the human to book',
        },
        taskTitle: {
          type: 'string',
          description: 'Brief title of the task (3-200 characters)',
        },
        taskDescription: {
          type: 'string',
          description: 'Detailed description of what the human needs to do',
        },
        taskCategory: {
          type: 'string',
          description:
            "Task category (e.g., 'errands', 'meetings', 'research', 'photography', 'delivery')",
        },
        startTime: {
          type: 'string',
          description: "When the task should start (ISO 8601 format, e.g., '2025-06-15T10:00:00Z')",
        },
        estimatedHours: {
          type: 'number',
          description: 'Estimated hours needed (min: 0.5, max: 168)',
        },
        agentName: {
          type: 'string',
          description: "Your agent's display name (optional)",
        },
      },
      required: ['humanId', 'taskTitle', 'taskDescription', 'startTime', 'estimatedHours'],
    },
    annotations: {
      readOnlyHint: false,
      // Destructive: it commits a real person to paid work and the app has no way to cancel
      // the booking.
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const {
        humanId,
        taskTitle,
        taskDescription,
        taskCategory,
        startTime,
        estimatedHours,
        agentName,
      } = args as {
        humanId: string;
        taskTitle: string;
        taskDescription: string;
        taskCategory?: string;
        startTime: string;
        estimatedHours: number;
        agentName?: string;
      };

      // Validate required fields
      if (!humanId) throw new Error('humanId is required');
      if (!taskTitle || taskTitle.length < 3)
        throw new Error('taskTitle must be at least 3 characters');
      if (!taskDescription) throw new Error('taskDescription is required');
      if (!startTime) throw new Error('startTime is required (ISO 8601 format)');
      if (!estimatedHours || estimatedHours < 0.5)
        throw new Error('estimatedHours must be at least 0.5');

      const agentId = `agentapps-agent-${Date.now()}`;

      const data = await rahRequest<CreateBookingResponse>(ctx, '/bookings', {
        method: 'POST',
        body: {
          humanId,
          agentId,
          agentName: agentName || 'Agent',
          agentType: 'other',
          taskTitle,
          taskDescription,
          taskCategory,
          startTime,
          estimatedHours: Number(estimatedHours),
        },
      });

      const lines: string[] = ['**Booking created successfully!**\n'];
      lines.push(formatBooking(data.booking));

      if (data.message) {
        lines.push(`\n**Payment Instructions:**\n${data.message}`);
      }

      return lines.join('\n');
    },
  });
}
