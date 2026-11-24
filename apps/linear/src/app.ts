import { createApp } from '@agentapps/sdk';
import { validateCredentials } from './lib/index.js';
import { registerTools } from './tools/index.js';

// Exported (not just wrapped in `factory`) so tests can compare `app.toManifest()`
// with `agentapp.json`: the two describe the same app and must change together.
export const app = createApp({
  id: 'app.linear',
  version: '3.0.1',
  name: 'Linear',
  description:
    'Linear issue tracking - list, create, update issues, manage projects, labels, teams and users',
  tagline: 'Manage issues, projects, and labels in Linear',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  logo: 'assets/logo.svg',
  logoMono: 'assets/logo-mono.svg',
  terms: 'https://agentapps.tech/terms',
  category: 'productivity',
  keywords: ['linear', 'issues', 'tasks', 'project-management'],
  entrypoint: { type: 'module', path: 'src/app.ts', export: 'factory' },
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
  capabilities: { tools: true, health: true },
  auth: { type: 'api-key', installationSecrets: ['API_KEY'] },
});

app.health(async (ctx) => {
  try {
    const installationSecrets = await ctx.secrets.getInstallation().catch((err: Error) => {
      if (/no user credentials/i.test(err.message)) return null;
      throw err;
    });
    if (!installationSecrets?.API_KEY) {
      return {
        status: 'not_ready' as const,
        message: 'Linear API key not configured',
        issues: [
          {
            code: 'USER_NOT_AUTHENTICATED',
            message: 'Configure your Linear API key in app settings.',
            severity: 'warning' as const,
          },
        ],
      };
    }
    try {
      await validateCredentials(ctx);
    } catch (apiError: any) {
      const msg = String(apiError?.message ?? '');
      if (/401|403|unauthori[sz]ed/i.test(msg)) {
        return {
          status: 'not_ready' as const,
          message: 'Linear API key is invalid',
          issues: [
            {
              code: 'AUTH_INVALID',
              message: 'The configured API key is invalid.',
              severity: 'error' as const,
            },
          ],
        };
      }
      return {
        status: 'degraded' as const,
        message: `Linear API error: ${msg}`,
        issues: [
          {
            code: 'DEPENDENCY_UNAVAILABLE',
            message: msg,
            severity: 'warning' as const,
          },
        ],
      };
    }
    return { status: 'ready' as const, message: 'Linear connected' };
  } catch (error) {
    return {
      status: 'not_ready' as const,
      message: String(error),
      issues: [
        {
          code: 'UNKNOWN',
          message: String(error),
          severity: 'error' as const,
        },
      ],
    };
  }
});

registerTools(app);

export const factory = app.toFactory();
