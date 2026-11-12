/**
 * Agent Apps Protocol v2.0 — error model.
 *
 * Typed error codes with retryability classification: transport and
 * lifecycle errors plus controller-protocol codes.
 * Spec: Agent Apps Protocol v2.0 — error model.
 */

import { z } from 'zod';

export const ErrorCode = {
  // -------------------------------------------------------------------------
  // Retryable — the caller may retry the operation after a short delay
  // -------------------------------------------------------------------------

  /** The request timed out before a response was received. */
  TIMEOUT: 'TIMEOUT',
  /** The transport connection to the app or app station could not be established. */
  CONNECTION_FAILED: 'CONNECTION_FAILED',
  /** The app process crashed or exited unexpectedly during a request. */
  APP_CRASHED: 'APP_CRASHED',
  /** The app or upstream API returned a rate-limit response (429). */
  RATE_LIMITED: 'RATE_LIMITED',
  /** The app is running but not yet ready to accept tool calls. */
  NOT_READY: 'NOT_READY',

  // -------------------------------------------------------------------------
  // Non-retryable — the request will fail again unless the caller changes
  // something (arguments, permissions, message format)
  // -------------------------------------------------------------------------

  /** The requested tool does not exist on this app. */
  TOOL_NOT_FOUND: 'TOOL_NOT_FOUND',
  /** The tool call arguments failed JSON Schema validation. */
  INVALID_ARGUMENTS: 'INVALID_ARGUMENTS',
  /** Authentication is missing or invalid (HTTP 401 equivalent). */
  UNAUTHORIZED: 'UNAUTHORIZED',
  /** The caller is authenticated but lacks permission for this action (HTTP 403). */
  FORBIDDEN: 'FORBIDDEN',
  /** The app's effective permissions do not include the required permission. */
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  /** An ask was not decided by its Approver before it expired (POLICY-REQ-6). */
  APPROVAL_TIMEOUT: 'APPROVAL_TIMEOUT',
  /** An unexpected internal error occurred in the app or app station. */
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  /** The message type is not recognised by the receiving party. */
  UNKNOWN_MESSAGE_TYPE: 'UNKNOWN_MESSAGE_TYPE',
  /** The message was malformed and could not be parsed or validated. */
  INVALID_MESSAGE: 'INVALID_MESSAGE',

  // -------------------------------------------------------------------------
  // AppStation protocol (v2.0) — host ↔ app station handshake and session mgmt
  // -------------------------------------------------------------------------

  /** The requested protocol version is not supported by the app station. */
  VERSION_UNSUPPORTED: 'VERSION_UNSUPPORTED',
  /** The referenced session id does not exist or has been closed. */
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  /** The installation id is not known to the app station. */
  INSTALLATION_UNKNOWN: 'INSTALLATION_UNKNOWN',
  /** The app station failed to spawn a new app instance. */
  SPAWN_FAILED: 'SPAWN_FAILED',
  /** The app station has reached its maximum number of concurrent instances. */
  CONTROLLER_AT_CAPACITY: 'CONTROLLER_AT_CAPACITY',
  /** The app station or app does not support the requested feature. */
  NOT_SUPPORTED: 'NOT_SUPPORTED',

  // -------------------------------------------------------------------------
  // Storage (v2.0 — document store requests)
  // -------------------------------------------------------------------------

  /** The host has not configured storage for this installation. */
  STORAGE_NOT_CONFIGURED: 'STORAGE_NOT_CONFIGURED',
  /** The requested collection name is invalid or does not exist. */
  STORAGE_COLLECTION_INVALID: 'STORAGE_COLLECTION_INVALID',
  /** The document exceeds the maximum allowed size. */
  STORAGE_DOCUMENT_TOO_LARGE: 'STORAGE_DOCUMENT_TOO_LARGE',
  /** The storage query was malformed or used unsupported operators. */
  STORAGE_QUERY_INVALID: 'STORAGE_QUERY_INVALID',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

const RETRYABLE: ReadonlySet<string> = new Set([
  ErrorCode.TIMEOUT,
  ErrorCode.CONNECTION_FAILED,
  ErrorCode.APP_CRASHED,
  ErrorCode.RATE_LIMITED,
  ErrorCode.NOT_READY,
  ErrorCode.SPAWN_FAILED,
  ErrorCode.CONTROLLER_AT_CAPACITY,
]);

/** Whether a caller may retry after receiving this code. */
export function isRetryableError(code: string): boolean {
  return RETRYABLE.has(code);
}

export const ProtocolErrorSchema = z.object({
  /** Machine-readable error code (see ErrorCode). */
  code: z.string(),
  /** Human-readable message. */
  message: z.string(),
  /** Additional error context. */
  details: z.unknown().optional(),
});

export type ProtocolError = z.infer<typeof ProtocolErrorSchema>;

/**
 * Structured details for PERMISSION_DENIED errors.
 *
 * Carries enough context for apps to degrade gracefully and UIs to
 * explain — never a generic failure.
 */
export const PermissionDeniedDetailsSchema = z.object({
  /** Which layer denied the request: a Manifest Permission, a Policy Rule (POLICY-REQ-5), a Host check or a Binding. */
  layer: z.enum(['permission', 'policy', 'user-permission', 'binding']),
  /** The deciding Rule's id, or `default`, when `layer` is `policy`. */
  rule: z.string().optional(),
  /** The specific permission or permission that was missing or denied. */
  permission: z.string().optional(),
  /** Human-readable explanation suitable for display. */
  reason: z.string(),
});
export type PermissionDeniedDetails = z.infer<typeof PermissionDeniedDetailsSchema>;
