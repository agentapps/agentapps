/**
 * @agentapps/cli — config command.
 *
 * Configure secrets:
 *   - `config <appId> KEY:value`  — system secrets, stored per-app in
 *     `.secrets/apps/<appId>.json`, shared by all instances of that app.
 *   - `config <alias> KEY:value`  — installation secrets for an installed instance,
 *     stored in `.agentapps/installation-secrets/<installationId>.json`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveSourcePath } from '../config.js';
import { InstallationSecretsStore } from '../host.js';
import { appSecretsPath, saveAppSecrets } from '../secrets-store.js';
import { getInstallation, instanceSecretsPath } from '../state.js';
import type { HandlerResult, ReplCommand } from '../types.js';
import type { HandlerContext } from './types.js';

const MANIFEST_NAME = 'agentapp.json';

export async function handleConfig(
  command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  if (command.type !== 'config') {
    return {
      success: false,
      exitCode: 2,
      error: { message: 'Internal error: expected config command' },
    };
  }

  const { appId, args } = command;
  const { ctx } = context;
  const entry = ctx.config.apps[appId];

  if (!entry) {
    // Not an app id — maybe an installed instance alias (installation secrets).
    const instance = getInstallation(ctx.configPath, appId);
    if (instance) {
      return handleUserSecrets(
        instance.alias,
        instance.installationId,
        instance.appId,
        args,
        context,
      );
    }
    return {
      success: false,
      exitCode: 2,
      error: {
        message: `App or Installation not found: ${appId}`,
        suggestion: 'Run "apps" to see available apps, or "installations" for installed apps.',
      },
    };
  }

  const source = resolveSourcePath(ctx.configPath, entry.source);
  const manifest = readManifest(source);
  const expectedKeys = getSystemSecretKeys(manifest);

  if (expectedKeys.length === 0) {
    return {
      success: true,
      exitCode: 0,
      message: `App ${appId} does not declare any system secrets.`,
    };
  }

  const parsed = parseConfigArgs(args);
  if (parsed.error) {
    return {
      success: false,
      exitCode: 2,
      error: { message: parsed.error },
    };
  }

  let provided = parsed.values;

  if (Object.keys(provided).length === 0) {
    // Interactive mode: prompt for all expected keys.
    provided = await promptSecrets(expectedKeys, context.input, context.output);
  } else {
    // Explicit mode: validate key names but allow partial updates (merge with existing).
    const unknown = Object.keys(provided).filter((k) => !expectedKeys.includes(k));
    if (unknown.length > 0) {
      return {
        success: false,
        exitCode: 2,
        error: {
          message: `Unexpected secret(s): ${unknown.join(', ')}`,
          suggestion: `Expected keys: ${expectedKeys.join(', ')}`,
        },
      };
    }
  }

  saveAppSecrets(ctx.configPath, appId, provided);

  return {
    success: true,
    exitCode: 0,
    message: `Configured ${Object.keys(provided).length} system secret(s) for ${appId}`,
    data: {
      appId,
      keys: Object.keys(provided),
      path: appSecretsPath(ctx.configPath, appId),
    },
  };
}

/** Configure installation secrets for an installed instance (alias). */
async function handleUserSecrets(
  alias: string,
  installationId: string,
  appId: string,
  args: string[],
  context: HandlerContext,
): Promise<HandlerResult> {
  const { ctx } = context;
  const entry = ctx.config.apps[appId];
  if (!entry) {
    return {
      success: false,
      exitCode: 2,
      error: { message: `App configuration missing for ${appId} (Installation ${alias})` },
    };
  }

  const source = resolveSourcePath(ctx.configPath, entry.source);
  const manifest = readManifest(source);
  const expectedKeys = getUserSecretKeys(manifest);

  if (expectedKeys.length === 0) {
    return {
      success: true,
      exitCode: 0,
      message: `App ${appId} does not declare any installation secrets.`,
    };
  }

  const parsed = parseConfigArgs(args);
  if (parsed.error) {
    return {
      success: false,
      exitCode: 2,
      error: { message: parsed.error },
    };
  }

  let provided = parsed.values;

  if (Object.keys(provided).length === 0) {
    provided = await promptSecrets(expectedKeys, context.input, context.output);
  } else {
    const unknown = Object.keys(provided).filter((k) => !expectedKeys.includes(k));
    if (unknown.length > 0) {
      return {
        success: false,
        exitCode: 2,
        error: {
          message: `Unexpected Installation secret(s): ${unknown.join(', ')}`,
          suggestion: `Expected keys: ${expectedKeys.join(', ')}`,
        },
      };
    }
  }

  // Sessions resolve installation secrets by installationId — never key this by alias.
  new InstallationSecretsStore(ctx.configPath, installationId).merge(provided);

  return {
    success: true,
    exitCode: 0,
    message: `Configured ${Object.keys(provided).length} Installation secret(s) for ${alias} (${appId})`,
    data: {
      alias,
      appId,
      keys: Object.keys(provided),
      path: instanceSecretsPath(ctx.configPath, installationId),
    },
  };
}

