/**
 * @agentapps/cli — `connect <name>`: hand an Agent Platform its own API key and
 * the CLI's MCP gateway (CLI-REQ-5, CLI-REQ-9).
 *
 *   connect claude-code           key `claude-code` + `claude mcp add agentapps …`
 *   connect claude-code --remove  unregister and revoke the key
 *   connect cursor                key `cursor` + the MCP server entry to paste
 *   connect cursor --remove       revoke the key
 */

import { spawnSync } from 'node:child_process';
import { userInfo } from 'node:os';
import { deleteClientKey, loadClientKey, saveClientKey } from '../secrets-store.js';
import { isResult, type StationClient, stationOf } from '../station-client.js';
import type { HandlerResult, ReplCommand } from '../types.js';
import { createStationKey, listKeys } from './keys.js';
import type { HandlerContext } from './types.js';

/** The one Agent Platform the CLI can register the gateway with by itself. */
const CLAUDE_CODE = 'claude-code';
const SERVER_NAME = 'agentapps';

/** A key name is also a command argument and a file name: keep it plain. */
const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/**
 * The MCP server entry an Agent Platform needs to run the gateway, in the
 * `mcpServers` shape most of them read.
 */
function serverEntry(keyName: string): string {
  return JSON.stringify(
    { mcpServers: { [SERVER_NAME]: { command: 'agentapps', args: ['mcp', keyName] } } },
    null,
    2,
  );
}

/** The `claude mcp` arguments that register and unregister the gateway. */
function addArgs(keyName: string): string[] {
  return ['mcp', 'add', SERVER_NAME, '-s', 'user', '--', 'agentapps', 'mcp', keyName];
}
const REMOVE_ARGS = ['mcp', 'remove', SERVER_NAME, '-s', 'user'];

/** Run `claude …`; `undefined` when `claude` is not on the PATH. */
function runClaude(args: string[]): { status: number | null; stderr: string } | undefined {
  const result = spawnSync('claude', args, { encoding: 'utf8' });
  if ((result.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') return undefined;
  return { status: result.status, stderr: result.stderr ?? '' };
}

/**
 * @spec CLI-REQ-5
 * @spec CLI-REQ-9
 */
export async function handleConnect(
  command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  if (command.type !== 'connect') {
    return { success: false, exitCode: 2, error: { message: 'Internal error' } };
  }
  const client = command.client;
  if (!NAME_PATTERN.test(client)) {
    return {
      success: false,
      exitCode: 2,
      error: {
        message: `Not a valid name: ${client}`,
        suggestion: 'Use lowercase letters, digits and hyphens, such as claude-code or cursor.',
      },
    };
  }
  const station = stationOf(context);
  if (isResult(station)) return station;
  try {
    return command.remove
      ? await disconnect(station, context.ctx.configPath, client)
      : await connect(station, context.ctx.configPath, client);
  } catch (err) {
    return station.failure(err);
  }
}

async function connect(
  station: StationClient,
  configPath: string,
  name: string,
): Promise<HandlerResult> {
  const stored = loadClientKey(configPath, name);
  const active = (await listKeys(station)).find((k) => k.name === name && !k.revokedAt);

  let keyId: string;
  let created = false;
  if (active && stored?.keyId === active.id) {
    keyId = active.id;
  } else if (active) {
    return {
      success: false,
      exitCode: 1,
      error: {
        message: `A key named ${name} already exists (${active.id}), but its value is not stored here.`,
        suggestion: `Revoke it with "key revoke ${active.id}" and run connect again.`,
      },
    };
  } else {
    // The Station creates the key; the CLI keeps its value for the agent client (CLI-REQ-5).
    const { record, raw } = await createStationKey(station, name, userInfo().username);
    saveClientKey(configPath, name, { keyId: record.id, key: raw });
    keyId = record.id;
    created = true;
  }

  const keyLine = created
    ? `API key ${name} created (${keyId}); its Policy: policy show ${keyId}`
    : `Using the existing API key ${name} (${keyId}) and its Policy`;

  if (name !== CLAUDE_CODE) {
    return {
      success: true,
      exitCode: 0,
      message: [
        keyLine,
        '',
        `Add this MCP server to the settings of ${name}:`,
        serverEntry(name),
      ].join('\n'),
    };
  }

  // Remove first so running connect again leaves a single registration.
  const removed = runClaude(REMOVE_ARGS);
  if (!removed) {
    return {
      success: true,
      exitCode: 0,
      message: [
        keyLine,
        '',
        'Claude Code was not found on the PATH. Once it is installed, run:',
        `  claude ${addArgs(name).join(' ')}`,
      ].join('\n'),
    };
  }
  const added = runClaude(addArgs(name));
  if (added?.status !== 0) {
    return {
      success: false,
      exitCode: 1,
      error: {
        message: `claude mcp add failed: ${added?.stderr.trim() || 'unknown error'}`,
        suggestion: `Run it yourself: claude ${addArgs(name).join(' ')}`,
      },
    };
  }
  return {
    success: true,
    exitCode: 0,
    message: [
      keyLine,
      `Claude Code runs "agentapps mcp ${name}" as the MCP server "${SERVER_NAME}".`,
      '',
      'Open a new Claude Code session to use your Installations.',
    ].join('\n'),
  };
}

async function disconnect(
  station: StationClient,
  configPath: string,
  name: string,
): Promise<HandlerResult> {
  const lines: string[] = [];
  if (name !== CLAUDE_CODE) {
    lines.push(`Remove the MCP server "${SERVER_NAME}" from the settings of ${name}.`);
  } else {
    const removed = runClaude(REMOVE_ARGS);
    if (!removed) {
      lines.push(
        `Claude Code was not found on the PATH; to unregister, run: claude ${REMOVE_ARGS.join(' ')}`,
      );
    } else {
      lines.push(`MCP server "${SERVER_NAME}" removed from Claude Code.`);
    }
  }

  const stored = loadClientKey(configPath, name);
  const key = (await listKeys(station)).find((k) => k.id === stored?.keyId && !k.revokedAt);
  if (key) {
    await station.api('DELETE', `/api/keys/${encodeURIComponent(key.id)}`);
    lines.push(`API key ${name} revoked (${key.id}).`);
  }
  deleteClientKey(configPath, name);
  return { success: true, exitCode: 0, message: lines.join('\n') };
}
