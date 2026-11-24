/**
 * @agentapps/cli — local workspace state management.
 *
 * Stores installations and per-installation secrets in `.agentapps/`
 * inside the workspace.
 *
 * Every instance has a unique, immutable `installationId` (e.g. "ins_a7f3b2c1")
 * that serves as the primary key for secrets, bindings, and permissions. The
 * human-friendly `alias` (e.g. "gmail-work") is mutable and only used for
 * CLI/UI display.
 */

import { randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { ADMIN_PRINCIPAL_ID, type ApiKeyRecord, type Policy } from '@agentapps/protocol';
import { defaultPolicy } from '@agentapps/station';
import { writeSecretFile } from './secrets-store.js';

export interface Installation {
  /** Unique, immutable identifier. Generated at install time (e.g. "ins_a7f3b2c1"). */
  installationId: string;
  /** Human-friendly mutable name (e.g. "gmail-work"). */
  alias: string;
  /** App type (e.g. "app.google.gmail"). */
  appId: string;
  installedAt: string;
  /** The Workspace it belongs to; absent means the Station's home Workspace. */
  workspaceId?: string;
  /**
   * Effective Permissions: the Manifest Permissions approved at install
   * (VOL-REQ-2). Interactive approval is POLICY-REQ-9.
   */
  permissions?: Record<string, unknown>;
}

export interface Instance extends Installation {}

const STATE_DIR = '.agentapps';
const INSTALLATIONS_FILE = 'installations.json';
const INSTALLATION_SECRETS_DIR = 'installation-secrets';

/** Generate a unique installation ID. */
export function generateInstallationId(): string {
  return `ins_${randomBytes(4).toString('hex')}`;
}

/** Resolve the workspace state directory from a config file path. */
export function stateDir(configPath: string): string {
  return resolve(dirname(resolve(configPath)), STATE_DIR);
}

/** Ensure the state directory exists. */
export function ensureStateDir(configPath: string): string {
  const dir = stateDir(configPath);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Load all installed apps, migrating legacy records if needed. */
export function loadInstallations(configPath: string): Installation[] {
  const path = resolve(stateDir(configPath), INSTALLATIONS_FILE);
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const records = parsed.filter(isLegacyOrCurrentRecord);

    // Migrate legacy records that lack installationId.
    let needsSave = false;
    const migrated = records.map((r) => {
      if (typeof (r as Record<string, unknown>).installationId === 'string') {
        return r as Installation;
      }
      needsSave = true;
      const record: Installation = {
        installationId: generateInstallationId(),
        alias: (r as Record<string, unknown>).alias as string,
        appId: (r as Record<string, unknown>).appId as string,
        installedAt: (r as Record<string, unknown>).installedAt as string,
      };
      // Rename the secrets file from <alias>.json to <installationId>.json
      migrateSecretsFile(configPath, record.alias, record.installationId);
      return record;
    });

    if (needsSave) {
      saveInstallations(configPath, migrated);
    }

    return migrated;
  } catch {
    return [];
  }
}

/** Save the full instance list. */
export function saveInstallations(configPath: string, instances: Installation[]): void {
  ensureStateDir(configPath);
  const path = resolve(stateDir(configPath), INSTALLATIONS_FILE);
  writeFileSync(path, `${JSON.stringify(instances, null, 2)}\n`, 'utf8');
}

/** Get a single instance by alias. */
export function getInstallation(configPath: string, alias: string): Instance | undefined {
  return loadInstallations(configPath).find((i) => i.alias === alias);
}

/** Get a single instance by installationId. */
export function getInstallationById(
  configPath: string,
  installationId: string,
): Instance | undefined {
  return loadInstallations(configPath).find((i) => i.installationId === installationId);
}

/** Add a new instance. Throws if the alias already exists. Returns the new record. */
export function addInstallation(
  configPath: string,
  alias: string,
  appId: string,
  permissions?: Record<string, unknown>,
): Installation {
  const instances = loadInstallations(configPath);
  if (instances.some((i) => i.alias === alias)) {
    throw new Error(
      `Alias "${alias}" is already used by ${instances.find((i) => i.alias === alias)?.appId}`,
    );
  }
  const record: Installation = {
    installationId: generateInstallationId(),
    alias,
    appId,
    installedAt: new Date().toISOString(),
    ...(permissions && Object.keys(permissions).length > 0 ? { permissions } : {}),
  };
  instances.push(record);
  saveInstallations(configPath, instances);
  return record;
}

/**
 * Record the Permissions the Approver approved for an installation.
 *
 * @spec POLICY-REQ-9
 */
export function setInstallationPermissions(
  configPath: string,
  alias: string,
  permissions: Record<string, unknown>,
): void {
  const installations = loadInstallations(configPath);
  const record = installations.find((i) => i.alias === alias);
  if (!record) throw new Error(`Unknown alias: ${alias}`);
  record.permissions = permissions;
  saveInstallations(configPath, installations);
}

/**
 * Manifest Permissions not covered by what was approved: a key that was not
 * approved, or approved with a different value.
 *
 * @spec POLICY-REQ-9
 */
export function unapprovedPermissions(
  requested: Record<string, unknown> | undefined,
  approved: Record<string, unknown> | undefined,
): string[] {
  if (!requested) return [];
  return Object.keys(requested).filter(
    (k) => JSON.stringify(requested[k]) !== JSON.stringify(approved?.[k]),
  );
}

/** Remove an instance and its secrets. */
export function removeInstallation(configPath: string, alias: string): void {
  const instances = loadInstallations(configPath);
  const instance = instances.find((i) => i.alias === alias);
  if (!instance) return;
  const filtered = instances.filter((i) => i.alias !== alias);
  saveInstallations(configPath, filtered);
  const secretsPath = instanceSecretsPath(configPath, instance.installationId);
  if (existsSync(secretsPath)) {
    rmSync(secretsPath);
  }
}

/** Rename an instance alias. Only changes the alias, not the secrets file. */
export function renameInstallation(configPath: string, alias: string, newAlias: string): void {
  const instances = loadInstallations(configPath);
  const index = instances.findIndex((i) => i.alias === alias);
  if (index === -1) {
    throw new Error(`Alias "${alias}" not found`);
  }
  if (instances.some((i) => i.alias === newAlias)) {
    throw new Error(`Alias "${newAlias}" is already in use`);
  }
  // Only update the alias — secrets file stays keyed by installationId.
  instances[index] = { ...instances[index], alias: newAlias };
  saveInstallations(configPath, instances);
}

/** Path to the per-installation secrets file (keyed by installationId). */
export function instanceSecretsPath(configPath: string, installationId: string): string {
  return resolve(stateDir(configPath), INSTALLATION_SECRETS_DIR, `${installationId}.json`);
}

/** Read installation secrets for a specific instance. */
export function readInstallationSecrets(
  configPath: string,
  installationId: string,
): Record<string, string> {
  const path = instanceSecretsPath(configPath, installationId);
  if (!existsSync(path)) return {};
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') result[key] = value;
    }
    return result;
  } catch {
    return {};
  }
}

