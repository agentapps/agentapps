/**
 * Dev mode reloads the whole app, not only its entry module (DEVX-REQ-1).
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isSourceFile } from '../src/dev.js';
import { importAppModule } from '../src/load-app.js';

const PKG = join(dirname(fileURLToPath(import.meta.url)), '..');
let dir: string;
beforeEach(() => {
  // Inside the package, so the temporary app resolves the same modules as a real one.
  dir = mkdtempSync(join(PKG, 'test', '.tmp-dev-reload-'));
  mkdirSync(join(dir, 'src', 'tools'), { recursive: true });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('dev reload', () => {
  it('[DEVX-AC-1] a change in a module the entry imports is picked up by the next load', async () => {
    const entry = join(dir, 'src', 'app.ts');
    const tool = join(dir, 'src', 'tools', 'greet.ts');
    writeFileSync(
      entry,
      "import { greeting } from './tools/greet.js';\nexport const value: string = greeting;\n",
    );
    writeFileSync(tool, "export const greeting: string = 'one';\n");
    expect((await importAppModule(entry, true)).value).toBe('one');

    writeFileSync(tool, "export const greeting: string = 'two';\n");
    expect((await importAppModule(entry, true)).value).toBe('two');

    expect(isSourceFile('tools/greet.ts')).toBe(true);
    expect(isSourceFile('app.ts')).toBe(true);
    expect(isSourceFile('tools/notes.md')).toBe(false);
    expect(isSourceFile('types.d.ts')).toBe(false);
  });
});
