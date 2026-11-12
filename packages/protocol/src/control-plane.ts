/**
 * Agent Apps Protocol v2.0 — control plane (host ↔ app station).
 *
 * Handshake, tenant sessions, aggregated health, event-gap signaling.
 * Spec: docs/specs/agent-apps/controller-protocol.md — REQ-2..REQ-12.
 */

import { z } from 'zod';
import { MessageBaseSchema } from './envelope.js';
import { ProtocolErrorSchema } from './errors.js';
import { EffectivePermissionsSchema } from './session-plane.js';

// ----------------------------------------------------------------------------
// Shared shapes
// ----------------------------------------------------------------------------

export const TenantSchema = z.object({
  userId: z.string(),
  workspaceId: z.string().optional(),
});
export type Tenant = z.infer<typeof TenantSchema>;

export const InstanceStatusSchema = z.enum([
  'starting',
  'ready',
  'idle_stopped',
  'crashed',
  'restarted',
]);
export type InstanceStatus = z.infer<typeof InstanceStatusSchema>;

/** AppStation capabilities advertised at handshake (REQ-2, REQ-9, REQ-11). */
export const ControllerCapabilitiesSchema = z.object({
  /** Reserved — MUST be false in v1 (REQ-9). */
  directConnection: z.boolean(),
  /** Reserved — MUST be false in v1 (REQ-9). */
  asyncOpen: z.boolean(),
  /** false ⇒ binding cannot push; host degrades to polling (REQ-11). */
  push: z.boolean(),
  /** Negotiated extension ids, e.g. 'hooks', 'storage', 'intents'. */
  extensions: z.array(z.string()),
});
export type StationCapabilities = z.infer<typeof ControllerCapabilitiesSchema>;

// ----------------------------------------------------------------------------
// Host → AppStation
// ----------------------------------------------------------------------------

/**
 * Host Capabilities: the protocol features a Host declares at `initialize`.
 * Every feature is optional; an omitted field means the Host does not
 * support it. Unknown fields are dropped.
 *
 * @spec HOSTCAP-REQ-1
 */
export const HostCapabilitiesSchema = z.object({
  /** Reserved: MUST be false. */
  directConnection: z.literal(false),
  ui: z
    .object({
      /** Draws declarative UI Components; an array lists the standard types it draws. */
      components: z.union([z.boolean(), z.array(z.string())]).optional(),
      /** Loads app-defined UI Component bundles. */
      appComponents: z.boolean().optional(),
      /** Opens Screens. */
      screens: z.boolean().optional(),
    })
    .optional(),
  /** Serves more than one Tenant on one connection (HOSTCAP-REQ-6). */
  multiUser: z.boolean().optional(),
  /** Accepts unsolicited `subscription_event` messages. */
  push: z.boolean().optional(),
  /** Prompt types a human can answer. */
  prompts: z.array(z.enum(['auth', 'secret', 'url'])).optional(),
  /** Answers `storage_*` Requests. */
  storage: z.boolean().optional(),
  /** Answers `object_*` Requests and serves object URLs. */
  objects: z.boolean().optional(),
  /** Answers `file_volume_*` Requests. */
  volume: z.boolean().optional(),
  /** Answers `get_user_profile`. */
  profile: z.boolean().optional(),
  /** Routes `intent_call` through Bindings. */
  intents: z.boolean().optional(),
  /** Hook points the Host fires and the HOOK-REQ-3 `supports` map. */
  hooks: z
    .object({
      points: z.array(z.string()),
      supports: z.record(z.string(), z.boolean()),
    })
    .optional(),
});
export type HostCapabilities = z.infer<typeof HostCapabilitiesSchema>;

/** The Host as relayed to an Instance (HOSTCAP-REQ-2). */
export const HostInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  capabilities: HostCapabilitiesSchema.omit({ directConnection: true }),
});
export type HostInfo = z.infer<typeof HostInfoSchema>;

export const InitializeRequestSchema = MessageBaseSchema.extend({
  type: z.literal('initialize'),
  supportedVersions: z.array(z.string()),
  host: z.object({
    name: z.string(),
    version: z.string(),
  }),
  capabilities: HostCapabilitiesSchema,
});
export type InitializeRequest = z.infer<typeof InitializeRequestSchema>;

export const SessionOpenRequestSchema = MessageBaseSchema.extend({
  type: z.literal('session_open'),
  installationId: z.string(),
  tenant: TenantSchema,
  /**
   * The Installation's Effective Permissions, so the Station can decide at
   * spawn whether to provide the Volume mount (VOL-REQ-2, VOL-REQ-5).
   */
  effectivePermissions: EffectivePermissionsSchema.optional(),
});
export type SessionOpenRequest = z.infer<typeof SessionOpenRequestSchema>;

export const SessionCloseRequestSchema = MessageBaseSchema.extend({
  type: z.literal('session_close'),
  sessionId: z.string(),
  reason: z.string().optional(),
});
export type SessionCloseRequest = z.infer<typeof SessionCloseRequestSchema>;

