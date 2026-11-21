/**
 * @agentapps/cli — API key commands.
 *
 * Usage:
 *   key list                                          — list all API keys
 *   key create <name> <userId> [workspaceId]           — create a key; it is a new Principal
 *   key revoke <keyId>                                — revoke a key
 */

import type { ApiKeyRecord } from '@agentapps/protocol';
import { generateApiKey } from '@agentapps/station';
import { loadApiKeys, saveApiKeys } from '../state.js';
import type { HandlerResult, ReplCommand, ResultValue } from '../types.js';
import type { HandlerContext } from './types.js';

export async function handleKeyList(
  _command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  const { ctx } = context;
  const keys = loadApiKeys(ctx.configPath);

  if (keys.length === 0) {
    return { success: true, message: 'No API keys defined.', exitCode: 0 };
  }

  const data: Record<string, ResultValue> = {};
  for (const k of keys) {
    data[k.id] = {
      name: k.name,
      prefix: k.prefix,
      principalId: k.principalId,
      userId: k.identity.userId,
      status: k.revokedAt ? 'revoked' : 'active',
      createdAt: k.createdAt,
    };
  }

  return { success: true, data: { 'API Keys': data } as unknown as ResultValue, exitCode: 0 };
}

/**
 * Create and store an API key; the key is its own Principal with the default
 * Policy. Returns the record and the raw key, which is shown only once.
 *
 * Throws when an active key already has that name: names are unique among
 * active keys, which is what lets `policy` take a name (POLICY-REQ-15).
 *
 * @spec POLICY-REQ-1
 * @spec POLICY-REQ-15
 */
export function createApiKey(
  configPath: string,
  name: string,
  userId: string,
  workspaceId?: string,
): { record: ApiKeyRecord; raw: string } {
  const keys = loadApiKeys(configPath);
  const taken = keys.find((k) => k.name === name && !k.revokedAt);
  if (taken) throw new Error(`An active API key is already named ${name} (${taken.id})`);

  const { raw, hash, prefix } = generateApiKey();
  const now = new Date().toISOString();
  const id = `ak_${randomHex(8)}`;
  const record: ApiKeyRecord = {
    id,
    name,
    keyHash: hash,
    prefix,
    identity: { userId, ...(workspaceId ? { workspaceId } : {}) },
    // POLICY-REQ-1: each key is its own Principal, with the default Policy (POLICY-REQ-2).
    principalId: id,
    createdAt: now,
    updatedAt: now,
  };
  keys.push(record);
  saveApiKeys(configPath, keys);
  return { record, raw };
}

/** @spec POLICY-REQ-1 */
export async function handleKeyCreate(
  command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  if (command.type !== 'key-create') {
    return { success: false, exitCode: 2, error: { message: 'Internal error' } };
  }
  let created: ReturnType<typeof createApiKey>;
  try {
    created = createApiKey(
      context.ctx.configPath,
      command.name,
      command.userId,
      command.workspaceId,
    );
  } catch (err) {
    return {
      success: false,
      exitCode: 2,
      error: {
        message: (err as Error).message,
        suggestion: 'Pick another name, or revoke that key first with: key revoke <id>',
      },
    };
  }
  const { record, raw } = created;

  return {
    success: true,
    message: [
      `API key created: ${record.id}`,
      `Name: ${record.name}`,
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

export async function handleKeyRevoke(
  command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  if (command.type !== 'key-revoke') {
    return { success: false, exitCode: 2, error: { message: 'Internal error' } };
  }
  const { ctx } = context;
  const keys = loadApiKeys(ctx.configPath);
  const key = keys.find((k) => k.id === command.keyId);
  if (!key) {
    return { success: false, exitCode: 2, error: { message: `Key not found: ${command.keyId}` } };
  }
  if (key.revokedAt) {
    return {
      success: false,
      exitCode: 2,
      error: { message: `Key already revoked: ${command.keyId}` },
    };
  }

  key.revokedAt = new Date().toISOString();
  saveApiKeys(ctx.configPath, keys);
  return { success: true, message: `API key revoked: ${command.keyId} (${key.name})`, exitCode: 0 };
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}
