/**
 * @agentapps/cli — the CLI's connection to a Station, and the Apps it offers.
 *
 *   station use <url>             which Station the CLI talks to
 *   station login                 store an API Key for it
 *   station logout                remove that key
 *   station apps                  the Apps available on it
 *   station apps add <source>     make an App available (Station Operator)
 *   station apps remove <app-id>  stop offering it (Station Operator)
 */

import { setCliStationUrl } from '../config.js';
import { promptSecret } from '../secret-prompt.js';
import {
  isResult,
  removeStationLogin,
  StationClient,
  StationError,
  saveStationLogin,
  stationCredential,
  stationOf,
} from '../station-client.js';
import { cliStationUrl } from '../station-url.js';
import type { HandlerResult, ReplCommand, ResultValue } from '../types.js';
import type { HandlerContext } from './types.js';

/**
 * `station use <url>`: write the Station the CLI connects to. It contacts
 * nobody and changes nothing else in the workspace config.
 *
 * @spec CLIENT-REQ-9
 */
export async function handleStationUse(
  command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  if (command.type !== 'station-use') {
    return { success: false, exitCode: 2, error: { message: 'Internal error' } };
  }
  let parsed: URL | undefined;
  try {
    parsed = new URL(command.url);
  } catch {
    parsed = undefined;
  }
  if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
    return {
      success: false,
      exitCode: 2,
      error: {
        message: `Not an http or https URL: ${command.url}`,
        suggestion: 'For example: station use http://localhost:4100',
      },
    };
  }
  const url = command.url.replace(/\/+$/, '');
  const { ctx } = context;
  setCliStationUrl(ctx.configPath, url);
  ctx.config = { ...ctx.config, cli: { ...ctx.config.cli, stationUrl: url } };

  const credential = stationCredential(ctx.configPath, url);
  const using =
    credential?.kind === 'login'
      ? 'It will use the key stored by station login.'
      : credential?.kind === 'admin'
        ? 'It will use the admin credential of the Station this workspace started.'
        : 'There is no credential for it yet. Store one with:\n  agentapps station login';
  return {
    success: true,
    exitCode: 0,
    message: `The CLI now connects to ${url}.\n${using}`,
  };
}

/**
 * `station login`: ask for an API Key of the Station the CLI points at, check
 * it against that Station and keep it. The key is never an argument and is
 * never printed; the workspace config is not changed.
 *
 * @spec CLIENT-REQ-8
 */
export async function handleStationLogin(
  command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  if (command.type !== 'station-login') {
    return { success: false, exitCode: 2, error: { message: 'Internal error' } };
  }
  const { ctx } = context;
  const url = cliStationUrl(ctx.config);
  if (typeof url !== 'string') return url;

  const key = (
    await promptSecret(context.input ?? process.stdin, context.output ?? process.stdout, 'API key')
  ).trim();
  if (!key) {
    return { success: false, exitCode: 2, error: { message: 'No API key was given.' } };
  }

  const station = StationClient.at(url, ctx.configPath);
  try {
    const who = await station.whoami(key);
    saveStationLogin(ctx.configPath, url, key);
    return {
      success: true,
      exitCode: 0,
      message: `Logged in to ${url} as ${who.principalId} (${who.role}).`,
    };
  } catch (err) {
    if (err instanceof StationError) {
      return {
        success: false,
        exitCode: 2,
        error: { message: `The Station at ${url} did not accept that key. Nothing was stored.` },
      };
    }
    return station.failure(err);
  }
}

/** `station logout`: remove the key stored for the Station the CLI points at. @spec CLIENT-REQ-8 */
export async function handleStationLogout(
  command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  if (command.type !== 'station-logout') {
    return { success: false, exitCode: 2, error: { message: 'Internal error' } };
  }
  const { ctx } = context;
  const url = cliStationUrl(ctx.config);
  if (typeof url !== 'string') return url;
  const removed = removeStationLogin(ctx.configPath, url);
  return {
    success: true,
    exitCode: 0,
    message: removed
      ? `Logged out of ${url}: the stored key was removed.`
      : `There was no key stored for ${url}.`,
  };
}

interface AvailableApp {
  id: string;
  name: string;
  version: string;
  source?: string;
  installations?: number;
  systemSecretsMissing?: string[];
}

/**
 * `station apps [add <source> | remove <app-id>]`
 *
 * @spec STADMIN-REQ-9
 */
export async function handleStationApps(
  command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  if (command.type !== 'station-apps') {
    return { success: false, exitCode: 2, error: { message: 'Internal error' } };
  }
  const station = stationOf(context);
  if (isResult(station)) return station;

  try {
    if (command.action === 'add') {
      const added = await station.api<{ id: string; version: string }>('POST', '/api/apps', {
        source: command.target,
      });
      return {
        success: true,
        exitCode: 0,
        message: `${added.id} ${added.version} is now available. Install it with: install ${added.id} <alias>`,
      };
    }
    if (command.action === 'remove') {
      await station.api('DELETE', `/api/apps/${encodeURIComponent(command.target ?? '')}`);
      return { success: true, exitCode: 0, message: `${command.target} is no longer available.` };
    }

    const { apps } = await station.api<{ apps: AvailableApp[] }>('GET', '/api/apps');
    if (apps.length === 0) {
      return {
        success: true,
        exitCode: 0,
        message: 'No apps are available on this Station.',
        data: { hint: 'Add one with: station apps add <source>' },
      };
    }
    return {
      success: true,
      exitCode: 0,
      data: apps.map((a) => ({
        'App ID': a.id,
        Version: a.version,
        ...(a.installations !== undefined ? { Installations: a.installations } : {}),
        ...(a.systemSecretsMissing !== undefined
          ? { 'Missing secrets': a.systemSecretsMissing.join(', ') || '—' }
          : {}),
      })) as unknown as ResultValue,
      message: `${apps.length} app${apps.length === 1 ? '' : 's'} available`,
    };
  } catch (err) {
    if (err instanceof StationError && err.code === 'APP_NOT_FOUND') {
      return { success: false, exitCode: 2, error: { message: err.message } };
    }
    if (err instanceof StationError && err.code === 'APP_IN_USE') {
      return {
        success: false,
        exitCode: 2,
        error: { message: err.message, suggestion: 'See them with: installations' },
      };
    }
    return station.failure(err);
  }
}
