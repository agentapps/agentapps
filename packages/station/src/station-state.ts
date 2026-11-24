/**
 * The Station's own state: which Installations, Bindings and Workspaces it
 * has, and how Apps are added to it. API Keys and Policies have their stores
 * in `api-key-store.ts` and `policy-store.ts`.
 *
 * The Station is the only component that reads or writes this state
 * (STADMIN-REQ-3). The stores are synchronous: they are small and local to
 * the Station.
 */

import { randomBytes } from 'node:crypto';

/** One Installation as the Station knows it (POLICY-REQ-10). */
export interface StationInstallation {
  installationId: string;
  alias: string;
  appId: string;
  /** The Workspace it belongs to; absent means the Station's home Workspace. */
  workspaceId?: string;
  installedAt?: string;
  /** The Installation's Effective Permissions. */
  permissions?: Record<string, unknown>;
}

/**
 * Where the Station keeps its Installations.
 *
 * @spec STADMIN-REQ-3
 */
export interface InstallationStore {
  list(): StationInstallation[];
  create(installation: StationInstallation): void;
  /** Change the alias or the Effective Permissions. Answers whether it existed. */
  update(
    installationId: string,
    patch: { alias?: string; permissions?: Record<string, unknown> },
  ): boolean;
  remove(installationId: string): boolean;
}

/** A requirement of one Installation fulfilled by another. */
export interface StationBinding {
  /** The Installation that requires. */
  installationId: string;
  /** Name of the requirement in the App's `requires`. */
  bindingName: string;
  /** The Installation that fulfils it. */
  targetInstallationId: string;
  boundAt: string;
}

/** Where the Station keeps Bindings. @spec STADMIN-REQ-3 */
export interface BindingStore {
  list(): StationBinding[];
  /** Create or replace the Binding of that name for that Installation. */
  set(binding: StationBinding): void;
  remove(installationId: string, bindingName: string): boolean;
  /** Remove every Binding an Installation has or fulfils. */
  removeAllFor(installationId: string): void;
}

/**
 * The Workspaces a Station knows besides its home one. Only the Station
 * Operator makes a Workspace known (STADMIN-REQ-11).
 */
export interface WorkspaceStore {
  list(): string[];
  add(workspaceId: string): void;
}

/**
 * A new Installation id.
 *
 * @spec STADMIN-REQ-5
 */
export function generateInstallationId(): string {
  return `ins_${randomBytes(4).toString('hex')}`;
}

/**
 * Installations in process memory. For tests and embedded Stations.
 *
 * @spec STADMIN-REQ-3
 */
export class InMemoryInstallationStore implements InstallationStore {
  private readonly installations: StationInstallation[];

  constructor(initial: StationInstallation[] = []) {
    this.installations = initial.map((i) => ({ ...i }));
  }

  list(): StationInstallation[] {
    return this.installations.map((i) => ({ ...i }));
  }

  create(installation: StationInstallation): void {
    this.installations.push({ ...installation });
  }

  update(
    installationId: string,
    patch: { alias?: string; permissions?: Record<string, unknown> },
  ): boolean {
    const found = this.installations.find((i) => i.installationId === installationId);
    if (!found) return false;
    if (patch.alias !== undefined) found.alias = patch.alias;
    if (patch.permissions !== undefined) found.permissions = patch.permissions;
    return true;
  }

  remove(installationId: string): boolean {
    const at = this.installations.findIndex((i) => i.installationId === installationId);
    if (at < 0) return false;
    this.installations.splice(at, 1);
    return true;
  }
}

/**
 * Bindings in process memory.
 *
 * @spec STADMIN-REQ-3
 */
export class InMemoryBindingStore implements BindingStore {
  private bindings: StationBinding[] = [];

  list(): StationBinding[] {
    return this.bindings.map((b) => ({ ...b }));
  }

  set(binding: StationBinding): void {
    this.remove(binding.installationId, binding.bindingName);
    this.bindings.push({ ...binding });
  }

  remove(installationId: string, bindingName: string): boolean {
    const before = this.bindings.length;
    this.bindings = this.bindings.filter(
      (b) => !(b.installationId === installationId && b.bindingName === bindingName),
    );
    return this.bindings.length < before;
  }

  removeAllFor(installationId: string): void {
    this.bindings = this.bindings.filter(
      (b) => b.installationId !== installationId && b.targetInstallationId !== installationId,
    );
  }
}

/**
 * Workspaces in process memory.
 *
 * @spec STADMIN-REQ-11
 */
export class InMemoryWorkspaceStore implements WorkspaceStore {
  private readonly ids: string[];

  constructor(initial: string[] = []) {
    this.ids = [...initial];
  }

  list(): string[] {
    return [...this.ids];
  }

  add(workspaceId: string): void {
    this.ids.push(workspaceId);
  }
}