/** Write installation secrets for a specific instance. */
export function writeInstallationSecrets(
  configPath: string,
  installationId: string,
  secrets: Record<string, string>,
): void {
  ensureStateDir(configPath);
  mkdirSync(resolve(stateDir(configPath), INSTALLATION_SECRETS_DIR), { recursive: true });
  const path = instanceSecretsPath(configPath, installationId);
  const current = readInstallationSecrets(configPath, installationId);
  const next = { ...current, ...secrets };
  writeSecretFile(path, next);
}

/** Return true if the instance has any stored secrets. */
export function hasInstallationSecrets(configPath: string, installationId: string): boolean {
  return Object.keys(readInstallationSecrets(configPath, installationId)).length > 0;
}

/** List all installationIds that have stored secrets. */
export function listInstallationIdsWithSecrets(configPath: string): string[] {
  const dir = resolve(stateDir(configPath), INSTALLATION_SECRETS_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -5));
}

// ---------------------------------------------------------------------------
// Migration helpers
// ---------------------------------------------------------------------------

/** Rename a secrets file from <alias>.json to <installationId>.json. */
function migrateSecretsFile(configPath: string, alias: string, installationId: string): void {
  const secretsDir = resolve(stateDir(configPath), INSTALLATION_SECRETS_DIR);
  const oldPath = resolve(secretsDir, `${alias}.json`);
  const newPath = resolve(secretsDir, `${installationId}.json`);
  if (existsSync(oldPath) && !existsSync(newPath)) {
    try {
      renameSync(oldPath, newPath);
    } catch {
      // Non-fatal: secrets will be re-created on next auth.
    }
  }
}