export const ControllerHealthRequestSchema = MessageBaseSchema.extend({
  type: z.literal('controller_health'),
  /** Full instance list, debugging only (REQ-8). */
  verbose: z.boolean().optional(),
});
export type ControllerHealthRequest = z.infer<typeof ControllerHealthRequestSchema>;

export const ControlPlaneRequestSchema = z.discriminatedUnion('type', [
  InitializeRequestSchema,
  SessionOpenRequestSchema,
  SessionCloseRequestSchema,
  ControllerHealthRequestSchema,
]);
export type ControlPlaneRequest = z.infer<typeof ControlPlaneRequestSchema>;

// ----------------------------------------------------------------------------
// AppStation → Host: responses
// ----------------------------------------------------------------------------

export const InitializedResponseSchema = MessageBaseSchema.extend({
  type: z.literal('initialized'),
  negotiatedVersion: z.string(),
  app: z.object({
    id: z.string(),
    version: z.string(),
  }),
  station: z.object({
    version: z.string(),
  }),
  capabilities: ControllerCapabilitiesSchema,
  limits: z.object({
    openTimeoutMs: z.number(),
    maxInflightPerSession: z.number(),
  }),
});
export type InitializedResponse = z.infer<typeof InitializedResponseSchema>;

export const SessionOpenedResponseSchema = MessageBaseSchema.extend({
  type: z.literal('session_opened'),
  sessionId: z.string(),
  instance: z.object({
    appVersion: z.string(),
  }),
  /** The Host behind this connection, as it declared itself at initialize (HOSTCAP-REQ-2). */
  host: HostInfoSchema,
  /** Effective permissions for this installation (R9 snapshot — 5.1). Informational only. */
  effectivePermissions: EffectivePermissionsSchema.optional(),
});
export type SessionOpenedResponse = z.infer<typeof SessionOpenedResponseSchema>;

export const SessionClosedResponseSchema = MessageBaseSchema.extend({
  type: z.literal('session_closed'),
  sessionId: z.string(),
});
export type SessionClosedResponse = z.infer<typeof SessionClosedResponseSchema>;

export const InstanceHealthSummarySchema = z.object({
  instanceId: z.string(),
  /** Installation served, or 'shared' for standalone/cluster instances. */
  installationId: z.string(),
  status: z.string(),
  /** Uptime in seconds. */
  uptime: z.number(),
  /** ISO 8601. */
  lastUsed: z.string(),
});
export type InstanceHealthSummary = z.infer<typeof InstanceHealthSummarySchema>;

export const ControllerHealthStatusResponseSchema = MessageBaseSchema.extend({
  type: z.literal('controller_health_status'),
  status: z.enum(['ready', 'degraded']),
  counts: z.object({
    total: z.number(),
    ready: z.number(),
    degraded: z.number(),
    crashed: z.number(),
    starting: z.number(),
  }),
  /** Detail for unhealthy instances only, capped at 50 (REQ-8). */
  unhealthy: z.array(InstanceHealthSummarySchema),
  /** Full list — only present when requested with verbose: true. */
  instances: z.array(InstanceHealthSummarySchema).optional(),
});
export type ControllerHealthStatusResponse = z.infer<typeof ControllerHealthStatusResponseSchema>;

export const ErrorResponseSchema = MessageBaseSchema.extend({
  type: z.literal('error'),
  error: ProtocolErrorSchema,
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export const ControlPlaneResponseSchema = z.discriminatedUnion('type', [
  InitializedResponseSchema,
  SessionOpenedResponseSchema,
  SessionClosedResponseSchema,
  ControllerHealthStatusResponseSchema,
  ErrorResponseSchema,
]);
export type ControlPlaneResponse = z.infer<typeof ControlPlaneResponseSchema>;

// ----------------------------------------------------------------------------
// AppStation → Host: notifications (unsolicited)
// ----------------------------------------------------------------------------

export const SessionStatusNotificationSchema = MessageBaseSchema.extend({
  type: z.literal('session_status'),
  sessionId: z.string(),
  status: InstanceStatusSchema,
});
export type SessionStatusNotification = z.infer<typeof SessionStatusNotificationSchema>;

/** Buffered-event loss signal after disconnect (REQ-12). */
export const EventsGapNotificationSchema = MessageBaseSchema.extend({
  type: z.literal('events_gap'),
  droppedCount: z.number(),
  /** ISO 8601 timestamp of the oldest dropped event. */
  oldestDroppedAt: z.string(),
});
export type EventsGapNotification = z.infer<typeof EventsGapNotificationSchema>;

export const ControlPlaneNotificationSchema = z.discriminatedUnion('type', [
  SessionStatusNotificationSchema,
  EventsGapNotificationSchema,
]);
export type ControlPlaneNotification = z.infer<typeof ControlPlaneNotificationSchema>;

// ----------------------------------------------------------------------------
// Reserved message types (REQ-9) — declared so they are never repurposed.
// ----------------------------------------------------------------------------

export const RESERVED_MESSAGE_TYPES = [
  'connection_upgrade',
  'connection_upgrade_result',
  'session_opening',
] as const;
