/**
 * Hello Agent App — minimal example of the @agentapps/sdk.
 *
 * This file is the entire app. It demonstrates:
 * - Tool registration with typed parameters
 * - Health check with secrets validation
 * - Progress reporting during long operations
 * - Structured logging
 * - Abort signal (cancellation support)
 *
 * Export `factory` to wire this app into any runtime (in-process, Docker, etc.).
 */

import { createApp } from '@agentapps/sdk';

// ---------------------------------------------------------------------------
// Create the app
// ---------------------------------------------------------------------------

const app = createApp({
  id: 'app.hello',
  version: '1.0.1',
  name: 'Hello',
  description:
    'Minimal example app with greet and countdown tools. Demonstrates tools, health checks, progress reporting, and cancellation.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  category: 'samples',
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
});

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

/** Simple greeting tool — takes a name and optional language. */
app.tool('greet', {
  description: 'Greet a person by name. Returns a personalized greeting message.',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Name of the person to greet',
      },
      language: {
        type: 'string',
        description: 'Language for the greeting (default: "en")',
      },
    },
    required: ['name'],
  },
  annotations: { readOnlyHint: true },
  handler: async (args, ctx) => {
    ctx.log('info', `Greeting ${args.name}`, {
      language: args.language ?? 'en',
    });

    const greetings: Record<string, string> = {
      en: 'Hello',
      es: 'Hola',
      fr: 'Bonjour',
      de: 'Hallo',
      ja: 'こんにちは',
    };

    const lang = (args.language as string) ?? 'en';
    const prefix = greetings[lang] ?? greetings.en;
    return { message: `${prefix}, ${args.name}!` };
  },
});

/**
 * Countdown tool — demonstrates progress reporting and cancellation.
 * Counts down from N to 0, reporting progress each step.
 */
app.tool('countdown', {
  description:
    'Count down from a number, reporting progress. Use to demonstrate streaming progress and cancellation.',
  parameters: {
    type: 'object',
    properties: {
      from: {
        type: 'number',
        description: 'Number to count down from (max 100)',
      },
      delayMs: {
        type: 'number',
        description: 'Delay between steps in ms (default: 100)',
      },
    },
    required: ['from'],
  },
  handler: async (args, ctx) => {
    const total = Math.min((args.from as number) ?? 10, 100);
    const delay = (args.delayMs as number) ?? 100;

    ctx.log('info', `Starting countdown from ${total}`);

    for (let i = total; i > 0; i--) {
      // Check for cancellation
      if (ctx.signal.aborted) {
        ctx.log('warn', `Countdown cancelled at ${i}`);
        return { cancelled: true, stoppedAt: i };
      }

      const progress = Math.round(((total - i) / total) * 100);
      ctx.progress(progress, `${i} remaining...`);
      ctx.stream(`${i}... `);

      await new Promise((r) => setTimeout(r, delay));
    }

    ctx.progress(100, 'Done!');
    ctx.stream('0! 🎉', true);

    return { completed: true, from: total };
  },
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.health(async (ctx) => {
  // In a real app, you'd check external dependencies here
  ctx.log('debug', 'Running health check');

  // Example: verify that required secrets exist
  try {
    const secrets = await ctx.secrets.getSystem();
    if (!secrets?.HELLO_API_KEY) {
      return {
        status: 'not_ready',
        message: 'Missing HELLO_API_KEY system secret',
        issues: [
          {
            code: 'MISSING_SECRET',
            message: 'HELLO_API_KEY is required but not configured',
            severity: 'error' as const,
          },
        ],
      };
    }
    return { status: 'ready', message: 'All systems go' };
  } catch {
    // Secrets not available — still healthy, just without API access
    return { status: 'ready', message: 'Running without secrets' };
  }
});

// ---------------------------------------------------------------------------
// Export factory
// ---------------------------------------------------------------------------

export const factory = app.toFactory();
export default factory;
