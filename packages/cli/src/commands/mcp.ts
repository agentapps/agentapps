/**
 * @agentapps/cli — `mcp <keyName>`: the stdio MCP server an agent client runs
 * (CLI-REQ-6). stdout carries the MCP protocol, so everything else goes to stderr.
 */

import { userInfo } from 'node:os';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { loadWorkspaceConfig } from '../config.js';
import { InstallationGateway } from '../mcp-gateway.js';
import { loadClientKey } from '../secrets-store.js';
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

  // CLIENT-REQ-1: the Station the workspace's CLI connects to, read again on
  // every refresh so the gateway follows `station use`.
  const userId = userInfo().username;
  const gateway = new InstallationGateway(() => {
    const url = loadWorkspaceConfig(configPath).cli?.stationUrl?.replace(/\/+$/, '');
    return url ? { url, key: stored.key, userId } : undefined;
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
