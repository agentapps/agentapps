/**
 * @agentapps/cli — tools command.
 *
 * Lists the tools of an Installation, as the Station shows them to the caller.
 */

import { isResult, stationOf } from '../station-client.js';
import { findInstallation, unknownAlias, withSession } from '../station-session.js';
import { writeCachedTools } from '../tools-cache.js';
import type { HandlerResult, ReplCommand } from '../types.js';
import { formatUsage } from './tool.js';
import type { HandlerContext } from './types.js';

/** @spec CLIENT-REQ-1 */
export async function handleTools(
  command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  if (command.type !== 'tools') {
    return {
      success: false,
      exitCode: 2,
      error: { message: 'Internal error: expected tools command' },
    };
  }

  const { alias } = command;
  const { ctx, options } = context;
  const station = stationOf(context);
  if (isResult(station)) return station;

  try {
    const instance = await findInstallation(station, alias);
    if (!instance) return unknownAlias(alias);

    const tools = await withSession(station, instance, context.sessions, (session) =>
      session.listTools(),
    );
    writeCachedTools(ctx.configPath, instance.appId, tools as never);
    const message = `${tools.length} tool${tools.length === 1 ? '' : 's'} available`;

    if (options.verbose) {
      return {
        success: true,
        data: tools.map((tool) => ({
          name: tool.name,
          description: tool.description ?? '',
          parameters: formatParameters(tool.parameters),
        })),
        message,
        exitCode: 0,
      };
    }

    return {
      success: true,
      data: tools.map((tool) => ({
        Tool: tool.name,
        Parameters: formatUsage(tool.parameters) || '—',
        Description: tool.description ?? '',
      })),
      layout: 'entries',
      message,
      exitCode: 0,
    };
  } catch (err) {
    return station.failure(err);
  }
}

function formatParameters(params?: Record<string, unknown>): Record<string, string> {
  if (!params) return { '(none)': '' };
  const properties = params.properties as Record<string, Record<string, unknown>> | undefined;
  const required = new Set((params.required as string[]) ?? []);
  if (!properties || Object.keys(properties).length === 0) return { '(none)': '' };

  const result: Record<string, string> = {};
  for (const [key, schema] of Object.entries(properties)) {
    const type = (schema.type as string) ?? 'any';
    const req = required.has(key) ? 'required' : 'optional';
    const desc = (schema.description as string) ?? '';
    result[key] = `${type.padEnd(8)} ${req.padEnd(8)} ${desc}`;
  }
  return result;
}