function isLegacyOrCurrentRecord(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.alias === 'string' &&
    typeof obj.appId === 'string' &&
    typeof obj.installedAt === 'string'
  );
}

// ---------------------------------------------------------------------------
// Bindings — intent binding state
// ---------------------------------------------------------------------------

const BINDINGS_FILE = 'bindings.json';

export interface BindingRecord {
  /** Consumer instance installationId. */
  installationId: string;
  /** Binding name from the app's `requires` declaration. */
  bindingName: string;
  /** Target instance installationId that fulfills the binding. */
  targetInstallationId: string;
  /** When the binding was created. */
  boundAt: string;
}

/** Load all bindings. */
export function loadBindings(configPath: string): BindingRecord[] {
  const path = resolve(stateDir(configPath), BINDINGS_FILE);
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isBindingRecord);
  } catch {
    return [];
  }
}

/** Save the full bindings list. */
export function saveBindings(configPath: string, bindings: BindingRecord[]): void {
  ensureStateDir(configPath);
  const path = resolve(stateDir(configPath), BINDINGS_FILE);
  writeFileSync(path, `${JSON.stringify(bindings, null, 2)}\n`, 'utf8');
}

/** Get bindings for a specific consumer instance. */
export function getBindingsForInstallation(
  configPath: string,
  installationId: string,
): BindingRecord[] {
  return loadBindings(configPath).filter((b) => b.installationId === installationId);
}

/** Resolve a single binding. */
export function resolveBinding(
  configPath: string,
  installationId: string,
  bindingName: string,
): BindingRecord | undefined {
  return loadBindings(configPath).find(
    (b) => b.installationId === installationId && b.bindingName === bindingName,
  );
}

/** Add or update a binding. */
export function addBinding(
  configPath: string,
  installationId: string,
  bindingName: string,
  targetInstallationId: string,
): void {
  const bindings = loadBindings(configPath);
  const existing = bindings.findIndex(
    (b) => b.installationId === installationId && b.bindingName === bindingName,
  );
  const record: BindingRecord = {
    installationId,
    bindingName,
    targetInstallationId,
    boundAt: new Date().toISOString(),
  };
  if (existing >= 0) {
    bindings[existing] = record;
  } else {
    bindings.push(record);
  }
  saveBindings(configPath, bindings);
}

/** Remove a binding. */
export function removeBinding(
  configPath: string,
  installationId: string,
  bindingName: string,
): boolean {
  const bindings = loadBindings(configPath);
  const filtered = bindings.filter(
    (b) => !(b.installationId === installationId && b.bindingName === bindingName),
  );
  if (filtered.length === bindings.length) return false;
  saveBindings(configPath, filtered);
  return true;
}

/** Remove all bindings for a consumer instance (e.g., on uninstall). */
export function removeAllBindingsForInstallation(configPath: string, installationId: string): void {
  const bindings = loadBindings(configPath);
  const filtered = bindings.filter((b) => b.installationId !== installationId);
  if (filtered.length !== bindings.length) {
    saveBindings(configPath, filtered);
  }
}

