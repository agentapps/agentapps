/**
 * @agentapps/cli — the MCP gateway behind `agentapps mcp <keyName>` (CLI-REQ-6).
 *
 * Asks the workspace's station which Installations an API key may see
 * (`GET /installations`, POLICY-REQ-10..12), opens one session per
 * Installation and exposes its tools as `<alias>__<tool>`. Calls go to the
 * station with the same key, so the key's Policy applies to every call.
 */

import { DEFAULT_APPROVAL_TIMEOUT_MS } from '@agentapps/station';

/** How long the gateway waits for any answer other than a tool call's. */
const REQUEST_TIMEOUT_MS = 60_000;

/**
 * How long the gateway waits for a tool call: a parked call may take the whole
 * Approval timeout before the tool even starts.
 *
 * @spec CLI-REQ-7
 */
export const TOOL_CALL_TIMEOUT_MS = DEFAULT_APPROVAL_TIMEOUT_MS + REQUEST_TIMEOUT_MS;

export interface StationTarget {
  url: string;
  key: string;
  /** The key's user, sent as the tenant and the call context. */
  userId: string;
}

export interface GatewayTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  installationId: string;
  tool: string;
}

interface ListedInstallation {
  installationId: string;
  alias: string;
}

/** @spec CLI-REQ-6 */
export class InstallationGateway {
  private tools = new Map<string, GatewayTool>();
  private sessions = new Map<string, string>();
  private messageId = 0;

  constructor(
    /** Where the station is, read again on every refresh (it may start later). */
    private readonly target: () => StationTarget | undefined,
    private readonly log: (message: string) => void,
  ) {}

  list(): GatewayTool[] {
    return [...this.tools.values()];
  }

  /** Re-read the visible Installations and their tools. Returns whether the list changed. */
  async refresh(): Promise<boolean> {
    const before = this.signature();
    const station = this.target();
    if (!station) {
      this.log('No station is answering: none is running. Start one with: agentapps station start');
      this.clear();
      return before !== this.signature();
    }

    let installations: ListedInstallation[];
    try {
      const res = await fetch(`${station.url}/installations`, {
        headers: { authorization: `Bearer ${station.key}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status === 401) {
        this.log('The station did not accept this key. Run: agentapps connect claude-code');
        this.clear();
        return before !== this.signature();
      }
      const body = (await res.json()) as { installations?: ListedInstallation[] };
      installations = body.installations ?? [];
    } catch {
      this.log(
        `No station is answering at ${station.url}. Start one with: agentapps station start`,
      );
      this.clear();
      return before !== this.signature();
    }

    const next = new Map<string, GatewayTool>();
    const visible = new Set(installations.map((i) => i.installationId));
    for (const id of this.sessions.keys()) if (!visible.has(id)) this.sessions.delete(id);

    for (const installation of installations) {
      try {
        const listed = await this.withSession(station, installation.installationId, (sessionId) =>
          this.send(station, { type: 'list_tools', sessionId }),
        );
        const tools = (listed.tools as Array<Record<string, unknown>> | undefined) ?? [];
        for (const t of tools) {
          const name = `${installation.alias}__${String(t.name)}`;
          next.set(name, {
            name,
            description: String(t.description ?? ''),
            inputSchema: (t.parameters as Record<string, unknown>) ?? { type: 'object' },
            installationId: installation.installationId,
            tool: String(t.name),
          });
        }
      } catch (err) {
        this.log(`Could not list the tools of ${installation.alias}: ${(err as Error).message}`);
      }
    }
    this.tools = next;
    return before !== this.signature();
  }

  /** Run a tool through the station; the answer is text for the MCP client. */
  async call(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ text: string; isError: boolean }> {
    const entry = this.tools.get(name);
    const station = this.target();
    if (!entry || !station) return { text: `Tool not found: ${name}`, isError: true };
    try {
      const resp = await this.withSession(station, entry.installationId, (sessionId) =>
        this.send(
          station,
          {
            type: 'tool_call',
            sessionId,
            tool: entry.tool,
            arguments: args,
            context: { userId: station.userId, workspaceId: 'local' },
          },
          TOOL_CALL_TIMEOUT_MS,
        ),
      );
      return toText(resp);
    } catch (err) {
      return { text: `Error: ${(err as Error).message}`, isError: true };
    }
  }

  /**
   * Run `fn` with the Installation's session, opening one if needed. A station
   * restart forgets sessions, so an unknown session is reopened once.
   */
  private async withSession(
    station: StationTarget,
    installationId: string,
    fn: (sessionId: string) => Promise<Record<string, unknown>>,
  ): Promise<Record<string, unknown>> {
    const known = this.sessions.get(installationId);
    if (known) {
      const resp = await fn(known);
      if (errorOf(resp)?.code !== 'SESSION_NOT_FOUND') return resp;
    }
    const opened = await this.send(station, {
      type: 'session_open',
      installationId,
      tenant: { userId: station.userId, workspaceId: 'local' },
    });
    if (typeof opened.sessionId !== 'string') {
      throw new Error(String(opened.message ?? 'the station did not open a session'));
    }
    this.sessions.set(installationId, opened.sessionId);
    return fn(opened.sessionId);
  }

  private async send(
    station: StationTarget,
    message: Record<string, unknown>,
    timeoutMs = REQUEST_TIMEOUT_MS,
  ): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new Error(`The station did not answer in ${timeoutMs} ms`)),
      timeoutMs,
    );
    try {
      const res = await fetch(`${station.url}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${station.key}` },
        body: JSON.stringify({
          id: `mcp-${++this.messageId}`,
          timestamp: new Date().toISOString(),
          version: '2.0',
          ...message,
        }),
        signal: controller.signal,
      });
      return (await res.json()) as Record<string, unknown>;
    } finally {
      clearTimeout(timer);
    }
  }

  private clear(): void {
    this.tools.clear();
    this.sessions.clear();
  }

  private signature(): string {
    return [...this.tools.keys()].sort().join('\n');
  }
}

/** The error a station answer carries, in its `error` field, or undefined. */
function errorOf(resp: Record<string, unknown>): { code?: string; message?: string } | undefined {
  return resp.error && typeof resp.error === 'object'
    ? (resp.error as { code?: string; message?: string })
    : undefined;
}

function toText(resp: Record<string, unknown>): { text: string; isError: boolean } {
  const error = errorOf(resp);
  if (error) {
    const code = error.code ? ` (${error.code})` : '';
    return { text: `Error${code}: ${error.message ?? JSON.stringify(error)}`, isError: true };
  }
  const result = resp.result;
  if (typeof result === 'string') return { text: result, isError: false };
  if (result === undefined || result === null) return { text: '(no result)', isError: false };
  return { text: JSON.stringify(result, null, 2), isError: false };
}
