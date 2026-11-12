/**
 * @agentapps/cli — API key commands.
 *
 * Usage:
 *   key list                                          — list all API keys
 *   key create <name> <userId> [workspaceId]           — create a key; it is a new Principal
 *   key revoke <keyId>                                — revoke a key
 */

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

/** @spec POLICY-REQ-1 */
export async function handleKeyCreate(
  command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  if (command.type !== 'key-create') {
    return { success: false, exitCode: 2, error: { message: 'Internal error' } };
  }
  const { ctx } = context;

  const { raw, hash, prefix } = generateApiKey();
  const now = new Date().toISOString();
  const id = `ak_${randomHex(8)}`;
  const record = {
    id,
    name: command.name,
    keyHash: hash,
    prefix,
    identity: {
      userId: command.userId,
      ...(command.workspaceId ? { workspaceId: command.workspaceId } : {}),
    },
    // POLICY-REQ-1: each key is its own Principal, with the default Policy (POLICY-REQ-2).
    principalId: id,
    createdAt: now,
    updatedAt: now,
  };

  const keys = loadApiKeys(ctx.configPath);
  keys.push(record);
  saveApiKeys(ctx.configPath, keys);

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
