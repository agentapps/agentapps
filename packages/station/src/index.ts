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
export {
  type DataStore,
  type DocumentsStore,
  InMemoryDataStore,
  type InstallationDataScope,
  LocalDataStore,
  type LocalDataStoreOptions,
} from './data-store.js';
export { type DataStoreContractCase, dataStoreContract } from './data-store-contract.js';
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
  InMemoryObjectsStore,
  LocalObjectsStore,
  type ObjectRequestScope,
  type ObjectScope,
  type ObjectServeResult,
  ObjectStore,
  type ObjectStoreOptions,
  type ObjectsStore,
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
  InMemoryVolumeStore,
  LocalVolumeStore,
  resolveMountPath,
  resolveVolumePath,
  VOLUME_REQUEST_TYPES,
  type VolumeHandlerContext,
  type VolumeResult,
  type VolumeStore,
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
  appVisible,
  defaultPolicy,
  evaluatePolicy,
  type PolicyDecision,
  type ToolCallFacts,
  toolVisible,
} from './permission-enforcer.js';
export { InMemoryPolicyStore, type PolicyStore, policyFor } from './policy-store.js';
// Secrets manager
export {
  InMemorySecretStore,
  type InstallationSecretScope,
  LocalSecretStore,
  type LocalSecretStoreOptions,
  type SecretStore,
  type StationSecretScope,
  type SystemSecretScope,
} from './secret-store.js';
export { type SecretStoreContractCase, secretStoreContract } from './secret-store-contract.js';
// Server
export {
  type AppCatalog,
  type AppEntry,
  requireId,
  requirePublicUrl,
  type ServerInfo,
  type StationCaller,
  type StationEndpoint,
  StationServer,
  type StationServerOptions,
  serve,
} from './server.js';
export {
  type BindingStore,
  generateInstallationId,
  InMemoryBindingStore,
  InMemoryInstallationStore,
  InMemoryWorkspaceStore,
  type InstallationStore,
  type StationBinding,
  type StationInstallation,
  type WorkspaceStore,
} from './station-state.js';
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
