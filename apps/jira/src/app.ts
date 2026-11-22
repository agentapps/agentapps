/**
 * Jira Agent App — search issues, create/update tickets, manage transitions,
 * and track sprints via the Jira Cloud REST API.
 */

import { createApp } from '@agentapps/sdk';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.jira',
  version: '3.0.0',
  name: 'Jira',
  description:
    'Jira project management — search issues, create/update tickets, manage transitions, and track sprints.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'productivity',
  keywords: ['jira', 'atlassian', 'issues', 'tickets', 'project-management'],
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'api-key',
    installationSecrets: ['JIRA_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN'],
  },
});

app.health(async (ctx) => {
  ctx.log('debug', 'Running Jira health check');

  const installationSecrets = await ctx.secrets.getInstallation();
  if (
    !installationSecrets?.JIRA_URL ||
    !installationSecrets?.JIRA_EMAIL ||
    !installationSecrets?.JIRA_API_TOKEN
  ) {
    const missing: string[] = [];
    if (!installationSecrets?.JIRA_URL) missing.push('JIRA_URL');
    if (!installationSecrets?.JIRA_EMAIL) missing.push('JIRA_EMAIL');
    if (!installationSecrets?.JIRA_API_TOKEN) missing.push('JIRA_API_TOKEN');
    return {
      status: 'not_ready' as const,
      message: `Missing Jira credentials: ${missing.join(', ')}`,
      issues: [
        {
          code: 'MISSING_SECRET',
          message: `Installation secrets required: ${missing.join(', ')}. Configure your Jira Cloud URL, email, and API token.`,
          severity: 'error' as const,
        },
      ],
    };
  }

  const baseUrl = installationSecrets.JIRA_URL.replace(/\/+$/, '');
  const credentials = btoa(
    `${installationSecrets.JIRA_EMAIL}:${installationSecrets.JIRA_API_TOKEN}`,
  );

  const res = await fetch(`${baseUrl}/rest/api/3/myself`, {
    headers: {
      Authorization: `Basic ${credentials}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = body?.errorMessages?.[0] || res.statusText;
    throw new Error(`Jira API error: ${message}`);
  }

  const result = (await res.json()) as Record<string, unknown>;

  return {
    status: 'ready' as const,
    message: `Jira connected as ${result.displayName}`,
  };
});

registerTools(app);

export const factory = app.toFactory();
export default factory;
