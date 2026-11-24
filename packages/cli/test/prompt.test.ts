/**
 * @agentapps/cli — the terminal helpers: reading a line and opening a URL.
 */

import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { openUrl, readLine } from '../src/prompt.js';

describe('readLine', () => {
  it('reads and trims a line from a stream', async () => {
    const input = new Readable({ read() {} });
    input.push('  pasted-code  \n');
    input.push(null);
    const line = await readLine(input);
    expect(line).toBe('pasted-code');
  });

  it('resolves empty when the stream closes without a line', async () => {
    const input = new Readable({ read() {} });
    input.push(null);
    const line = await readLine(input);
    expect(line).toBe('');
  });
});

describe('openUrl', () => {
  // Note: the happy path is only exercised with an injected launcher — calling
  // openUrl with the default launcher would open a real browser during tests.
  it('logs the title and highlighted URL exactly once, then launches', async () => {
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const launcher = vi.fn().mockResolvedValue(undefined);

    await expect(
      openUrl('https://example.com', 'Open this link', launcher, true),
    ).resolves.toBeUndefined();

    expect(launcher).toHaveBeenCalledWith(expect.any(String), 'https://example.com');
    expect(stderrSpy).toHaveBeenCalledWith('[cli] Open this link');
    expect(stderrSpy).toHaveBeenCalledWith('[cli] Opening your browser to continue:');
    const urlLines = stderrSpy.mock.calls.filter((c) =>
      String(c[0]).includes('https://example.com'),
    );
    expect(urlLines).toHaveLength(1);

    stderrSpy.mockRestore();
  });

  it('does not repeat the URL when the browser command fails', async () => {
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const launcher = vi.fn().mockRejectedValue(new Error('Command not found'));

    await expect(
      openUrl('https://example.com', undefined, launcher, true),
    ).resolves.toBeUndefined();
    expect(stderrSpy).toHaveBeenCalledWith(
      '[cli] Could not open the browser automatically — use the URL above.',
    );
    const urlLines = stderrSpy.mock.calls.filter((c) =>
      String(c[0]).includes('https://example.com'),
    );
    expect(urlLines).toHaveLength(1);

    stderrSpy.mockRestore();
  });

  it('skips the launcher entirely when no browser is available', async () => {
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const launcher = vi.fn().mockResolvedValue(undefined);

    await expect(
      openUrl('https://example.com', 'Authenticate calendar', launcher, false),
    ).resolves.toBeUndefined();

    expect(launcher).not.toHaveBeenCalled();
    expect(stderrSpy).toHaveBeenCalledWith(
      '[cli] No browser available on this machine — open this URL from any device:',
    );
    const urlLines = stderrSpy.mock.calls.filter((c) =>
      String(c[0]).includes('https://example.com'),
    );
    expect(urlLines).toHaveLength(1);

    stderrSpy.mockRestore();
  });
});
