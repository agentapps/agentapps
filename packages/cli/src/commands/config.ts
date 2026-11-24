/**
 * @agentapps/cli — config command.
 *
 * Sets and removes secrets through the Station:
 *   - `config <appId> KEY:value …`   system secrets of an App, shared by its
 *     Installations; the Station Operator's to set.
 *   - `config <alias> KEY:value …`   secrets of one Installation.
 *   - `config <appId|alias> unset KEY …` removes them.
 *
 * With no values, it prints the App's setup instructions and asks for each
 * declared secret. The CLI never reads or writes where secrets are kept.
 */

import { promptSecrets } from '../secret-prompt.js';
import { fetchSetupInstructions } from '../setup-instructions.js';
import { isResult, type StationClient, StationError, stationOf } from '../station-client.js';
import { findInstallation, type InstallationInfo } from '../station-session.js';
import type { HandlerResult, ReplCommand } from '../types.js';
import type { HandlerContext } from './types.js';

/** The redirect URI is the Station's, never a secret of an App (SETUP-REQ-8). */
const REDIRECT_URI_KEY = 'REDIRECT_URI';

interface AppInfo {
  id: string;
  auth: { systemSecrets: string[]; installationSecrets: string[]; hasSetup: boolean };
}

interface Change {
  set: string[];
  removed: string[];
  notSet: string[];
}

/**
 * @spec STADMIN-REQ-6
 * @spec STADMIN-REQ-10
 * @spec SETUP-REQ-5
 */
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

  const { appId: target, args } = command;
  const station = stationOf(context);
  if (isResult(station)) return station;

  try {
    const { apps } = await station.api<{ apps: AppInfo[] }>('GET', '/api/apps');
    const app = apps.find((a) => a.id === target);
    if (app) return await systemSecrets(station, app, args, context);

    // Not an App id — maybe the alias of an Installation.
    const instance = await findInstallation(station, target);
    if (instance) {
      const declared = apps.find((a) => a.id === instance.appId)?.auth.installationSecrets ?? [];
      return await installationSecrets(station, instance, declared, args, context);
    }
    return {
      success: false,
      exitCode: 2,
      error: {
        message: `App or Installation not found: ${target}`,
        suggestion: 'Run "apps" to see available apps, or "installations" for installed apps.',
      },
    };
  } catch (err) {
    return station.failure(err);
  }
}

/** What the arguments ask for: keys to remove, or values to set. */
function parseArgs(
  args: string[],
): { unset: string[] } | { values: Record<string, string> } | { error: string } {
  if (args[0] === 'unset') {
    const keys = args.slice(1);
    if (keys.length === 0) return { error: 'Name at least one secret to remove: unset <KEY>' };
    const withValue = keys.find((k) => k.includes(':'));
    if (withValue) return { error: `unset takes names, not values: ${withValue}` };
    return { unset: keys };
  }
  const values: Record<string, string> = {};
  for (const arg of args) {
    const colonIndex = arg.indexOf(':');
    if (colonIndex === -1) {
      return { error: `Invalid secret argument (expected key:value): ${arg}` };
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

/** The result of removing secrets. @spec STADMIN-REQ-10 */
function removedResult(of: string, change: Change, data: Record<string, string>): HandlerResult {
  const parts = [
    ...(change.removed.length > 0 ? [`Removed ${change.removed.join(', ')} from ${of}`] : []),
    ...(change.notSet.length > 0
      ? [`${change.notSet.join(', ')} ${change.notSet.length === 1 ? 'was' : 'were'} not set`]
      : []),
  ];
  return {
    success: true,
    exitCode: 0,
    message: parts.join('; '),
    data: { ...data, removed: change.removed },
  };
}

/** The result for a secret the Station refused because the App does not declare it. */
function unexpectedSecret(err: unknown, what: string): HandlerResult | undefined {
  if (!(err instanceof StationError) || err.code !== 'UNEXPECTED_SECRET') return undefined;
  const unexpected = (err.body.unexpected as string[]) ?? [];
  const expected = `Expected keys: ${((err.body.expected as string[]) ?? []).join(', ')}`;
  return {
    success: false,
    exitCode: 2,
    error: {
      message: `Unexpected ${what}(s): ${unexpected.join(', ')}`,
      // SETUP-REQ-8
      suggestion: unexpected.includes(REDIRECT_URI_KEY)
        ? `${expected}\nThe redirect URI is not a secret: the Station supplies it.`
        : expected,
    },
  };
}

/** `config <appId> …`: the system secrets of an App. */
async function systemSecrets(
  station: StationClient,
  app: AppInfo,
  args: string[],
  context: HandlerContext,
): Promise<HandlerResult> {
  const path = `/api/apps/${encodeURIComponent(app.id)}/secrets`;
  const parsed = parseArgs(args);
  if ('error' in parsed) return { success: false, exitCode: 2, error: { message: parsed.error } };

  if ('unset' in parsed) {
    const change = await station.api<Change>('PUT', path, { unset: parsed.unset });
    return removedResult(app.id, change, { appId: app.id });
  }

  const expectedKeys = app.auth.systemSecrets;
  if (expectedKeys.length === 0 && Object.keys(parsed.values).length === 0) {
    return {
      success: true,
      exitCode: 0,
      message: `App ${app.id} does not declare any system secrets.`,
    };
  }

  let provided = parsed.values;
  if (Object.keys(provided).length === 0) {
    // Interactive mode: the App's setup instructions first, then a prompt per key.
    // SETUP-REQ-5: the Station resolves them.
    if (app.auth.hasSetup) {
      const instructions = await fetchSetupInstructions(station, app.id);
      if (instructions) (context.output ?? process.stdout).write(`${instructions}\n\n`);
    }
    provided = await promptSecrets(expectedKeys, context.input, context.output);
  }

  try {
    const change = await station.api<Change>('PUT', path, { set: provided });
    return {
      success: true,
      exitCode: 0,
      message: `Configured ${change.set.length} system secret(s) for ${app.id}`,
      data: { appId: app.id, keys: change.set },
    };
  } catch (err) {
    const refused = unexpectedSecret(err, 'secret');
    if (refused) return refused;
    throw err;
  }
}

/** `config <alias> …`: the secrets of one Installation. */
async function installationSecrets(
  station: StationClient,
  instance: InstallationInfo,
  expectedKeys: string[],
  args: string[],
  context: HandlerContext,
): Promise<HandlerResult> {
  const { alias, appId } = instance;
  const path = `/api/installations/${encodeURIComponent(instance.installationId)}/secrets`;
  const parsed = parseArgs(args);
  if ('error' in parsed) return { success: false, exitCode: 2, error: { message: parsed.error } };

  if ('unset' in parsed) {
    const change = await station.api<Change>('PUT', path, { unset: parsed.unset });
    return removedResult(alias, change, { alias, appId });
  }

  if (expectedKeys.length === 0) {
    return {
      success: true,
      exitCode: 0,
      message: `App ${appId} does not declare any installation secrets.`,
    };
  }

  const provided =
    Object.keys(parsed.values).length === 0
      ? await promptSecrets(expectedKeys, context.input, context.output)
      : parsed.values;

  try {
    const change = await station.api<Change>('PUT', path, { set: provided });
    return {
      success: true,
      exitCode: 0,
      message: `Configured ${change.set.length} Installation secret(s) for ${alias} (${appId})`,
      data: { alias, appId, keys: change.set },
    };
  } catch (err) {
    const refused = unexpectedSecret(err, 'Installation secret');
    if (refused) return refused;
    throw err;
  }
}
