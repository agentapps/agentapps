/**
 * Spawn helper — runs a shell command and collects stdout/stderr.
 *
 * Supports timeout and AbortSignal for cancellation.
 */

import { spawn } from 'node:child_process';

export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  cancelled: boolean;
  signal?: string;
  duration: number;
}

export interface SpawnOptions {
  cwd?: string;
  timeout?: number;
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
}

const DEFAULT_TIMEOUT = 120_000; // 2 minutes
const MAX_TIMEOUT = 600_000; // 10 minutes

export function spawnCommand(command: string, options: SpawnOptions = {}): Promise<SpawnResult> {
  const cwd = options.cwd || process.cwd();
  const timeout = Math.min(Math.max(options.timeout ?? DEFAULT_TIMEOUT, 1000), MAX_TIMEOUT);

  return new Promise((resolve) => {
    const startTime = Date.now();
    let stdout = '';
    let stderr = '';
    let cancelled = false;
    let killSignal: string | undefined;

    const child = spawn('/bin/bash', ['-c', command], {
      cwd,
      env: {
        ...process.env,
        ...options.env,
        TERM: 'xterm-256color',
        FORCE_COLOR: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    // Timeout kill
    const timer = setTimeout(() => {
      cancelled = true;
      killSignal = 'SIGTERM';
      child.kill('SIGTERM');
      // Force kill after 5s if still alive
      setTimeout(() => child.kill('SIGKILL'), 5000);
    }, timeout);

    // External abort
    if (options.signal) {
      options.signal.addEventListener(
        'abort',
        () => {
          cancelled = true;
          killSignal = 'SIGTERM';
          child.kill('SIGTERM');
        },
        { once: true },
      );
    }

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1,
        cancelled,
        signal: killSignal ?? signal ?? undefined,
        duration: Date.now() - startTime,
      });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr: stderr + (err.message || 'Spawn error'),
        exitCode: 1,
        cancelled: false,
        duration: Date.now() - startTime,
      });
    });
  });
}
