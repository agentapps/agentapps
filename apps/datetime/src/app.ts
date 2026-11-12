/**
 * Date & Time — conversation hook example.
 *
 * Adds the current date, time and timezone to every turn at `pre-turn`, so
 * the model always knows "now". It needs no network and no history; the block
 * is small and sits in the uncached tail of the prompt.
 */

import { createApp } from '@agentapps/sdk';

const app = createApp({
  id: 'app.datetime',
  version: '1.0.0',
  name: 'Date & Time',
  description: 'Tells the model the current date, time and timezone on every turn.',
  author: { name: 'Pablo Lopez Torres', email: 'pablolopeztorres@gmail.com' },
  category: 'samples',
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
  permissions: { hooksContext: true },
});

/** `Thursday, 8 October 2026 at 10:42 (Europe/Madrid, UTC+02:00)` in the user's locale. */
export function formatNow(now: string, timezone = 'UTC', locale = 'en-GB'): string {
  const date = new Date(now);
  const text = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  }).format(date);
  const offset =
    new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longOffset' })
      .formatToParts(date)
      .find((p) => p.type === 'timeZoneName')
      ?.value.replace('GMT', 'UTC') ?? 'UTC';
  return `${text} (${timezone}, ${offset === 'UTC' ? 'UTC+00:00' : offset})`;
}

app.hook('pre-turn', {
  description: 'Current date, time and timezone',
  maxTokens: 40,
  timeoutMs: 50,
  handler: ({ input }) => ({
    context: [{ label: 'Current time', text: formatNow(input.now, input.timezone, input.locale) }],
  }),
});

export const factory = app.toFactory();
export const manifest = app.toManifest();
export default factory;
