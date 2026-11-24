/**
 * @agentapps/cli — an App's setup instructions, as the Station resolves them.
 *
 * The CLI never fills in a variable itself: the text comes from the Station
 * the CLI connects to, asked as the Station Operator.
 */

import type { StationClient } from './station-client.js';

/**
 * Asks the Station for an App's resolved setup instructions. Answers the
 * text, or `null` when the App has none. Throws what the client throws when
 * the Station cannot be reached or refuses.
 *
 * @spec SETUP-REQ-5
 */
export async function fetchSetupInstructions(
  station: StationClient,
  appId: string,
): Promise<string | null> {
  const { instructions } = await station.api<{ instructions?: unknown }>(
    'GET',
    `/apps/${encodeURIComponent(appId)}/setup`,
  );
  return typeof instructions === 'string' ? instructions : null;
}
