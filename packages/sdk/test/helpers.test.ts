/**
 * Tests for @agentapps/sdk high-level helpers.
 *
 * Validates: createPoller lifecycle, error handling, context binding,
 *
 */

import { describe, expect, it, vi } from 'vitest';
import { createPoller } from '../src/helpers.js';
import type { ToolContext } from '../src/types.js';

// ---------------------------------------------------------------------------
// createPoller
// ---------------------------------------------------------------------------

describe('createPoller', () => {
  it('starts and stops periodic polling', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const poller = createPoller(fn, 50);
    const ctx = { emit: vi.fn() } as unknown as ToolContext;

    poller._bindContext(ctx);
    expect(poller.running).toBe(false);
    poller.start();
    expect(poller.running).toBe(true);

    // Wait for the first scheduled iteration.
    await new Promise((resolve) => setTimeout(resolve, 70));
    expect(fn).toHaveBeenCalledTimes(1);

    poller.stop();
    expect(poller.running).toBe(false);

    // Wait another interval to ensure no extra call happens after stop.
    await new Promise((resolve) => setTimeout(resolve, 70));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('runs immediately when immediate is true', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const poller = createPoller(fn, 1_000, { immediate: true });
    const ctx = { emit: vi.fn() } as unknown as ToolContext;

    poller._bindContext(ctx);
    poller.start();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(fn).toHaveBeenCalledTimes(1);

    poller.stop();
  });

  it('passes the bound context to poll iterations', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const poller = createPoller(fn, 50);
    const mockContext = { emit: vi.fn() } as unknown as ToolContext;

    poller._bindContext(mockContext);
    poller.start();
    await new Promise((resolve) => setTimeout(resolve, 70));
    poller.stop();

    expect(fn).toHaveBeenCalledWith(mockContext);
  });

  it('stops after the first error when continueOnError is false', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('poll failed'));
    const onError = vi.fn();
    const poller = createPoller(fn, 50, { continueOnError: false, onError });
    const ctx = { emit: vi.fn() } as unknown as ToolContext;

    poller._bindContext(ctx);
    poller.start();
    await new Promise((resolve) => setTimeout(resolve, 70));

    expect(onError).toHaveBeenCalledTimes(1);
    expect(poller.running).toBe(false);
  });

  it('continues polling after an error by default', async () => {
    let calls = 0;
    const fn = vi.fn().mockImplementation(() => {
      calls += 1;
      if (calls === 1) throw new Error('first failure');
      return Promise.resolve();
    });
    const onError = vi.fn();
    const poller = createPoller(fn, 50, { onError });
    const ctx = { emit: vi.fn() } as unknown as ToolContext;

    poller._bindContext(ctx);
    poller.start();
    await new Promise((resolve) => setTimeout(resolve, 140));
    poller.stop();

    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('is idempotent on repeated start/stop calls', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const poller = createPoller(fn, 50);
    const ctx = { emit: vi.fn() } as unknown as ToolContext;

    poller._bindContext(ctx);
    poller.start();
    poller.start();
    await new Promise((resolve) => setTimeout(resolve, 70));
    poller.stop();
    poller.stop();

    expect(fn).toHaveBeenCalledTimes(1);
    expect(poller.running).toBe(false);
  });

  it('does not schedule overlapping iterations when fn is slow', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    const fn = vi.fn().mockImplementation(async () => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((resolve) => setTimeout(resolve, 80));
      concurrent -= 1;
    });
    const poller = createPoller(fn, 40);
    const ctx = { emit: vi.fn() } as unknown as ToolContext;

    poller._bindContext(ctx);
    poller.start();
    await new Promise((resolve) => setTimeout(resolve, 250));
    poller.stop();

    expect(maxConcurrent).toBe(1);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
