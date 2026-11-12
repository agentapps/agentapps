/**
 * Tests for the workspace configuration loader — specifically the layering of
 * the tracked `agentapps.example.json` template, the gitignored `agentapps.json`,
 * and the gitignored `agentapps.local.json` overrides.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findConfigPath, loadWorkspaceConfig, readRawConfig } from '../src/config.js';

describe('workspace config loader', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agentapps-config-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const write = (name: string, value: unknown): string => {
    const path = join(dir, name);
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    return path;
  };

  describe('readRawConfig', () => {
    it('returns the base config when no local override exists', () => {
      const path = write('agentapps.json', { station: { port: 4100 }, apps: [] });
      expect(readRawConfig(path)).toEqual({ station: { port: 4100 }, apps: [] });
    });

    it('deep-merges agentapps.local.json over the base (local wins)', () => {
      const path = write('agentapps.json', {
        station: { publicUrl: 'https://raw-apps.example.com', port: 4100 },
        apps: [{ source: './apps/a' }],
      });
      write('agentapps.local.json', { station: { publicUrl: 'http://localhost:4100' } });

      const merged = readRawConfig(path);
      // publicUrl overridden, port preserved from the base.
      expect(merged.station).toEqual({ publicUrl: 'http://localhost:4100', port: 4100 });
      expect(merged.apps).toEqual([{ source: './apps/a' }]);
    });

    it('replaces arrays wholesale rather than concatenating', () => {
      const path = write('agentapps.json', { apps: [{ source: './apps/a' }] });
      write('agentapps.local.json', { apps: [{ source: './apps/b' }] });
      expect(readRawConfig(path).apps).toEqual([{ source: './apps/b' }]);
    });

    it('throws a clear error on malformed agentapps.local.json', () => {
      const path = write('agentapps.json', { apps: [] });
      writeFileSync(join(dir, 'agentapps.local.json'), '{ not json', 'utf8');
      expect(() => readRawConfig(path)).toThrow(/agentapps\.local\.json/);
    });
  });

  describe('findConfigPath', () => {
    it('prefers agentapps.json over the example template', () => {
      write('agentapps.json', { apps: [] });
      write('agentapps.example.json', { apps: [] });
      expect(findConfigPath(dir)).toBe(join(dir, 'agentapps.json'));
    });

    it('falls back to agentapps.example.json when no agentapps.json exists', () => {
      write('agentapps.example.json', { apps: [] });
      expect(findConfigPath(dir)).toBe(join(dir, 'agentapps.example.json'));
    });
  });

  describe('loadWorkspaceConfig', () => {
    it('applies agentapps.local.json station overrides', () => {
      const path = write('agentapps.json', {
        station: { publicUrl: 'https://raw-apps.example.com', port: 4100 },
        apps: [],
      });
      write('agentapps.local.json', { station: { publicUrl: 'http://localhost:4100' } });

      const config = loadWorkspaceConfig(path);
      expect(config.station).toEqual({ publicUrl: 'http://localhost:4100', port: 4100 });
    });
  });
});
