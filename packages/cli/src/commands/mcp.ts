/**
 * @agentapps/cli — `mcp <keyName>`: the stdio MCP server an agent client runs
 * (CLI-REQ-6). stdout carries the MCP protocol, so everything else goes to stderr.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { InstallationGateway } from '../mcp-gateway.js';
import { loadClientKey } from '../secrets-store.js';
import { loadApiKeys } from '../state.js';
import { readStationMeta } from '../station-lifecycle.js';
import type { HandlerResult } from '../types.js';

/** How often the gateway re-reads the Installations (a station may start or restart). */
const REFRESH_MS = 60_000;

/** @spec CLI-REQ-6 */
export async function runMcp(configPath: string, keyName: string): Promise<HandlerResult> {
  const log = (message: string) => process.stderr.write(`[agentapps mcp] ${message}\n`);
  const stored = loadClientKey(configPath, keyName);
  if (!stored) {
    log(`No key named ${keyName} is stored. Run: agentapps connect ${keyName}`);
    return { success: false, exitCode: 2 };
  }

  const userId =
    loadApiKeys(configPath).find((k) => k.id === stored.keyId)?.identity.userId ?? 'local';
  const gateway = new InstallationGateway(() => {
    const meta = readStationMeta(configPath);
    return meta ? { url: meta.url, key: stored.key, userId } : undefined;
  }, log);

  const server = new Server(
    { name: 'agentapps', version: '0.1.0' },
    { capabilities: { tools: { listChanged: true } } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: gateway.list().map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as { type: 'object' },
    })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const result = await gateway.call(
      request.params.name,
      (request.params.arguments as Record<string, unknown>) ?? {},
    );
    return { content: [{ type: 'text' as const, text: result.text }], isError: result.isError };
  });

  await gateway.refresh();
  const timer = setInterval(() => {
    void gateway.refresh().then((changed) => {
      if (changed) server.sendToolListChanged().catch(() => {});
    });
  }, REFRESH_MS);

  const transport = new StdioServerTransport();
  const closed = new Promise<void>((resolve) => {
    transport.onclose = () => resolve();
    process.stdin.once('end', () => resolve());
  });
  await server.connect(transport);
  await closed;
  clearInterval(timer);
  return { success: true, exitCode: 0 };
}
