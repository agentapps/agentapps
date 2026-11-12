import type { AgentApp } from '@agentapps/sdk';
import { registerCreateBookingTool } from './create-booking.js';
import { registerGetBookingTool } from './get-booking.js';
import { registerGetHumanTool } from './get-human.js';
import { registerListBookingsTool } from './list-bookings.js';
import { registerSearchHumansTool } from './search-humans.js';

export function registerTools(app: AgentApp): void {
  registerSearchHumansTool(app);
  registerGetHumanTool(app);
  registerCreateBookingTool(app);
  registerListBookingsTool(app);
  registerGetBookingTool(app);
}
