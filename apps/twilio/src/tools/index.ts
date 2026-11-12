import type { AgentApp } from '@agentapps/sdk';
import { registerGetAccountTool } from './get-account.js';
import { registerGetCallTool } from './get-call.js';
import { registerGetMessageTool } from './get-message.js';
import { registerGetRecordingTool } from './get-recording.js';
import { registerListAvailableNumbersTool } from './list-available-numbers.js';
import { registerListCallsTool } from './list-calls.js';
import { registerListMessagesTool } from './list-messages.js';
import { registerListPhoneNumbersTool } from './list-phone-numbers.js';
import { registerListRecordingsTool } from './list-recordings.js';
import { registerLookupPhoneTool } from './lookup-phone.js';
import { registerMakeCallTool } from './make-call.js';
import { registerSendSmsTool } from './send-sms.js';
import { registerSendWhatsappTool } from './send-whatsapp.js';

export function registerTools(app: AgentApp): void {
  registerSendSmsTool(app);
  registerListMessagesTool(app);
  registerGetMessageTool(app);
  registerMakeCallTool(app);
  registerListCallsTool(app);
  registerGetCallTool(app);
  registerListPhoneNumbersTool(app);
  registerGetAccountTool(app);
  registerListRecordingsTool(app);
  registerGetRecordingTool(app);
  registerLookupPhoneTool(app);
  registerListAvailableNumbersTool(app);
  registerSendWhatsappTool(app);
}
