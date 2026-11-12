#!/usr/bin/env node
/**
 * Builds the monorepo's copies of the create-agent-app skill.
 *
 * Source of truth: packages/create/skill/create-agent-app/ (published with @agentapps/create).
 * Monorepo-only extras: scripts/agent-skills/create-agent-app/ (never published).
 * Copies: .agents/skills/create-agent-app/ (read by Codex, Gemini CLI, GitHub Copilot, Cursor,
 * OpenCode) and .claude/skills/create-agent-app/ (read by Claude Code), each = source + extras.
 * The .agents copy always exists. The .claude copy is kept only where a .claude/ directory
 * already exists (the private monorepo); the public repository ships .agents/ alone.
 *
 * Usage (from anywhere in the repo):
 *   node scripts/agent-skills/sync.mjs           # rewrite both copies
 *   node scripts/agent-skills/sync.mjs --check   # exit 1 and list differences if they drifted
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKILL = 'create-agent-app';
const SOURCE = join(ROOT, 'packages', 'create', 'skill', SKILL);
const EXTRAS = join(ROOT, 'scripts', 'agent-skills', SKILL);
export const TARGETS = ['.agents/skills', '.claude/skills']
  .filter((d) => d === '.agents/skills' || existsSync(join(ROOT, d.split('/')[0])))
  .map((d) => join(ROOT, d, SKILL));

function files(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

/** Map of relative path -> absolute source path for the expected copy. */
function expected() {
  const map = new Map();
  for (const base of [SOURCE, EXTRAS]) {
    for (const file of files(base)) map.set(relative(base, file), file);
  }
  return map;
}

function check() {
  const want = expected();
  const problems = [];
  for (const target of TARGETS) {
    const have = new Set(files(target).map((f) => relative(target, f)));
    for (const [rel, src] of want) {
      const dest = join(target, rel);
      if (!have.has(rel)) problems.push(`missing ${relative(ROOT, dest)}`);
      else if (!readFileSync(dest).equals(readFileSync(src))) {
        problems.push(`differs ${relative(ROOT, dest)} (from ${relative(ROOT, src)})`);
      }
      have.delete(rel);
    }
    for (const rel of have) problems.push(`extra ${relative(ROOT, join(target, rel))}`);
  }
  return problems;
}

function sync() {
  for (const target of TARGETS) {
    rmSync(target, { recursive: true, force: true });
    mkdirSync(target, { recursive: true });
    cpSync(SOURCE, target, { recursive: true });
    cpSync(EXTRAS, target, { recursive: true });
  }
}

if (process.argv.includes('--check')) {
  const problems = check();
  if (problems.length > 0) {
    console.error(
      'Skill copies drifted from packages/create/skill. Run: node scripts/agent-skills/sync.mjs',
    );
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log('Skill copies are in sync.');
} else {
  sync();
  console.log(`Wrote ${TARGETS.map((t) => relative(ROOT, t)).join(' and ')}.`);
}
