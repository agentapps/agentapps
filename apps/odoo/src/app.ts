import { createApp } from '@agentapps/sdk';
import { authenticate } from './lib/odoo-client.js';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.odoo',
  version: '2.0.0',
  name: 'Odoo',
  description:
    'Odoo ERP integration — manage partners, products, sales orders, invoices, projects, tasks, employees, leaves and timesheets via the Odoo JSON-RPC API using an API key.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'productivity',
  keywords: [
    'odoo',
    'erp',
    'crm',
    'sales',
    'invoicing',
    'project',
    'hr',
    'employees',
    'timesheet',
    'inventory',
  ],
  runtime: { transport: 'stdio', command: 'node', args: ['dist/app.js'] },
  capabilities: { tools: true, health: true },
  auth: { type: 'api-key', installationSecrets: ['BASE_URL', 'DATABASE', 'API_KEY'] },
});

app.health(async (ctx) => {
  await authenticate(ctx);
  return { status: 'ready' as const, message: 'Odoo credentials are valid' };
});

registerTools(app);

export const factory = app.toFactory();
