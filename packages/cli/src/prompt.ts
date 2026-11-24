/**
 * @agentapps/cli — the terminal side of the CLI: reading a line, opening a
 * URL in the browser, and following a sign-in the Station runs.
 */

import { execFile } from 'node:child_process';
import { platform } from 'node:os';
import { createInterface } from 'node:readline';
import { BOLD, CYAN, GREEN, RESET } from './render/colors.js';
import { StationUnreachableError } from './station-client.js';

/**
 * Read a single line from stdin, trimming whitespace.
 *
 * Exported for tests so they can inject a fake input stream. In production
 * callers pass `process.stdin` as the input.
 * @spec CLIENT-REQ-6
 */
export function readLine(input: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input });
    let received = false;
    rl.once('line', (line) => {
      received = true;
      rl.close();
      resolve(line.trim());
    });
    rl.once('close', () => {
      // If the stream closes without emitting a line, resolve empty so the
      // caller can decide whether to retry or error.
      if (!received) resolve('');
    });
  });
}

/**
 * Internal wrapper around execFile so tests can substitute the launch mechanism.
 *
 * @spec SETUP-REQ-7
 */
export async function execOpenUrl(command: string, url: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    // Windows needs the shell so `start` is resolved; macOS/Linux launchers
    // work fine as direct executables and avoid Node's DEP0190 warning.
    execFile(command, [url], { shell: command === 'start' }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Whether this machine can open a graphical browser.
 *
 * macOS and Windows always can; on Linux a display server must be reachable
 * (headless servers and SSH sessions without X forwarding have neither).
 * @spec SETUP-REQ-7
 */
export function canOpenBrowser(): boolean {
  const platformName = platform();
  if (platformName === 'win32' || platformName === 'darwin') return true;
  return !!(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
}

/**
 * Highlight a URL for terminal output (no-op when stderr is not a TTY).
 *
 * @spec SETUP-REQ-7
 */
export function highlightUrl(url: string): string {
  const useColor = !!process.stderr.isTTY && !process.env.NO_COLOR;
  return useColor ? `${BOLD}${CYAN}${url}${RESET}` : url;
}

/**
 * Open a URL in the user's default browser/client.
 *
 * The URL is always printed exactly once, in a highlighted block, so the user
 * can copy it — the browser launch may silently land on another display, and
 * on remote/headless machines it is skipped entirely.
 * @spec SETUP-REQ-7
 */
export async function openUrl(
  url: string,
  title?: string,
  launcher: (command: string, url: string) => Promise<void> = execOpenUrl,
  browserAvailable: boolean = canOpenBrowser(),
): Promise<void> {
  if (title) {
    console.error(`[cli] ${title}`);
  }

  if (!browserAvailable) {
    console.error('[cli] No browser available on this machine — open this URL from any device:');
    console.error('');
    console.error(`  ${highlightUrl(url)}`);
    console.error('');
    return;
  }

  console.error('[cli] Opening your browser to continue:');
  console.error('');
  console.error(`  ${highlightUrl(url)}`);
  console.error('');

  const platformName = platform();
  const command =
    platformName === 'win32' ? 'start' : platformName === 'darwin' ? 'open' : 'xdg-open';

  try {
    await launcher(command, url);
  } catch {
    // Non-fatal: the user can still copy the URL printed above.
    console.error('[cli] Could not open the browser automatically — use the URL above.');
  }
}

/**
 * Initiate an OAuth flow via a remote station server.
 *
 * Instead of generating state locally and running a localhost request server,
 * this calls the station's `GET /auth/start` endpoint, which registers the
 * state server-side and returns the proper OAuth URL. The user opens the URL,
 * completes consent, and the station handles the request + token exchange +
 * persistence.
 *
 * The CLI then polls `GET /auth/status?installationId=X` on the station until
 * the tokens are persisted, or a timeout is reached.
 * @spec SETUP-REQ-7
 */
export async function requestRemoteAuth(
  stationBaseUrl: string,
  installationId: string,
  options: {
    openInBrowser?: boolean;
    title?: string;
    timeoutMs?: number;
    pollIntervalMs?: number;
  } = {},
): Promise<{ url: string; state: string }> {
  const timeoutMs = options.timeoutMs ?? 300_000;
  const pollIntervalMs = options.pollIntervalMs ?? 2_000;

  // 1. Call station's /auth/start to get the OAuth URL with server-registered state.
  const startUrl = new URL('/auth/start', stationBaseUrl);
  startUrl.searchParams.set('installationId', installationId);

  let startResponse: Response;
  try {
    startResponse = await fetch(startUrl.toString(), {
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new StationUnreachableError(stationBaseUrl);
  }

  if (!startResponse.ok) {
    const body = await startResponse.text().catch(() => 'unknown error');
    throw new Error(`Station /auth/start failed (${startResponse.status}): ${body}`);
  }

  const { url, state } = (await startResponse.json()) as { url: string; state: string };
  if (!url) {
    throw new Error('Station returned an empty OAuth URL');
  }

  // 2. Show / open the URL.
  if (options.openInBrowser) {
    await openUrl(url, options.title);
  } else {
    if (options.title) console.error(`[cli] ${options.title}`);
    console.error('[cli] Open this URL in your browser and authorize the app:');
    console.error('');
    console.error(`  ${highlightUrl(url)}`);
    console.error('');
  }

  // 3. Poll station for completion.
  console.error('[cli] Waiting for authentication... (Ctrl+C to cancel)');
  const statusUrl = new URL('/auth/status', stationBaseUrl);
  statusUrl.searchParams.set('installationId', installationId);

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));

    try {
      const resp = await fetch(statusUrl.toString());
      if (resp.ok) {
        const body = (await resp.json()) as { authenticated: boolean };
        if (body.authenticated) {
          const useColor = !!process.stderr.isTTY && !process.env.NO_COLOR;
          console.error(`[cli] ${useColor ? `${GREEN}✓${RESET}` : '✓'} Authentication complete.`);
          return { url, state };
        }
      }
    } catch {
      // Network hiccup — retry silently.
    }
  }

  throw new Error(
    'OAuth callback timed out waiting for the remote station. ' +
      'The user may have denied consent or the flow was not completed in time.',
  );
}
