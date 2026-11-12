/**
 * @agentapps/sdk — health check builder.
 *
 * Optional helper for constructing `HealthResult` values with structured
 * issues, severity-based status aggregation, and convenient checks for
 * secrets, auth, and external API connectivity.
 *
 * The builder is intentionally decoupled from `HealthContext` so it can be
 * used both inside health handlers and in standalone diagnostic code.
 */

import type { HealthIssue, HealthStatus } from '@agentapps/protocol';
import type { AuthAccess, HealthResult, SecretsAccess } from './types.js';

/**
 * Severity ordering used to compute the aggregate health status.
 * Higher index = more severe.
 */
const SEVERITY_ORDER: Array<HealthIssue['severity']> = ['warning', 'error'];

/** Options for `HealthCheckBuilder.requireApiAccess()`. */
export interface ApiAccessOptions {
  /** Human-readable label for the API being checked. */
  label?: string;
  /** Timeout in milliseconds. Default: 10000. */
  timeoutMs?: number;
  /** Expected HTTP status codes. Default: [200, 204]. */
  expectedStatuses?: number[];
  /** Optional OAuth provider to suggest in the action when auth fails. */
  provider?: string;
  /** Optional URL to present as a link action when the check fails. */
  helpUrl?: string;
}

/**
 * Fluent builder for health check results.
 *
 * @example
 * ```ts
 * export const health: HealthHandler = async (ctx) => {
 *   const builder = new HealthCheckBuilder(ctx.secrets, ctx.auth);
 *   await builder.requireSystemSecret('API_KEY');
 *   await builder.requireAuth('google');
 *   await builder.requireApiAccess('https://api.example.com/health', async (url) => {
 *     const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
 *     return res.ok;
 *   });
 *   return builder.build('Service health check completed');
 * };
 * ```
 */
export class HealthCheckBuilder {
  private readonly issues: HealthIssue[] = [];

  constructor(
    private readonly secrets?: SecretsAccess,
    private readonly auth?: AuthAccess,
  ) {}

  /** Append a pre-built issue. */
  addIssue(issue: HealthIssue): this {
    this.issues.push(issue);
    return this;
  }

  /** Append an issue only when `condition` is truthy. */
  addIssueIf(condition: unknown, issue: HealthIssue): this {
    if (condition) {
      this.issues.push(issue);
    }
    return this;
  }

  /**
   * Add an issue if the named system secret is missing or empty.
   * The issue includes a `link` action pointing to the app settings.
   */
  async requireSystemSecret(name: string): Promise<this> {
    const value = await this.secrets?.getSystem();
    if (!value?.[name]) {
      this.issues.push({
        code: `missing_system_secret:${name}`,
        message: `System secret "${name}" is not configured.`,
        severity: 'error',
        action: {
          type: 'link',
          url: '/settings/apps',
          label: 'Open app settings',
        },
      });
    }
    return this;
  }

  /**
   * Add an issue if the named user secret is missing or empty.
   * The issue includes an `oauth` action when the auth provider is known.
   */
  async requireUserSecret(name: string, provider?: string): Promise<this> {
    const value = await this.secrets?.getInstallation();
    if (!value?.[name]) {
      this.issues.push({
        code: `missing_user_secret:${name}`,
        message: `User secret "${name}" is not configured.`,
        severity: 'error',
        action: provider
          ? {
              type: 'oauth',
              url: `/auth/${provider}`,
              label: `Connect ${provider}`,
            }
          : {
              type: 'link',
              url: '/settings/apps',
              label: 'Open app settings',
            },
      });
    }
    return this;
  }

  /**
   * Add an issue if the user is not authenticated with the given provider.
   */
  async requireAuth(provider: string): Promise<this> {
    const status = await this.auth?.getStatus().catch(() => undefined);
    if (!status?.authenticated || status.provider !== provider) {
      this.issues.push({
        code: `auth_required:${provider}`,
        message: `Authentication with ${provider} is required.`,
        severity: 'error',
        action: {
          type: 'oauth',
          url: `/auth/${provider}`,
          label: `Connect ${provider}`,
        },
      });
    }
    return this;
  }

  /**
   * Validate connectivity to an external API.
   *
   * `check` is an async predicate that returns `true` when the API is
   * reachable and healthy. When it returns `false` or throws, the builder
   * records an issue with a severity of `error` by default.
   */
  async requireApiAccess(
    url: string,
    check: (url: string) => boolean | Promise<boolean>,
    options: ApiAccessOptions = {},
  ): Promise<this> {
    const {
      label = url,
      timeoutMs = 10_000,
      expectedStatuses = [200, 204],
      provider,
      helpUrl,
    } = options;

    try {
      const appStation = new AbortController();
      const timeout = setTimeout(() => appStation.abort(), timeoutMs);
      const result = await Promise.race([
        check(url),
        new Promise<never>((_, reject) => {
          appStation.signal.addEventListener('abort', () => reject(new Error('timeout')));
        }),
      ]);
      clearTimeout(timeout);

      if (!result) {
        this.issues.push({
          code: `api_unreachable:${label}`,
          message: `External API "${label}" returned an unhealthy response at ${url}.`,
          severity: 'error',
          action: helpUrl
            ? { type: 'link', url: helpUrl, label: 'View API status' }
            : provider
              ? { type: 'oauth', url: `/auth/${provider}`, label: `Reconnect ${provider}` }
              : undefined,
        });
      }
    } catch (err) {
      const isTimeout =
        err instanceof Error && (err.name === 'AbortError' || err.message === 'timeout');
      this.issues.push({
        code: isTimeout ? `api_timeout:${label}` : `api_error:${label}`,
        message: isTimeout
          ? `External API "${label}" at ${url} did not respond within ${timeoutMs}ms.`
          : `External API "${label}" at ${url} is unreachable: ${err instanceof Error ? err.message : String(err)}.`,
        severity: 'error',
        action: helpUrl
          ? { type: 'link', url: helpUrl, label: 'View API status' }
          : provider
            ? { type: 'oauth', url: `/auth/${provider}`, label: `Reconnect ${provider}` }
            : undefined,
      });
    }

    // Keep the expectedStatuses option available for callers that want to
    // perform their own HTTP check inside the predicate.
    void expectedStatuses;
    return this;
  }

  /**
   * Compute the final `HealthResult`.
   *
   * Status rules:
   * - `not_ready` if any issue has severity `error`.
   * - `degraded` if any issue has severity `warning` and no `error` issues.
   * - `ready` otherwise.
   */
  build(message?: string): HealthResult {
    let status: HealthStatus = 'ready';
    for (const issue of this.issues) {
      const severityIndex = SEVERITY_ORDER.indexOf(issue.severity);
      if (severityIndex < 0) continue;
      if (issue.severity === 'error') {
        status = 'not_ready';
        break;
      }
      if (issue.severity === 'warning' && status === 'ready') {
        status = 'degraded';
      }
    }

    return {
      status,
      message,
      issues: this.issues.length > 0 ? this.issues : undefined,
    };
  }
}
