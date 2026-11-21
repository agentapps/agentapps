/**
 * Compliance Filter — conversation hook example.
 *
 * - `pre-turn` scans the user's message and vetoes it when it contains PII
 *   (SSN, credit card, email, US phone).
 * - `post-turn` audits each completed turn's response and logs whether it
 *   carried PII.
 *
 * This is an example app — the PII detection is intentionally simple
 * (regex patterns). A production compliance filter would use a proper
 * NLP/ML pipeline.
 */

import { createApp } from '@agentapps/sdk';

// ---------------------------------------------------------------------------
// PII detection (simplified for demo purposes)
// ---------------------------------------------------------------------------

interface PiiMatch {
  type: string;
  pattern: string;
  value: string;
}

const PII_PATTERNS: Array<{ type: string; regex: RegExp }> = [
  { type: 'SSN', regex: /\b\d{3}-\d{2}-\d{4}\b/ },
  { type: 'CREDIT_CARD', regex: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/ },
  { type: 'EMAIL', regex: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/ },
  { type: 'PHONE_US', regex: /\b\(\d{3}\)\s?\d{3}-\d{4}\b/ },
];

function detectPii(text: string): PiiMatch[] {
  if (typeof text !== 'string') return [];
  const matches: PiiMatch[] = [];
  for (const { type, regex } of PII_PATTERNS) {
    const match = regex.exec(text);
    if (match) {
      matches.push({ type, pattern: regex.source, value: match[0] });
    }
  }
  return matches;
}

// ---------------------------------------------------------------------------
// Create the app
// ---------------------------------------------------------------------------

const app = createApp({
  id: 'app.compliance-filter',
  version: '1.0.0',
  name: 'Compliance Filter',
  description: 'Scans messages for PII and blocks them before they reach the agent.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  category: 'compliance',
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/main.ts'] },
  permissions: {
    hooksVeto: true,
    hooksConversation: true,
  },
});

// ---------------------------------------------------------------------------
// Hook: pre-turn — veto user messages that carry PII (HOOK-REQ-15)
// ---------------------------------------------------------------------------

app.hook('pre-turn', {
  description: 'Block messages that contain PII (SSN, credit card, email, phone)',
  timeoutMs: 200,
  handler: ({ input, execution, log }) => {
    const piiMatches = detectPii(input.message.text);
    log('info', `PII scan: ${piiMatches.length > 0 ? `${piiMatches.length} match(es)` : 'clean'}`, {
      userId: execution.userId,
      matchCount: piiMatches.length,
    });
    if (piiMatches.length === 0) return {};
    const types = piiMatches.map((m) => m.type).join(', ');
    return {
      veto: {
        reason: `Message contains personally identifiable information (${types}). Please remove PII before sending.`,
        code: 'PII_DETECTED',
      },
    };
  },
});

// ---------------------------------------------------------------------------
// Hook: post-turn — audit each completed turn (needs hooksConversation)
// ---------------------------------------------------------------------------

app.hook('post-turn', {
  description: 'Audit agent responses for compliance logging',
  handler: ({ input, log }) => {
    const piiMatches = detectPii(input.response);
    log('info', 'Response audited', {
      conversationId: input.conversationId,
      turnId: input.turnId,
      responsePiiDetected: piiMatches.length > 0,
    });
  },
});

// ---------------------------------------------------------------------------
// Tool: check-text — manual PII scanning tool
// ---------------------------------------------------------------------------

app.tool('check-text', {
  description: 'Scan a text string for PII patterns. Returns detected PII types.',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Text to scan for PII' },
    },
    required: ['text'],
  },
  annotations: { readOnlyHint: true },
  handler: async (args) => {
    const matches = detectPii(args.text as string);
    return {
      clean: matches.length === 0,
      matches: matches.map((m) => ({ type: m.type, value: '[REDACTED]' })),
      matchCount: matches.length,
    };
  },
});

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const factory = app.toFactory();
export const manifest = app.toManifest();
export default factory;

// Export for testing
export { detectPii };
