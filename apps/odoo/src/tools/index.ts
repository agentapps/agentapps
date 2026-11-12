import type { AgentApp } from '@agentapps/sdk';
import { registerCallMethodTool } from './call-method.js';
import { registerCountRecordsTool } from './count-records.js';
import { registerCreateLeaveTool } from './create-leave.js';
import { registerCreatePartnerTool } from './create-partner.js';
import { registerCreateProjectTaskTool } from './create-project-task.js';
import { registerCreateRecordTool } from './create-record.js';
import { registerCreateSaleOrderTool } from './create-sale-order.js';
import { registerCreateTimesheetTool } from './create-timesheet.js';
import { registerDeleteRecordTool } from './delete-record.js';
import { registerGetPartnerTool } from './get-partner.js';
import { registerGetRecordTool } from './get-record.js';
import { registerGetSaleOrderTool } from './get-sale-order.js';
import { registerListEmployeesTool } from './list-employees.js';
import { registerListInvoicesTool } from './list-invoices.js';
import { registerListLeavesTool } from './list-leaves.js';
import { registerListModelsTool } from './list-models.js';
import { registerListPartnersTool } from './list-partners.js';
import { registerListProductsTool } from './list-products.js';
import { registerListProjectsTool } from './list-projects.js';
import { registerListSaleOrdersTool } from './list-sale-orders.js';
import { registerListTasksTool } from './list-tasks.js';
import { registerListTimesheetsTool } from './list-timesheets.js';
import { registerSearchRecordsTool } from './search-records.js';
import { registerUpdatePartnerTool } from './update-partner.js';
import { registerUpdateRecordTool } from './update-record.js';

export function registerTools(app: AgentApp): void {
  // Generic model operations
  registerListModelsTool(app);
  registerSearchRecordsTool(app);
  registerGetRecordTool(app);
  registerCreateRecordTool(app);
  registerUpdateRecordTool(app);
  registerDeleteRecordTool(app);
  registerCountRecordsTool(app);
  registerCallMethodTool(app);

  // CRM & Sales
  registerListPartnersTool(app);
  registerGetPartnerTool(app);
  registerCreatePartnerTool(app);
  registerUpdatePartnerTool(app);
  registerListProductsTool(app);
  registerListSaleOrdersTool(app);
  registerGetSaleOrderTool(app);
  registerCreateSaleOrderTool(app);
  registerListInvoicesTool(app);

  // Projects
  registerListProjectsTool(app);
  registerListTasksTool(app);
  registerCreateProjectTaskTool(app);

  // HR
  registerListEmployeesTool(app);
  registerListLeavesTool(app);
  registerCreateLeaveTool(app);
  registerListTimesheetsTool(app);
  registerCreateTimesheetTool(app);
}
