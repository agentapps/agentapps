/**
 * Agent Apps Protocol v2.0 — Principals, Policies and API keys.
 *
 * @spec POLICY-REQ-1 (Principal), POLICY-REQ-2 (Policy), POLICY-REQ-3 (Rule)
 */

import { z } from 'zod';

// ----------------------------------------------------------------------------
// Permission effects
// ----------------------------------------------------------------------------

/** The three permission levels for a tool invocation. */
export const PermissionEffectSchema = z.enum(['allow', 'ask', 'deny']);
export type PermissionEffect = z.infer<typeof PermissionEffectSchema>;

// ----------------------------------------------------------------------------
// Principals, Policies and Rules (POLICY)
// ----------------------------------------------------------------------------

/** Principal id of the local admin, implicit for the CLI's embedded Host (POLICY-REQ-1). */
export const ADMIN_PRINCIPAL_ID = 'admin';

/** A matcher on one argument of a tool call (POLICY-REQ-3). */
export interface ArgMatcher {
  equals?: unknown;
  startsWith?: string;
  endsWith?: string;
  /** Glob with `*`. */
  matches?: string;
  in?: unknown[];
  /** Negates a matcher on the same argument. */
  not?: ArgMatcher;
}

export const ArgMatcherSchema: z.ZodType<ArgMatcher> = z.lazy(() =>
  z
    .object({
      equals: z.unknown().optional(),
      startsWith: z.string().optional(),
      endsWith: z.string().optional(),
      matches: z.string().optional(),
      in: z.array(z.unknown()).optional(),
      not: ArgMatcherSchema.optional(),
    })
    .strict(),
);

/** Tool Annotations a Rule can test (POLICY-REQ-4). */
export const AnnotationNameSchema = z.enum([
  'readOnlyHint',
  'destructiveHint',
  'idempotentHint',
  'openWorldHint',
  'sensitive',
]);

/**
 * A Rule's condition: either a tool Annotation being set, or matchers on
 * named top-level arguments, all of which must match (POLICY-REQ-3/4).
 */
export const RuleConditionSchema = z.union([
  z.object({ annotation: AnnotationNameSchema }).strict(),
  z.record(z.string(), ArgMatcherSchema),
]);
export type RuleCondition = z.infer<typeof RuleConditionSchema>;

/** One line of a Policy (POLICY-REQ-3). */
export const RuleSchema = z.object({
  id: z.string().min(1),
  /** App id or `*`. */
  app: z.string().min(1),
  /** Tool name or `*`. */
  tool: z.string().min(1),
  effect: PermissionEffectSchema,
  when: RuleConditionSchema.optional(),
});
export type Rule = z.infer<typeof RuleSchema>;

/** The one Policy of a Principal (POLICY-REQ-2). */
export const PolicySchema = z.object({
  principalId: z.string().min(1),
  /** Principal who answers this Policy's asks; `admin` in this version. */
  approver: z.string().min(1),
  /** Effect when no Rule matches. */
  defaultEffect: PermissionEffectSchema,
  rules: z.array(RuleSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Policy = z.infer<typeof PolicySchema>;

// ----------------------------------------------------------------------------
// API key identity
// ----------------------------------------------------------------------------

/** Identity embedded in an API key — who is acting. */
export const ApiKeyIdentitySchema = z.object({
  /** User id the key acts on behalf of. */
  userId: z.string().min(1),
  /** Optional workspace scope. When absent the key is user-global. */
  workspaceId: z.string().optional(),
});
export type ApiKeyIdentity = z.infer<typeof ApiKeyIdentitySchema>;

// ----------------------------------------------------------------------------
// API key record (stored — never contains the raw key)
// ----------------------------------------------------------------------------

/** Stored API key record. The raw key is never persisted — only its hash. */
export const ApiKeyRecordSchema = z.object({
  /** Unique key identifier. */
  id: z.string().min(1),
  /** Human-readable name for the key. */
  name: z.string().min(1),
  /** SHA-256 hash of the raw key (hex). */
  keyHash: z.string().min(1),
  /** First characters of the raw key shown for identification (e.g. "tak_abc1"). */
  prefix: z.string().min(1),
  /** Identity this key authenticates as. */
  identity: ApiKeyIdentitySchema,
  /** The Principal this key authenticates as; its Policy applies (POLICY-REQ-1). */
  principalId: z.string().min(1),
  /** Creation timestamp (ISO 8601). */
  createdAt: z.string().datetime(),
  /** Last update timestamp (ISO 8601). */
  updatedAt: z.string().datetime(),
  /** Optional expiration timestamp (ISO 8601). */
  expiresAt: z.string().datetime().optional(),
  /** Revocation timestamp (ISO 8601). Present when the key has been revoked. */
  revokedAt: z.string().datetime().optional(),
});
export type ApiKeyRecord = z.infer<typeof ApiKeyRecordSchema>;

// ----------------------------------------------------------------------------
// API key created — returned once on creation (includes raw key)
// ----------------------------------------------------------------------------

/** Response returned exactly once when a new API key is created. */
export const ApiKeyCreatedSchema = ApiKeyRecordSchema.extend({
  /** The raw API key. Shown only at creation time — never stored or returned again. */
  key: z.string().min(1),
});
export type ApiKeyCreated = z.infer<typeof ApiKeyCreatedSchema>;
