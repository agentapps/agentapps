/**
 * Tests for the create-agent-app skill: its shape (open SKILL.md format, agent-neutral
 * text), that scaffolded projects receive it, and that the monorepo copies match it.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  findRepoRoot,
  getSkillDir,
  getTemplateDir,
  scaffoldApp,
  skillDirsFor,
} from '../src/scaffold.js';

const SKILL_DIR = getSkillDir();

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

describe('skill source', () => {
  const skill = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf-8');
  const frontmatter = skill.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '';

  it('has the frontmatter the open SKILL.md format requires', () => {
    expect(frontmatter).toMatch(/^name: create-agent-app$/m);
    const description = frontmatter.match(/^description: (.*)$/m)?.[1] ?? '';
    expect(description.length).toBeGreaterThan(50);
    expect(description.length).toBeLessThanOrEqual(1024);
  });

  it('points only at references that exist', () => {
    for (const ref of skill.match(/references\/[a-z-]+\.md/g) ?? []) {
      // monorepo.md exists only in the monorepo copies, and SKILL.md says so.
      if (ref === 'references/monorepo.md') continue;
      expect(existsSync(join(SKILL_DIR, ref)), ref).toBe(true);
    }
  });

  it('is written for any agent: no agent-specific tool names or paths', () => {
    for (const file of files(SKILL_DIR)) {
      const text = readFileSync(file, 'utf-8');
      for (const word of ['AskUserQuestion', 'TodoWrite', 'Task tool', '.claude/', 'CLAUDE.md']) {
        expect(text.includes(word), `${file} mentions ${word}`).toBe(false);
      }
    }
  });
});

describe('--strict guidance', () => {
  it('says everywhere that a documented logo TODO still passes --strict', () => {
    const texts = [
      readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf-8'),
      readFileSync(join(SKILL_DIR, 'references', 'ship-it.md'), 'utf-8'),
      readFileSync(join(getTemplateDir('_project'), 'AGENTS.md.tmpl'), 'utf-8'),
    ];
    for (const text of texts) {
      expect(text).toMatch(/--strict/);
      expect(text).toMatch(/logo TODO[^.]*still passes/);
    }
  });
});

describe('scaffolded projects', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'skill-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const base = { mode: 'standalone' as const, skipInstall: true, skipGit: true };

  it('get AGENTS.md and the skill for every supported agent by default', async () => {
    const { destDir, skillDirs } = await scaffoldApp({ ...base, projectName: 'a', cwd: tmpDir });
    expect(skillDirs).toEqual(['.agents/skills', '.claude/skills']);
    for (const dir of skillDirs) {
      expect(readFileSync(join(destDir, dir, 'create-agent-app', 'SKILL.md'), 'utf-8')).toBe(
        readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf-8'),
      );
    }
    const agents = readFileSync(join(destDir, 'AGENTS.md'), 'utf-8');
    expect(agents).toContain('.agents/skills/create-agent-app/SKILL.md');
    expect(agents).toContain('npm run check');
    // Pointers for the agents that do not read AGENTS.md by default.
    expect(readFileSync(join(destDir, 'CLAUDE.md'), 'utf-8')).toBe('@AGENTS.md\n');
    const gemini = JSON.parse(readFileSync(join(destDir, '.gemini', 'settings.json'), 'utf-8'));
    expect(gemini.context.fileName).toContain('AGENTS.md');
  });

  it('install the skill only where the chosen agents look', async () => {
    const { destDir } = await scaffoldApp({
      ...base,
      projectName: 'b',
      cwd: tmpDir,
      agents: ['claude'],
    });
    expect(existsSync(join(destDir, '.claude/skills/create-agent-app/SKILL.md'))).toBe(true);
    expect(existsSync(join(destDir, '.agents'))).toBe(false);
    expect(existsSync(join(destDir, '.gemini'))).toBe(false);
    expect(skillDirsFor(['codex', 'cursor'])).toEqual(['.agents/skills']);
  });

  it('can skip the skill but still get AGENTS.md', async () => {
    const { destDir } = await scaffoldApp({ ...base, projectName: 'c', cwd: tmpDir, agents: [] });
    expect(existsSync(join(destDir, '.agents'))).toBe(false);
    expect(existsSync(join(destDir, '.claude'))).toBe(false);
    expect(readFileSync(join(destDir, 'AGENTS.md'), 'utf-8')).toContain(
      'node_modules/@agentapps/create/skill/create-agent-app/SKILL.md',
    );
  });

  it('reject unknown agents before writing anything', async () => {
    await expect(
      scaffoldApp({ ...base, projectName: 'd', cwd: tmpDir, agents: ['nope'] }),
    ).rejects.toThrow('Unknown agent(s): nope');
    expect(existsSync(join(tmpDir, 'd'))).toBe(false);
  });
});

describe('monorepo copies', () => {
  const root = findRepoRoot(SKILL_DIR);

  it.skipIf(!root)('match packages/create/skill plus the monorepo extras', () => {
    const result = spawnSync(
      process.execPath,
      [join(root as string, 'scripts', 'agent-skills', 'sync.mjs'), '--check'],
      { encoding: 'utf-8' },
    );
    expect(result.status, result.stderr).toBe(0);
  });
});
