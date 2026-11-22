import type { AgentApp } from '@agentapps/sdk';
import { salesforceRequest } from '../lib/index.js';

/**
 * create-task — Create a new Salesforce task.
 * POST /services/data/v59.0/sobjects/Task
 */
export function registerCreateTaskTool(app: AgentApp): void {
  app.tool('create-task', {
    description:
      'Create a new Salesforce task. Returns the created task ID. Params: subject (required), status?, priority?, whoId?, whatId?.',
    parameters: {
      type: 'object',
      properties: {
        subject: { type: 'string', description: 'Task subject (required).' },
        status: {
          type: 'string',
          description:
            'Task status (e.g. Not Started, In Progress, Completed). Default: Not Started.',
        },
        priority: {
          type: 'string',
          description: 'Task priority (e.g. High, Normal, Low). Default: Normal.',
        },
        whoId: {
          type: 'string',
          description: 'Related Contact or Lead ID (Name relation).',
        },
        whatId: {
          type: 'string',
          description: 'Related Account, Opportunity, or other object ID (Related To).',
        },
      },
      required: ['subject'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { subject, status, priority, whoId, whatId } = args as {
        subject: string;
        status?: string;
        priority?: string;
        whoId?: string;
        whatId?: string;
      };

      const payload: Record<string, string> = { Subject: subject };
      if (status) payload.Status = status;
      if (priority) payload.Priority = priority;
      if (whoId) payload.WhoId = whoId;
      if (whatId) payload.WhatId = whatId;

      const data = (await salesforceRequest('POST', 'sobjects/Task', payload, ctx)) as any;

      return {
        id: data.id,
        success: data.success ?? true,
      };
    },
  });
}
