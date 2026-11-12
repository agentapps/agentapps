/**
 * Linear API Client Manager
 *
 * Uses a Personal API Key (API_KEY) from installation secrets.
 */

import { LinearClient } from '@linear/sdk';

export interface LinearSecrets {
  API_KEY?: string;
}

export interface SecretsContext {
  secrets: {
    getSystem: () => Promise<Record<string, string> | null>;
    getInstallation: () => Promise<Record<string, string> | null>;
  };
}

let cachedClient: LinearClient | null = null;
let cachedKey: string | null = null;

/**
 * Get or create a Linear client with credentials from the tool context.
 */
export async function getLinearClient(context: SecretsContext): Promise<LinearClient> {
  const installationSecrets = (await context.secrets.getInstallation()) as LinearSecrets | null;
  const apiKey = installationSecrets?.API_KEY;

  if (!apiKey) {
    throw new Error('Linear API key not configured. Please configure it in app settings.');
  }

  if (cachedClient && cachedKey === apiKey) {
    return cachedClient;
  }

  cachedClient = new LinearClient({ apiKey });
  cachedKey = apiKey;
  return cachedClient;
}

/**
 * Validate Linear credentials by making a real API call.
 */
export async function validateCredentials(context: SecretsContext): Promise<void> {
  const client = await getLinearClient(context);
  await client.teams({ first: 1 });
}
