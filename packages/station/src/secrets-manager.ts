/**
 * SecretsManager — host-side secret resolution contract.
 *
 * The Station never reads or persists secret payloads on its own; it
 * answers instance→host secret requests through a SecretsManager supplied
 * by the Host (the CLI's state, for example).
 *
 * Security rule: system and installation secrets are resolved through SDK
 * requests, never injected as environment variables.
 */

/** Context passed to SecretsManager lookups. */
export interface SecretsContext {
  /** Unique installation ID (e.g. "ins_a7f3b2c1"). Primary key for all lookups. */
  installationId: string;
  /** Tenant scoped to the request. */
  tenant: { userId: string; workspaceId?: string };
  /** Session that triggered the request, when available. */
  sessionId?: string;
}

/** Host-side secret store contract. */
export interface SecretsManager {
  /** Resolve system-level secrets for the given installation/tenant. */
  getSystemSecrets(ctx: SecretsContext): Promise<Record<string, string> | null>;

  /** Resolve installation secrets for the given installation/tenant. */
  getInstallationSecrets(ctx: SecretsContext): Promise<Record<string, string> | null>;

  /** Persist updated installation secrets. Return true on success. */
  updateInstallationSecrets?(
    ctx: SecretsContext,
    secrets: Record<string, string>,
  ): Promise<boolean>;
}
