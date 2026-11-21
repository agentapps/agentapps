/**
 * Factorial Agent App — entry point.
 *
 * Factorial HR integration using Agent Apps SDK with stdio transport.
 * Authenticates via OAuth2 — users connect their Factorial account.
 *
 * Tools:
 * - Health:     -health-check
 * - Employees:  list-employees, get-employee
 * - Teams:      list-teams, list-team-memberships
 * - Time Off:   list-leaves, get-leave, create-leave, list-leave-types
 * - Attendance: list-shifts, list-worked-times, list-overtime-requests, approve-overtime, reject-overtime
 * - Documents:  list-documents, get-document
 * - Contracts:  list-contract-versions, list-compensations
 * - Company:    list-legal-entities, list-locations
 */

import { createApp } from '@agentapps/sdk';
import { factorialRequest } from './lib/index.js';
import { registerTools } from './tools/index.js';

// =============================================================================
// APP
// =============================================================================

const app = createApp({
  id: 'app.factorial',
  version: '2.0.0',
  name: 'Factorial',
  description:
    'Factorial HR — manage employees, time off, attendance, payroll, documents, contracts and teams via Factorial API with OAuth2',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'productivity',
  keywords: [
    'factorial',
    'hr',
    'employees',
    'payroll',
    'time-off',
    'attendance',
    'contracts',
    'documents',
  ],
  runtime: { transport: 'stdio', command: 'node', args: ['dist/app.js'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'oauth2',
    provider: 'factorial',
    authorizeUrl: 'https://api.factorialhr.com/oauth/authorize',
    tokenUrl: 'https://api.factorialhr.com/oauth/token',
    scopes: [
      'employees',
      'time_off',
      'time_tracking',
      'documents',
      'contracts',
      'company_locations',
      'company_legal_entities',
    ],
    pkce: false,
    systemSecrets: ['CLIENT_ID', 'CLIENT_SECRET'],
    installationSecrets: ['ACCESS_TOKEN', 'REFRESH_TOKEN', 'TOKEN_TYPE', 'USER_ID', 'USER_EMAIL'],
  },
});

// =============================================================================
// HEALTH CHECK
// =============================================================================

app.health(async (ctx) => {
  try {
    const installationSecrets = await ctx.secrets.getInstallation();
    const token = installationSecrets?.ACCESS_TOKEN as string | undefined;

    if (!token) {
      return {
        status: 'not_ready' as const,
        message: 'Factorial account not connected',
        issues: [
          {
            code: 'AUTH_REQUIRED',
            message: 'Connect your Factorial account via OAuth to use this integration.',
            severity: 'warning' as const,
          },
        ],
      };
    }

    // Validate token with a real API call
    await factorialRequest(ctx, '/employees/employees?limit=1');

    return { status: 'ready' as const, message: 'Factorial connected' };
  } catch (error) {
    return {
      status: 'not_ready' as const,
      message: `Factorial: ${error instanceof Error ? error.message : 'Failed to connect'}`,
      issues: [
        {
          code: 'CONNECTION_ERROR',
          message: error instanceof Error ? error.message : 'Failed to connect to Factorial',
          severity: 'error' as const,
        },
      ],
    };
  }
});

// =============================================================================
// TOOLS
// =============================================================================

registerTools(app);

// =============================================================================
// EXPORT
// =============================================================================

export const factory = app.toFactory();
