import type { AgentApp } from '@agentapps/sdk';
import { registerApproveOvertimeTool } from './approve-overtime.js';
import { registerCreateLeaveTool } from './create-leave.js';
import { registerGetDocumentTool } from './get-document.js';
import { registerGetEmployeeTool } from './get-employee.js';
import { registerGetLeaveTool } from './get-leave.js';
import { registerListCompensationsTool } from './list-compensations.js';
import { registerListContractVersionsTool } from './list-contract-versions.js';
import { registerListDocumentsTool } from './list-documents.js';
import { registerListEmployeesTool } from './list-employees.js';
import { registerListLeaveTypesTool } from './list-leave-types.js';
import { registerListLeavesTool } from './list-leaves.js';
import { registerListLegalEntitiesTool } from './list-legal-entities.js';
import { registerListLocationsTool } from './list-locations.js';
import { registerListOvertimeRequestsTool } from './list-overtime-requests.js';
import { registerListShiftsTool } from './list-shifts.js';
import { registerListTeamMembershipsTool } from './list-team-memberships.js';
import { registerListTeamsTool } from './list-teams.js';
import { registerListWorkedTimesTool } from './list-worked-times.js';
import { registerRejectOvertimeTool } from './reject-overtime.js';

export function registerTools(app: AgentApp): void {
  // Employees
  registerListEmployeesTool(app);
  registerGetEmployeeTool(app);

  // Teams
  registerListTeamsTool(app);
  registerListTeamMembershipsTool(app);

  // Time Off
  registerListLeavesTool(app);
  registerGetLeaveTool(app);
  registerCreateLeaveTool(app);
  registerListLeaveTypesTool(app);

  // Attendance
  registerListShiftsTool(app);
  registerListWorkedTimesTool(app);
  registerListOvertimeRequestsTool(app);
  registerApproveOvertimeTool(app);
  registerRejectOvertimeTool(app);

  // Documents
  registerListDocumentsTool(app);
  registerGetDocumentTool(app);

  // Contracts & Payroll
  registerListContractVersionsTool(app);
  registerListCompensationsTool(app);

  // Company
  registerListLegalEntitiesTool(app);
  registerListLocationsTool(app);
}
