/**
 * Agent Apps Protocol v2.0 — lifecycle hooks.
 *
 * Lifecycle messages let apps initialize and clean up state at key moments:
 *
 * - **install** — fired once when the app is first installed in a workspace.
 *   The app can seed default data, create collections, or verify configuration.
 * - **uninstall** — fired when the app is removed from a workspace.
 *   The app can clean up external resources (webhooks, timers, temp files).
 * - **session_open** — fired each time a session is opened (after the app station
 *   creates or reuses an instance). The app can warm caches, start polling, or
 *   load per-session state.
 * - **session_close** — fired when a session is closed. The app can flush
 *   buffers, stop per-session resources, or persist final state.
 *
 * install / uninstall are control-plane messages (no sessionId — they happen
 * outside any session). session_open / session_close notifications are
 * session-plane messages (they carry a sessionId).
 *
 * The SDK exposes these as hooks on the app builder:
 *
 * ```ts
 * app.onInstall(async (ctx) => {
 *   await ctx.storage.collection('settings').put('default', { theme: 'dark' });
 * });
 * ```
 *
 * Spec: Agent Apps Protocol v2.0 — REQ-LC-1..REQ-LC-4.
 */

import { z } from 'zod';
import { HostInfoSchema, TenantSchema } from './control-plane.js';
import { MessageBaseSchema } from './envelope.js';
import { ProtocolErrorSchema } from './errors.js';
import { SessionMessageBaseSchema } from './session-plane.js';

// ============================================================================
// CONTROL PLANE — install / uninstall (host ↔ app station, no sessionId)
// ============================================================================

// --- Host → AppStation: install request ---

/**
 * Request that the app station invoke the app's `onInstall` hook for a new
 * installation. The app station spawns (or reuses) an instance, delivers the
 * hook call, and returns the result.
 */
export const InstallRequestSchema = MessageBaseSchema.extend({
  type: z.literal('install'),
  /** Installation id — unique per workspace installation of this app. */
  installationId: z.string(),
  /** Tenant context for the installation. */
  tenant: TenantSchema,
});
export type InstallRequest = z.infer<typeof InstallRequestSchema>;

// --- AppStation → Host: install result ---

/** Result of an install request. */
export const InstalledResponseSchema = MessageBaseSchema.extend({
  type: z.literal('installed'),
  /** The installation id from the request. */
  installationId: z.string(),
  /** Whether the hook completed successfully. */
  success: z.boolean(),
  /** Error message if the hook threw. */
  error: z.string().optional(),
  /** Arbitrary data returned by the hook (if any). */
  result: z.unknown().optional(),
});
export type InstalledResponse = z.infer<typeof InstalledResponseSchema>;

// --- Host → AppStation: uninstall request ---

/**
 * Request that the app station invoke the app's `onUninstall` hook before
 * removing the installation. The app station delivers the hook call to the
 * instance, waits for completion, and returns the result.
 */
export const UninstallRequestSchema = MessageBaseSchema.extend({
  type: z.literal('uninstall'),
  /** Installation id being removed. */
  installationId: z.string(),
  /** Tenant context (for resolving scoped resources). */
  tenant: TenantSchema,
});
export type UninstallRequest = z.infer<typeof UninstallRequestSchema>;

// --- AppStation → Host: uninstall result ---

/** Result of an uninstall request. */
export const UninstalledResponseSchema = MessageBaseSchema.extend({
  type: z.literal('uninstalled'),
  installationId: z.string(),
  success: z.boolean(),
  error: z.string().optional(),
  result: z.unknown().optional(),
});
export type UninstalledResponse = z.infer<typeof UninstalledResponseSchema>;

// --- Lifecycle error response (shared by install / uninstall) ---

export const InstallLifecycleErrorResponseSchema = MessageBaseSchema.extend({
  type: z.literal('error'),
  error: ProtocolErrorSchema,
});
export type InstallLifecycleErrorResponse = z.infer<typeof InstallLifecycleErrorResponseSchema>;

// --- Unions ---

export const InstallLifecycleRequestSchema = z.discriminatedUnion('type', [
  InstallRequestSchema,
  UninstallRequestSchema,
]);
export type InstallLifecycleRequest = z.infer<typeof InstallLifecycleRequestSchema>;

export const InstallLifecycleResponseSchema = z.discriminatedUnion('type', [
  InstalledResponseSchema,
  UninstalledResponseSchema,
  InstallLifecycleErrorResponseSchema,
]);
export type InstallLifecycleResponse = z.infer<typeof InstallLifecycleResponseSchema>;

// ============================================================================
// SESSION PLANE — session_opened / session_closed notifications
// (app station → instance, delivered after the session is established)
// ============================================================================
//
// These are NOT new request types — the host already sends `session_open` and
// `session_close` on the control plane. The lifecycle hooks fire on the
// *instance* side: when the app station delivers a `session_open` to the
// instance, the SDK calls `onSessionOpen`. When `session_close` (or
// `shutdown`) is delivered, the SDK calls `onSessionClose`.
//
// The SDK manages this internally — no new protocol messages are needed for
// session-level hooks. The notifications below are optional: the app station
// MAY send them to signal the instance that a lifecycle event occurred, but
// the SDK also infers them from existing session messages.
//
// We declare them so the wire format is reserved and app stations can
// eventually use them for explicit lifecycle signaling.

/**
 * Notification sent to the instance when a session has been opened.
 * The app station sends this after `session_opened` is returned to the host,
 * so the instance knows the session is fully established.
 */
export const SessionOpenedNotificationSchema = SessionMessageBaseSchema.extend({
  type: z.literal('session_opened'),
  /** Installation id for this session. */
  installationId: z.string(),
  /** Tenant context. */
  tenant: TenantSchema,
  /** The Host behind this session (HOSTCAP-REQ-2). */
  host: HostInfoSchema,
});
export type SessionOpenedNotification = z.infer<typeof SessionOpenedNotificationSchema>;

/**
 * Notification sent to the instance when a session is being closed.
 * The app station sends this before processing `session_close`, so the
 * instance can run cleanup while the session is still active.
 */
export const SessionClosedNotificationSchema = SessionMessageBaseSchema.extend({
  type: z.literal('session_closed'),
  /** Reason for closure (e.g. 'user_request', 'timeout', 'shutdown'). */
  reason: z.string().optional(),
});
export type SessionClosedNotification = z.infer<typeof SessionClosedNotificationSchema>;

export const InstallLifecycleNotificationSchema = z.discriminatedUnion('type', [
  SessionOpenedNotificationSchema,
  SessionClosedNotificationSchema,
]);
export type InstallLifecycleNotification = z.infer<typeof InstallLifecycleNotificationSchema>;