function isBindingRecord(value: unknown): value is BindingRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).installationId === 'string' &&
    typeof (value as Record<string, unknown>).bindingName === 'string' &&
    typeof (value as Record<string, unknown>).targetInstallationId === 'string' &&
    typeof (value as Record<string, unknown>).boundAt === 'string'
  );
}

// ---------------------------------------------------------------------------
// Permission rules (R9 — Phase 5.6)
// ---------------------------------------------------------------------------

const PERMISSIONS_FILE = 'permissions.json';

/**
 * A user-defined permission rule that restricts an app's runtime behaviour.
 *
 * Rules are simple key/value pairs scoped to an installationId:
 * - `{ permission: 'files', effect: 'deny' }` — block a permission
 * - `{ permission: 'network', effect: 'allow', scope: ['repo-x'] }` — scope-restrict
 */
export interface PermissionRule {
  installationId: string;
  /** Legacy infrastructure-permission rule key (e.g. `network`). */
  permission?: string;
  /** Per-tool override: the tool name this rule applies to. */
  tool?: string;
  effect: 'allow' | 'ask' | 'deny';
  /** Optional scope restriction (provider-specific). */
  scope?: string[];
  setAt: string;
}

/** Load all permission rules. */
export function loadPermissions(configPath: string): PermissionRule[] {
  const path = resolve(stateDir(configPath), PERMISSIONS_FILE);
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPermissionRule);
  } catch {
    return [];
  }
}

/** Save the full permission rules list. */
export function savePermissions(configPath: string, rules: PermissionRule[]): void {
  ensureStateDir(configPath);
  const path = resolve(stateDir(configPath), PERMISSIONS_FILE);
  writeFileSync(path, JSON.stringify(rules, null, 2));
}

/** Get permission rules for a specific instance. */
export function getPermissionsForInstallation(
  configPath: string,
  installationId: string,
): PermissionRule[] {
  return loadPermissions(configPath).filter((r) => r.installationId === installationId);
}

/** Set or update a permission rule. */
export function setPermission(
  configPath: string,
  installationId: string,
  permission: string,
  effect: 'allow' | 'deny',
  scope?: string[],
): void {
  const rules = loadPermissions(configPath);
  const existing = rules.findIndex(
    (r) => r.installationId === installationId && r.permission === permission,
  );
  const rule: PermissionRule = {
    installationId,
    permission,
    effect,
    ...(scope ? { scope } : {}),
    setAt: new Date().toISOString(),
  };
  if (existing >= 0) {
    rules[existing] = rule;
  } else {
    rules.push(rule);
  }
  savePermissions(configPath, rules);
}

/** Remove a specific permission rule. */
export function removePermission(
  configPath: string,
  installationId: string,
  permission: string,
): boolean {
  const rules = loadPermissions(configPath);
  const filtered = rules.filter(
    (r) => !(r.installationId === installationId && r.permission === permission),
  );
  if (filtered.length === rules.length) return false;
  savePermissions(configPath, filtered);
  return true;
}

/** Remove all permission rules for an instance (e.g., on uninstall). */
export function removeAllPermissionsForInstallation(
  configPath: string,
  installationId: string,
): void {
  const rules = loadPermissions(configPath);
  const filtered = rules.filter((r) => r.installationId !== installationId);
  if (filtered.length !== rules.length) {
    savePermissions(configPath, filtered);
  }
}

function isPermissionRule(value: unknown): value is PermissionRule {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const effect = v.effect;
  return (
    typeof v.installationId === 'string' &&
    (typeof v.permission === 'string' || typeof v.tool === 'string') &&
    (effect === 'allow' || effect === 'ask' || effect === 'deny') &&
    typeof v.setAt === 'string'
  );
}

// ---------------------------------------------------------------------------
// Per-tool permission overrides
// ---------------------------------------------------------------------------

/**
 * Policy of a Principal from `policies.json`, or the default every new
 * Principal starts with.
 *
 * @spec POLICY-REQ-2
 */