function getUserSecretKeys(manifest: Record<string, unknown> | undefined): string[] {
  if (!manifest) return [];
  const auth = manifest.auth as Record<string, unknown> | undefined;
  if (!auth) return [];
  const installationSecrets = auth.installationSecrets;
  if (!Array.isArray(installationSecrets)) return [];
  return installationSecrets.filter((k): k is string => typeof k === 'string');
}

function readManifest(sourcePath: string): Record<string, unknown> | undefined {
  const manifestPath = join(sourcePath, MANIFEST_NAME);
  if (!existsSync(manifestPath)) return undefined;
  try {
    const raw = readFileSync(manifestPath, 'utf8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** Infrastructure secrets accepted for any app with OAuth auth. */
const OAUTH_INFRA_KEYS = ['REDIRECT_URI'];

function getSystemSecretKeys(manifest: Record<string, unknown> | undefined): string[] {
  if (!manifest) return [];
  const auth = manifest.auth as Record<string, unknown> | undefined;
  if (!auth) return [];
  const systemSecrets = auth.systemSecrets;
  if (!Array.isArray(systemSecrets)) return [];
  const keys = systemSecrets.filter((k): k is string => typeof k === 'string');
  // For OAuth apps, also accept infrastructure keys (REDIRECT_URI, etc.)
  if (auth.type === 'oauth2' || auth.provider) {
    for (const k of OAUTH_INFRA_KEYS) {
      if (!keys.includes(k)) keys.push(k);
    }
  }
  return keys;
}

interface ParsedConfigArgs {
  values: Record<string, string>;
  error?: string;
}

function parseConfigArgs(args: string[]): ParsedConfigArgs {
  const values: Record<string, string> = {};
  for (const arg of args) {
    const colonIndex = arg.indexOf(':');
    if (colonIndex === -1) {
      return { values, error: `Invalid secret argument (expected key:value): ${arg}` };
    }
    const key = arg.slice(0, colonIndex);
    let value = arg.slice(colonIndex + 1);
    if (value.length >= 2) {
      const first = value[0];
      const last = value[value.length - 1];
      if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
        value = value.slice(1, -1);
      }
    }
    values[key] = value;
  }
  return { values };
}

async function promptSecrets(
  keys: string[],
  input?: NodeJS.ReadableStream,
  output?: NodeJS.WritableStream,
): Promise<Record<string, string>> {
  const stdin = input ?? process.stdin;
  const stdout = output ?? process.stdout;
  const result: Record<string, string> = {};

  for (const key of keys) {
    const value = await promptSecret(stdin, stdout, key);
    if (value) result[key] = value;
  }

  return result;
}

interface TtyLikeReadable extends NodeJS.ReadableStream {
  isTTY?: boolean;
  setRawMode(mode: boolean): void;
  resume(): this;
  setEncoding(encoding: string): this;
  on(event: 'data', listener: (data: Buffer) => void): this;
  off(event: 'data', listener: (data: Buffer) => void): this;
}

interface TtyLikeWritable extends NodeJS.WritableStream {
  isTTY?: boolean;
}

function promptSecret(
  stdin: NodeJS.ReadableStream,
  stdout: NodeJS.WritableStream,
  key: string,
): Promise<string> {
  return new Promise((resolve) => {
    const stdinTty = stdin as TtyLikeReadable;
    const stdoutTty = stdout as TtyLikeWritable;
    const isTTY = stdinTty.isTTY && stdoutTty.isTTY;

    stdout.write(`Enter ${key}: `);

    if (!isTTY) {
      readlineFor(stdin, stdout).then((rl) => {
        rl.question('', (answer) => {
          rl.close();
          resolve(answer.trim());
        });
      });
      return;
    }

    stdinTty.setRawMode(true);
    stdinTty.resume();
    stdinTty.setEncoding('utf8');

    let value = '';
    const onData = (data: Buffer) => {
      const str = data.toString('utf8');
      for (const ch of str) {
        if (ch === '\n' || ch === '\r') {
          stdinTty.off('data', onData);
          stdinTty.setRawMode(false);
          stdout.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') {
          stdinTty.off('data', onData);
          stdinTty.setRawMode(false);
          stdout.write('\n');
          process.exit(130);
        }
        if (ch === '\u007f') {
          if (value.length > 0) {
            value = value.slice(0, -1);
            stdout.write('\b \b');
          }
          continue;
        }
        value += ch;
        stdout.write('*');
      }
    };
    stdinTty.on('data', onData);
  });
}

async function readlineFor(
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
): Promise<import('node:readline').Interface> {
  // Dynamic import avoids loading readline at module init when it is not needed.
  const { createInterface } = await import('node:readline');
  return createInterface({ input, output });
}
