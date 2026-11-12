/**
 * Agent Apps Protocol v2.0 — tool definitions and annotation model.
 *
 * Shared by the session plane (tool_call / tools_list) and the SDK
 * (tool registration). Annotations carry MCP standard hints plus
 * platform-specific metadata.
 */

import { z } from 'zod';

// --------------------------------------------------------------------------
// JSON Schema
// --------------------------------------------------------------------------

/** JSON Schema for tool parameters. */
export const JsonSchemaSchema: z.ZodType<Record<string, unknown>> = z.record(
  z.string(),
  z.unknown(),
);

// --------------------------------------------------------------------------
// Annotations
// --------------------------------------------------------------------------

/**
 * Tool annotations: MCP standard hints + platform metadata.
 *
 * MCP hints (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`)
 * are emitted as standard MCP `ToolAnnotations`.
 * Platform fields (`version`, `stability`, `deprecationMessage`, `irreversible`)
 * ride as extension metadata.
 */
export const ToolAnnotationsSchema = z.object({
  /** Semver-like string (e.g. '1.0.0'). Informational. */
  version: z.string().optional(),
  /** Stability signal. Clients MAY down-rank 'experimental' / 'deprecated'. */
  stability: z.enum(['experimental', 'stable', 'deprecated']).optional(),
  /** Human-readable deprecation note suggesting a replacement. */
  deprecationMessage: z.string().optional(),
  /**
   * Binary irreversibility marker. When `true`, UIs SHOULD render a
   * confirmation indicator during permission prompts. `optional()` without
   * `.default(false)` deliberately — all call sites use `?? false`.
   */
  irreversible: z.boolean().optional(),

  /**
   * Whether the tool is sensitive — the author's DEFAULT stance on whether a
   * call should pause for confirmation. This is a default, not a hard rule:
   * each installation can override it per tool (allow / ask / deny). E.g. a
   * `send-email` tool marked `sensitive: true` defaults to asking, but an
   * installation may relax it to allow for one identity and keep asking for
   * another.
   *
   * - `true`: defaults to `ask` (pause for confirmation) — declare on tools
   *   that write, delete, spend, send, or otherwise have side effects.
   * - `false`: defaults to `allow` (run without a prompt) — read-only / benign.
   *
   * Declarative only — the author sets it explicitly (no inference from names
   * or other hints). The field is optional while it rolls out: only an explicit
   * `true` forces the ask default, so unset tools keep today's behavior. The
   * migration seeds a concrete value on every tool (unknowns → `true`,
   * conservative), after which the field becomes required.
   */
  sensitive: z.boolean().optional(),

  // MCP canonical annotations (aligned with MCP spec ToolAnnotations)
  /** MCP hint — tool only reads, never mutates state. */
  readOnlyHint: z.boolean().optional(),
  /** MCP hint — tool may modify or delete state irreversibly. */
  destructiveHint: z.boolean().optional(),
  /** MCP hint — repeating with same args has no extra effect. */
  idempotentHint: z.boolean().optional(),
  /** MCP hint — tool reaches external services (network). */
  openWorldHint: z.boolean().optional(),
});

export type ToolAnnotations = z.infer<typeof ToolAnnotationsSchema>;

// --------------------------------------------------------------------------
// Tool definition
// --------------------------------------------------------------------------

/** Tool definition as exposed by an agent app. */
export const ToolDefinitionSchema = z.object({
  /** Tool name (unique within the app). */
  name: z.string(),
  /** Human-readable description. */
  description: z.string(),
  /** JSON Schema for parameters. */
  parameters: z.object({
    type: z.literal('object'),
    properties: z.record(z.string(), z.unknown()),
    required: z.array(z.string()).optional(),
  }),
  /** Optional annotations (MCP hints + platform metadata). */
  annotations: ToolAnnotationsSchema.optional(),
});

export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;
