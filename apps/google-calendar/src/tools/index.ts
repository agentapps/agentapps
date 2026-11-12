import type { AgentApp } from '@agentapps/sdk';
import { registerAuthenticateTool } from './authenticate.js';
import { registerCreateCalendarTool } from './create-calendar.js';
import { registerCreateEventTool } from './create-event.js';
import { registerDeleteEventTool } from './delete-event.js';
import { registerGetEventTool } from './get-event.js';
import { registerGetFreebusyTool } from './get-freebusy.js';
import { registerListCalendarsTool } from './list-calendars.js';
import { registerListEventsTool } from './list-events.js';
import { registerMoveEventTool } from './move-event.js';
import { registerOpenCalendarTool } from './open-calendar.js';
import { registerQuickAddEventTool } from './quick-add-event.js';
import { registerUpdateEventTool } from './update-event.js';

export function registerTools(app: AgentApp): void {
  registerListEventsTool(app);
  registerGetEventTool(app);
  registerCreateEventTool(app);
  registerUpdateEventTool(app);
  registerDeleteEventTool(app);
  registerListCalendarsTool(app);
  registerCreateCalendarTool(app);
  registerGetFreebusyTool(app);
  registerQuickAddEventTool(app);
  registerMoveEventTool(app);
  registerAuthenticateTool(app);
  registerOpenCalendarTool(app);
}