export function getPolicy(configPath: string, principalId: string): Policy {
  return (
    loadPolicies(configPath).find((p) => p.principalId === principalId) ??
    defaultPolicy(principalId)
  );
}

/**
 * Store a Principal's Policy, replacing the previous one.
 *
 * @spec POLICY-REQ-2
 */
export function putPolicy(configPath: string, policy: Policy): void {
  const policies = loadPolicies(configPath).filter((p) => p.principalId !== policy.principalId);
  policies.push({ ...policy, updatedAt: new Date().toISOString() });
  savePolicies(configPath, policies);
}

/** Id of the plain per-tool Rule `permissions <alias> set` manages for an app. */
function toolRuleId(appId: string, tool: string): string {
  return `${appId}/${tool}`;
}

function appIdOf(configPath: string, installationId: string): string | undefined {
  return getInstallationById(configPath, installationId)?.appId;
}

/**
 * Per-tool Rules of the local admin's Policy for an installation's App, keyed
 * by tool name. Rules with a condition are not per-tool overrides.
 */
export function getToolOverridesForInstallation(
  configPath: string,
  installationId: string,
): Record<string, 'allow' | 'ask' | 'deny'> {
  const appId = appIdOf(configPath, installationId);
  const out: Record<string, 'allow' | 'ask' | 'deny'> = {};
  if (!appId) return out;
  for (const r of getPolicy(configPath, ADMIN_PRINCIPAL_ID).rules) {
    if (r.app === appId && r.tool !== '*' && !r.when) out[r.tool] = r.effect;
  }
  return out;
}

/** Set a per-tool Rule on the local admin's Policy (POLICY-REQ-3). */
export function setToolPermission(
  configPath: string,
  installationId: string,
  tool: string,
  effect: 'allow' | 'ask' | 'deny',
): void {
  const appId = appIdOf(configPath, installationId);
  if (!appId) throw new Error(`Unknown installation: ${installationId}`);
  const policy = getPolicy(configPath, ADMIN_PRINCIPAL_ID);
  const id = toolRuleId(appId, tool);
  const rules = policy.rules.filter((r) => r.id !== id);
  rules.push({ id, app: appId, tool, effect });
  putPolicy(configPath, { ...policy, rules });
}

/** Remove a per-tool Rule. Returns false if there was none. */
export function removeToolPermission(
  configPath: string,
  installationId: string,
  tool: string,
): boolean {
  const appId = appIdOf(configPath, installationId);
  if (!appId) return false;
  const policy = getPolicy(configPath, ADMIN_PRINCIPAL_ID);
  const id = toolRuleId(appId, tool);
  const rules = policy.rules.filter((r) => r.id !== id);
  if (rules.length === policy.rules.length) return false;
  putPolicy(configPath, { ...policy, rules });
  return true;
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

/** Every stored Policy, one per Principal (POLICY-REQ-2). */
export function loadPolicies(configPath: string): Policy[] {
  const file = join(stateDir(configPath), 'policies.json');
  if (!existsSync(file)) return [];
  return JSON.parse(readFileSync(file, 'utf-8')) as Policy[];
}

export function savePolicies(configPath: string, policies: Policy[]): void {
  const dir = stateDir(configPath);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'policies.json');
  writeFileSync(file, JSON.stringify(policies, null, 2) + '\n');
}

// ---------------------------------------------------------------------------
// API Keys
// ---------------------------------------------------------------------------

export function loadApiKeys(configPath: string): ApiKeyRecord[] {
  const file = join(stateDir(configPath), 'api-keys.json');
  if (!existsSync(file)) return [];
  return JSON.parse(readFileSync(file, 'utf-8')) as ApiKeyRecord[];
}

export function saveApiKeys(configPath: string, keys: ApiKeyRecord[]): void {
  const dir = stateDir(configPath);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'api-keys.json');
  writeFileSync(file, JSON.stringify(keys, null, 2) + '\n');
}
