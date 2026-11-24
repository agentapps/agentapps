/**
 * @agentapps/cli — key commands.
 *
 * API Keys are the Station's: it creates, lists and revokes them. A key is a
 * Principal with the default Policy and a role (STADMIN-REQ-8).
 */

import { isResult, type StationClient, StationError, stationOf } from '../station-client.js';
import type { HandlerResult, ReplCommand, ResultValue } from '../types.js';
import type { HandlerContext } from './types.js';

/** An API Key as the Station lists it: never its value. */
export interface KeyInfo {
  id: string;
  name: string;
  prefix: string;
  principalId: string;
  identity: { userId: string };
  role: string;
  workspaceId: string | null;
  createdAt: string;
  revokedAt?: string;
}

/**
 * The keys the caller manages.
 *
 * @spec STADMIN-REQ-8
 */
export async function listKeys(station: StationClient): Promise<KeyInfo[]> {
  return (await station.api<{ keys: KeyInfo[] }>('GET', '/api/keys')).keys;
}

/**
 * Ask the Station for a new API Key. The key is its own Principal with the
 * default Policy; its value is answered this once.
 *
 * @spec POLICY-REQ-1
 * @spec STADMIN-REQ-8
 */
export async function createStationKey(
  station: StationClient,
  name: string,
  userId: string,
  role?: string,
): Promise<{ record: KeyInfo; raw: string }> {
  const { key, ...record } = await station.api<KeyInfo & { key: string }>('POST', '/api/keys', {
    name,
    userId,
    ...(role ? { role } : {}),
  });
  return { record, raw: key };
}

/** @spec STADMIN-REQ-8 */
export async function handleKeyList(
  _command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  const station = stationOf(context);
  if (isResult(station)) return station;

  let keys: KeyInfo[];
  try {
    keys = await listKeys(station);
  } catch (err) {
    return station.failure(err);
  }
  if (keys.length === 0) {
    return { success: true, message: 'No API keys defined.', exitCode: 0 };
  }

  const data: Record<string, ResultValue> = {};
  for (const k of keys) {
    data[k.id] = {
      name: k.name,
      prefix: k.prefix,
      role: k.role,
      principalId: k.principalId,
      userId: k.identity.userId,
      status: k.revokedAt ? 'revoked' : 'active',
      createdAt: k.createdAt,
    };
  }
  return { success: true, data: { 'API Keys': data } as unknown as ResultValue, exitCode: 0 };
}

/**
 * `key create <name> <userId> [role:<role>]`
 *
 * @spec POLICY-REQ-1
 * @spec STADMIN-REQ-8
 */
export async function handleKeyCreate(
  command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  if (command.type !== 'key-create') {
    return { success: false, exitCode: 2, error: { message: 'Internal error' } };
  }
  const station = stationOf(context);
  if (isResult(station)) return station;

  let created: Awaited<ReturnType<typeof createStationKey>>;
  try {
    created = await createStationKey(station, command.name, command.userId, command.role);
  } catch (err) {
    if (err instanceof StationError && err.code === 'NAME_TAKEN') {
      return {
        success: false,
        exitCode: 2,
        error: {
          message: err.message,
          suggestion: 'Pick another name, or revoke that key first with: key revoke <id>',
        },
      };
    }
    return station.failure(err);
  }
  const { record, raw } = created;

  return {
    success: true,
    message: [
      `API key created: ${record.id}`,
      `Name: ${record.name}`,
      `Role: ${record.role}`,
      `Principal: ${record.principalId} (default Policy; see: policy show ${record.principalId})`,
      `User: ${command.userId}`,
      ``,
      `Key: ${raw}`,
      ``,
      `Save this key now -- it will not be shown again.`,
    ].join('\n'),
    exitCode: 0,
  };
}

/** @spec STADMIN-REQ-8 */
export async function handleKeyRevoke(
  command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  if (command.type !== 'key-revoke') {
    return { success: false, exitCode: 2, error: { message: 'Internal error' } };
  }
  const station = stationOf(context);
  if (isResult(station)) return station;

  try {
    const revoked = await station.api<{ id: string; name: string }>(
      'DELETE',
      `/api/keys/${encodeURIComponent(command.keyId)}`,
    );
    return {
      success: true,
      message: `API key revoked: ${revoked.id} (${revoked.name})`,
      exitCode: 0,
    };
  } catch (err) {
    if (err instanceof StationError && err.status === 404) {
      return {
        success: false,
        exitCode: 2,
        error: { message: `Key not found or already revoked: ${command.keyId}` },
      };
    }
    return station.failure(err);
  }
}
