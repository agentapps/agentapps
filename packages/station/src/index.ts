/**
 * @agentapps/station — the Agent Apps Station.
 *
 * Central server: brokers tenant sessions, proxies traffic, and owns
 * instance lifecycle — spawn on first session, idle teardown (default
 * 30 min) — behind runtime adapters (in-process / local process).
 */

export { PROTOCOL_VERSION } from '@agentapps/protocol';

/** Default idle timeout before an on-demand instance is torn down (ms). */
export const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

// Auth & permissions
export {
  type ApiKeyStore,
  generateApiKey,
  hashApiKey,
  InMemoryApiKeyStore,
} from './api-key-store.js';
// Core
export { AppStation, type AppStationConfig } from './app-station.js';
export {
  ApprovalManager,
  type ApprovalOutcome,
  DEFAULT_APPROVAL_TIMEOUT_MS,
  type PendingApprovalInfo,
} from './approval-manager.js';
// Storage (document store)
export {
  type DocumentStore,
  FileDocumentStore,
  handleStorageRequest,
  InMemoryDocumentStore,
  pageDocuments,
  STORAGE_DEFAULT_LIMIT,
  STORAGE_MAX_LIMIT,
  type StoragePage,
  type StorageQuery,
} from './document-store.js';
// Objects (immutable blobs with a URL) + signed temporary links
export {
  generateObjectId,
  handleObjectRequest,
  type ObjectRequestScope,
  type ObjectServeResult,
  ObjectStore,
  type ObjectStoreOptions,
  type StoredObjectMeta,
  toObjectInfo,
} from './file-handlers/object-store.js';
export {
  createObjectLinkToken,
  getStationSecret,
  type ObjectLinkPayload,
  type ObjectLinkValidationResult,
  validateObjectLinkToken,
} from './file-handlers/signed-url.js';
// Volume storage handlers
export {
  buildVolumeRoot,
  getVolumesBasePath,
  handleVolumeRequest,
  resolveMountPath,
  resolveVolumePath,
  VOLUME_REQUEST_TYPES,
  type VolumeHandlerContext,
  volumeMkdir,
} from './file-handlers/volume-handlers.js';
// Runtime adapters
export {
  type AppFactory,
  InProcessRuntime,
  type InstanceEnvironment,
} from './in-process-runtime.js';
export {
  LocalProcessRuntime,
  type LocalProcessRuntimeOptions,
} from './local-process-runtime.js';
// OAuth
export {
  type OAuthCallbackResult,
  OAuthManager,
  type OAuthStartParams,
  type OAuthTokens,
} from './oauth-manager.js';
export {
  defaultPolicy,
  evaluatePolicy,
  type PolicyDecision,
  type ToolCallFacts,
} from './permission-enforcer.js';
export { InMemoryPolicyStore, type PolicyStore, policyFor } from './policy-store.js';
// Secrets manager
export type { SecretsContext, SecretsManager } from './secrets-manager.js';
// Server
export {
  type AppEntry,
  type ServerInfo,
  type StationEndpoint,
  StationServer,
  type StationServerOptions,
  serve,
} from './server.js';
// Telemetry
export {
  NOOP_TELEMETRY,
  NoopTelemetryProvider,
  type SpanHandle,
  type TelemetryAttributes,
  type TelemetryProvider,
} from './telemetry.js';
// Types
export type { InstanceHandle, RuntimeAdapter, SpawnConfig } from './types.js';
