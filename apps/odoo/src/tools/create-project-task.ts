import type { AgentApp } from '@agentapps/sdk';
import { odooCreate, odooRead } from '../lib/odoo-client.js';

/**
 * create-project-task — create a new task in an Odoo project.
 */
export function registerCreateProjectTaskTool(app: AgentApp): void {
  app.tool('create-project-task', {
    description: 'Create a new task in an Odoo project.',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'Project ID' },
        name: { type: 'string', description: 'Task name' },
        userId: { type: 'number', description: 'Assigned user ID' },
        dateDeadline: { type: 'string', description: 'Deadline (ISO 8601)' },
        description: { type: 'string', description: 'Task description (HTML supported)' },
        values: {
          type: 'object',
          description: 'Additional field values',
          additionalProperties: true,
        },
      },
      required: ['projectId', 'name'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const values: Record<string, unknown> = {
        project_id: a.projectId,
        name: a.name,
        user_ids: a.userId ? [[6, 0, [a.userId]]] : undefined,
        date_deadline: a.dateDeadline,
        description: a.description,
        ...((a.values as Record<string, unknown>) ?? {}),
      };

      const taskId = await odooCreate(ctx, 'project.task', values);
      return odooRead(ctx, 'project.task', taskId, ['id', 'name', 'project_id', 'stage_id']);
    },
  });
}
