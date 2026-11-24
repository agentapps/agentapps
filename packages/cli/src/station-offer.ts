/**
 * @agentapps/cli — what the interactive mode does when its Station is not
 * running: it says so, and for a Station on this machine it offers to start
 * it and leave it running. A one-shot command never starts one.
 */

import { handleStation } from './commands/station.js';
import { cliStationUrl, isLocalStationUrl } from './station-url.js';
import type { CliContext, GlobalOptions } from './types.js';

/**
 * Whether a Station answers at a URL.
 *
 * @spec CLIENT-REQ-6
 */
export async function stationAnswers(stationUrl: string, timeoutMs = 2_000): Promise<boolean> {
  try {
    const res = await fetch(`${stationUrl}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Read one line from a stream and leave whatever follows it unread. */
function takeLine(input: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve) => {
    let buffer = '';
    const done = (line: string): void => {
      input.off('data', onData);
      input.off('end', onEnd);
      input.pause();
      resolve(line.trim());
    };
    const onData = (chunk: Buffer | string): void => {
      buffer += chunk.toString();
      const end = buffer.indexOf('\n');
      if (end < 0) return;
      const rest = buffer.slice(end + 1);
      // Stop listening before handing the rest back, or it would be read again here.
      done(buffer.slice(0, end));
      if (rest) (input as NodeJS.ReadStream).unshift(Buffer.from(rest));
    };
    const onEnd = (): void => done(buffer);
    input.on('data', onData);
    input.once('end', onEnd);
    input.resume();
  });
}

/**
 * On entering the interactive mode: when the Station of this machine is not
 * running, ask whether to start it and leave it running; when a Station
 * elsewhere cannot be reached, say so and offer nothing.
 *
 * @spec CLIENT-REQ-6
 */
export async function offerStation(context: {
  ctx: CliContext;
  options: GlobalOptions;
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
}): Promise<void> {
  const { ctx, options, input, output } = context;
  const url = cliStationUrl(ctx.config);
  // A workspace that names no Station is told by the first command that needs one.
  if (typeof url !== 'string') return;
  if (await stationAnswers(url)) return;

  if (!isLocalStationUrl(url)) {
    output.write(`Cannot connect to the Station at ${url}.\n`);
    return;
  }

  output.write(`The Station is not running at ${url}.\n`);
  output.write('Start it and leave it running? [y/N] ');
  const answer = await takeLine(input);
  if (!/^y(es)?$/i.test(answer)) {
    output.write('Not started. Commands that need it will say so; start it with: station start\n');
    return;
  }

  const started = await handleStation({ type: 'station', action: 'start' }, { ctx, options });
  if (!started.success) {
    output.write(`${started.error?.message ?? 'The Station did not start.'}\n`);
    if (started.error?.suggestion) output.write(`${started.error.suggestion}\n`);
    return;
  }
  output.write(`${started.message ?? 'Station started.'} It keeps running after you leave.\n`);
  if (!(await stationAnswers(url))) {
    const block = ctx.config.station;
    output.write(
      `It listens on port ${block?.port ?? 4100} (the "station" block), but nothing answers at ${url} (cli.stationUrl). ` +
        'Make the two agree: station use <url>\n',
    );
  }
}
