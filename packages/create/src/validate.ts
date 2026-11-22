/**
 * check-app (also `validate`): checks an Agent App project against the rules an author
 * or an agent would otherwise have to remember.
 *
 * Tools are checked as the host sees them: the app is loaded and asked for its tool list
 * (see inspect.ts). Only when the app cannot be loaded does it fall back to reading the
 * source, and then finding no tool is an error.
 *
 * Errors (non-zero exit): manifest schema; the app cannot be loaded; no tools; a tool
 * without all five annotations as booleans; a read-only tool marked `sensitive`; a tool name that is not kebab-case or that starts with the
 * app's own name; a
 * read-only tool marked destructive; agentapp.json differs from `app.toManifest()`; a mono
 * logo with a colour (`fill`/`stroke` other than none/currentColor/inherit, or `<style>`);
 * a PNG logo under 1024x1024; a missing logo without a TODO in the README's Logos
 * section; an empty Logos section; a README without Logos or Terms of use; and, inside
 * the agentapps monorepo, a missing agentapps.example.json entry or lockfile importer.
 * Warnings: TODO left in the manifest or README, a logo still pending, no health check,
 * secret hints that name the app id, an XML declaration in a logo, a missing
 * `access: "authenticated"` (when the protocol supports it). With `strict`, TODO text left
 * in agentapp.json or the README becomes an error (a documented logo TODO stays a warning).
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { AppManifestSchema, safeParseAppManifest, type ToolDefinition } from '@agentapps/protocol';
import { inspectApp } from './inspect.js';
import { findRepoRoot } from './scaffold.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ValidationOptions {
  cwd?: string;
  verbose?: boolean;
  /** Treat TODO text in agentapp.json or the README as errors: use before shipping. */
  strict?: boolean;
  /** How long loading the app may take (default 10 s). */
  loadTimeoutMs?: number;
}

const ANNOTATIONS = [
  'readOnlyHint',
  'destructiveHint',
  'idempotentHint',
  'openWorldHint',
  'sensitive',
] as const;

/** Colour values a tintable mono logo may use. */
const NEUTRAL_PAINT = new Set(['none', 'currentcolor', 'inherit']);

function readJson(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|mts|js|mjs)$/.test(entry) ? [full] : [];
  });
}

function pngSize(file: string): { width: number; height: number } | null {
  const buf = readFileSync(file);
  if (buf.length < 24 || buf.toString('ascii', 1, 4) !== 'PNG') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** The text of a `## <title>` section, up to the next `## ` heading (or null). */
export function readmeSection(readme: string, title: string): string | null {
  const match = new RegExp(
    `^##\\s+${title}[^\\n]*\\n([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`,
    'm',
  ).exec(readme);
  return match ? match[1] : null;
}

/** Colours a mono logo must not carry: every fill/stroke value except none/currentColor/inherit. */
export function monoLogoColours(svg: string): string[] {
  const found: string[] = [];
  if (/<style\b/i.test(svg)) found.push('<style>');
  const regex = /\b(fill|stroke)\s*[=:]\s*(["']?)([^"';>]+)\2/gi;
  for (let m = regex.exec(svg); m !== null; m = regex.exec(svg)) {
    const value = m[3].trim();
    if (!NEUTRAL_PAINT.has(value.toLowerCase())) found.push(`${m[1]}=${value}`);
  }
  return found;
}

/** Each `.tool('name', { ... })` call with the source text up to the next one (fallback only). */
export function findToolBlocks(source: string): Array<{ name: string; body: string }> {
  const regex = /\.tool\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*\{/g;
  const starts: Array<{ name: string; index: number }> = [];
  for (let m = regex.exec(source); m !== null; m = regex.exec(source)) {
    starts.push({ name: m[1], index: m.index });
  }
  return starts.map((s, i) => ({
    name: s.name,
    body: source.slice(s.index, starts[i + 1]?.index ?? source.length),
  }));
}

function checkManifest(
  cwd: string,
  errors: string[],
  warnings: string[],
  logosSection: string | null,
) {
  const manifest = readJson(join(cwd, 'agentapp.json'));
  if (!manifest) {
    errors.push('Missing or unreadable agentapp.json');
    return null;
  }
  const result = safeParseAppManifest(manifest);
  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push(`agentapp.json: ${issue.path.join('.') || '(root)'}: ${issue.message}`);
    }
  }
  for (const key of ['description', 'tagline'] as const) {
    if (typeof manifest[key] === 'string' && /\bTODO\b/.test(manifest[key] as string)) {
      warnings.push(`agentapp.json ${key} still contains TODO`);
    }
  }

  const logoTodo = logosSection !== null && /\bTODO\b/.test(logosSection);
  for (const key of ['logo', 'logoMono'] as const) {
    const rel = manifest[key];
    if (typeof rel !== 'string') continue;
    const file = join(cwd, rel);
    if (!existsSync(file)) {
      if (logoTodo) {
        warnings.push(`${key} ${rel} is still a TODO (README, Logos)`);
      } else {
        errors.push(
          `${key} file ${rel} is missing and the README's Logos section has no TODO: add it from an official brand source, or record where you searched (never generate a logo)`,
        );
      }
      continue;
    }
    if (rel.toLowerCase().endsWith('.png')) {
      const size = pngSize(file);
      if (!size || size.width < 1024 || size.height < 1024) {
        errors.push(
          `${key} is a PNG under 1024x1024 (${size ? `${size.width}x${size.height}` : 'unreadable'})`,
        );
      }
      continue;
    }
    const svg = readFileSync(file, 'utf-8');
    if (svg.trimStart().startsWith('<?xml')) {
      warnings.push(
        `${key} starts with an <?xml ...?> declaration, which some linters (biome) cannot parse; removing that line is allowed (note it in the README's Logos table)`,
      );
    }
    if (key === 'logoMono') {
      const colours = monoLogoColours(svg);
      if (colours.length > 0) {
        errors.push(
          `logoMono carries its own colours (${colours.slice(0, 3).join(', ')}); the host must be able to tint it: remove them or use currentColor`,
        );
      }
    }
  }
  return manifest;
}

/**
 * What is wrong with a tool's name, if anything. Names are kebab-case, and do not start
 * with the app's own name: the Host already puts the Installation's alias in front.
 *
 * @spec DEVX-REQ-5
 */
export function toolNameProblem(name: string, appId?: string): string | undefined {
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) {
    return 'tool names are kebab-case: lowercase letters and digits joined by single hyphens, starting with a letter (list-issues, not list_issues or listIssues)';
  }
  if (!appId) return undefined;
  const segments = appId.replace(/^app\./, '').split('.');
  const prefixes = new Set([segments[segments.length - 1], segments.join('-')]);
  for (const prefix of prefixes) {
    if (name.startsWith(`${prefix}-`)) {
      return `drop the '${prefix}-' prefix: an agent already sees the tool as <alias>__<tool>, so the app's name would appear twice`;
    }
  }
  return undefined;
}

/** Checks the tools the app registers (description, parameters, annotations); returns the sensitive ones. */
function checkTools(tools: ToolDefinition[], errors: string[], appId?: string): string[] {
  const sensitive: string[] = [];
  for (const tool of tools) {
    const nameProblem = toolNameProblem(tool.name, appId);
    if (nameProblem) errors.push(`Tool '${tool.name}': ${nameProblem}`);
    if (typeof tool.description !== 'string' || !tool.description.trim()) {
      errors.push(`Tool '${tool.name}' has no description`);
    }
    const params = tool.parameters as { type?: unknown } | undefined;
    if (!params || typeof params !== 'object' || params.type !== 'object') {
      errors.push(`Tool '${tool.name}' has no parameters schema of type "object"`);
    }
    const a = (tool.annotations ?? {}) as Record<string, unknown>;
    const missing = ANNOTATIONS.filter((k) => typeof a[k] !== 'boolean');
    if (missing.length > 0) {
      errors.push(
        `Tool '${tool.name}' does not declare ${missing.join(', ')} (all five, as booleans)`,
      );
      continue;
    }
    if (a.sensitive) sensitive.push(tool.name);
    // DEVX-REQ-4: a tool that changes nothing never asks; a tool that changes only the
    // app's own data in Agent Apps does not have to.
    if (a.sensitive && a.readOnlyHint) {
      errors.push(
        `Tool '${tool.name}': sensitive must be false (a read-only tool changes nothing, so it never waits for approval)`,
      );
    }
    if (a.readOnlyHint && a.destructiveHint) {
      errors.push(`Tool '${tool.name}': a read-only tool cannot be destructive`);
    }
  }
  return sensitive;
}

/** Source-reading fallback for when the app cannot be loaded. */
function checkToolsFromSource(all: string, errors: string[]): string[] {
  const blocks = findToolBlocks(all);
  if (blocks.length === 0) {
    errors.push('No tools found in src/ (and the app could not be loaded to list them)');
    return [];
  }
  const sensitive: string[] = [];
  for (const { name, body } of blocks) {
    if (!/description\s*:/.test(body)) errors.push(`Tool '${name}' is missing a description`);
    if (!/parameters\s*:\s*\{/.test(body))
      errors.push(`Tool '${name}' is missing parameters schema`);
    const value = (k: string) => new RegExp(`\\b${k}\\s*:\\s*true\\b`).test(body);
    if (value('sensitive')) sensitive.push(name);
  }
  return sensitive;
}

/** The secret names an app declares, by kind. */
function declaredSecrets(manifest: unknown): { user: string[]; system: string[] } {
  const auth = (
    manifest as { auth?: { installationSecrets?: unknown; systemSecrets?: unknown } } | null
  )?.auth;
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
  return { user: list(auth?.installationSecrets), system: list(auth?.systemSecrets) };
}

/**
 * Whether a hint that runs `agentapps config app.<id> ...` is setting installation secrets, which
 * belong on the installed alias. System secrets (an OAuth client) do belong on the app id,
 * so the hint is fine when it names no user secret and the app declares system secrets.
 * The text after the match is read too: a message is often split over two string literals.
 */
export function configHintTargetsUserSecrets(
  text: string,
  secrets: { user: string[]; system: string[] },
): boolean {
  for (const match of text.matchAll(/agentapps config app\./g)) {
    const window = text.slice(match.index, match.index + 200);
    const names = new Set(window.match(/\b[A-Z][A-Z0-9_]*\b/g) ?? []);
    if (secrets.user.some((s) => names.has(s))) return true;
    if (secrets.system.length === 0) return true;
  }
  return false;
}

function checkSource(cwd: string, errors: string[], warnings: string[], manifest: unknown): string {
  const files = sourceFiles(join(cwd, 'src'));
  const all = files.map((f) => readFileSync(f, 'utf-8')).join('\n');
  if (!all.includes('createApp')) errors.push('src/ must call createApp() from @agentapps/sdk');
  if (!existsSync(join(cwd, 'src', 'app.ts'))) errors.push('Missing src/app.ts');
  if (!all.includes('.health(')) {
    warnings.push('No health check registered: add app.health() with one cheap request');
  }
  const secrets = declaredSecrets(manifest);
  for (const file of files) {
    if (configHintTargetsUserSecrets(readFileSync(file, 'utf-8'), secrets)) {
      warnings.push(
        `${relative(cwd, file)} tells users \`agentapps config app.<id>\`; installation secrets are set on the installed alias`,
      );
    }
  }
  return all;
}

/** Whether the installed protocol version knows the per-app `access` field. */
export function protocolSupportsAccess(): boolean {
  const shape = (AppManifestSchema as unknown as { shape?: Record<string, unknown> }).shape;
  return Boolean(shape && 'access' in shape);
}

function checkRepoWiring(cwd: string, errors: string[]) {
  const root = findRepoRoot(cwd);
  if (!root || resolve(cwd) !== join(root, 'apps', basename(cwd))) return;
  const id = basename(cwd);
  const example = readJson(join(root, 'agentapps.example.json')) as {
    apps?: Array<{ source?: string }>;
  } | null;
  if (!example?.apps?.some((a) => resolve(root, a.source ?? '') === resolve(cwd))) {
    errors.push(`Not listed in agentapps.example.json: add { "source": "./apps/${id}" }`);
  }
  const lockPath = join(root, 'pnpm-lock.yaml');
  if (existsSync(lockPath)) {
    const lock = readFileSync(lockPath, 'utf-8');
    if (!lock.split('\n').includes(`  apps/${id}:`)) {
      errors.push(
        `pnpm-lock.yaml has no "apps/${id}:" importer: run \`pnpm install\` and commit the lockfile`,
      );
    }
  }
}

function sameManifest(a: unknown, b: unknown): boolean {
  const pa = safeParseAppManifest(a);
  const pb = safeParseAppManifest(b);
  if (!pa.success || !pb.success) return true; // schema errors are reported elsewhere
  return JSON.stringify(pa.data) === JSON.stringify(pb.data);
}

export async function validate(options: ValidationOptions = {}): Promise<ValidationResult> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const errors: string[] = [];
  const warnings: string[] = [];

  const pkg = readJson(join(cwd, 'package.json'));
  if (!pkg) {
    errors.push('Missing package.json');
    return { valid: false, errors, warnings };
  }
  const deps = { ...(pkg.dependencies as object), ...(pkg.devDependencies as object) };
  if (!('@agentapps/sdk' in deps)) errors.push('Missing @agentapps/sdk dependency');

  const readmePath = join(cwd, 'README.md');
  const readme = existsSync(readmePath) ? readFileSync(readmePath, 'utf-8') : null;
  const logosSection = readme ? readmeSection(readme, 'Logos') : null;
  if (!readme) {
    errors.push('No README.md: it records setup, secrets, the service terms and logo sources');
  } else {
    if (logosSection === null) {
      errors.push('README.md has no "## Logos" section (where each logo came from, or a TODO)');
    } else if (!logosSection.trim()) {
      errors.push('README.md\'s "## Logos" section is empty: name each logo\'s source, or a TODO');
    }
    const terms = readmeSection(readme, 'Terms');
    if (terms === null) {
      errors.push('README.md has no "## Terms of use" section (the service terms that apply)');
    }
    for (const [title, text] of [
      ['Terms of use', terms],
      ['Tools', readmeSection(readme, 'Tools')],
    ] as const) {
      if (text && /\bTODO\b/.test(text)) warnings.push(`README.md "${title}" still contains TODO`);
    }
  }

  const manifest = checkManifest(cwd, errors, warnings, logosSection);
  const source = checkSource(cwd, errors, warnings, readJson(join(cwd, 'agentapp.json')));

  let sensitiveTools: string[] = [];
  try {
    const inspection = await inspectApp(cwd, { loadTimeoutMs: options.loadTimeoutMs });
    if (inspection.tools.length === 0) {
      errors.push('The app registers no tools');
    }
    sensitiveTools = checkTools(
      inspection.tools,
      errors,
      typeof manifest?.id === 'string' ? manifest.id : undefined,
    );
    if (manifest && inspection.generatedManifest !== undefined) {
      if (!sameManifest(manifest, inspection.generatedManifest)) {
        errors.push(
          'agentapp.json differs from the createApp() config in src/app.ts (app.toManifest()): change both together',
        );
      }
    }
  } catch (err) {
    errors.push(
      `Could not load the app to list its tools (${err instanceof Error ? err.message : err}); checked the source instead`,
    );
    sensitiveTools = checkToolsFromSource(source, errors);
  }

  if (manifest && sensitiveTools.length > 0 && protocolSupportsAccess()) {
    if (manifest.access !== 'authenticated') {
      warnings.push(
        `Tools ${sensitiveTools.join(', ')} are sensitive: declare "access": "authenticated" in agentapp.json and createApp()`,
      );
    }
  }

  checkRepoWiring(cwd, errors);

  if (options.strict) {
    // A documented logo TODO is a legitimate state to ship in (no official asset exists);
    // TODO text in the manifest or the README is not.
    const unfinished = warnings.filter(
      (w) => /TODO/.test(w) && (w.startsWith('agentapp.json') || w.startsWith('README.md')),
    );
    for (const w of unfinished) errors.push(`${w} (--strict)`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/** Alias of {@link validate}, matching the `check-app` command. */
export function checkApp(options: ValidationOptions = {}): Promise<ValidationResult> {
  return validate(options);
}

export function printValidation(result: ValidationResult): void {
  if (result.errors.length > 0) {
    console.error('\n❌ Validation errors:');
    for (const err of result.errors) console.error(`  • ${err}`);
  }
  if (result.warnings.length > 0) {
    console.warn('\n⚠️  Warnings:');
    for (const warn of result.warnings) console.warn(`  • ${warn}`);
  }
  if (result.valid && result.warnings.length === 0) {
    console.log('\n✅ Validation passed — app looks good!');
  } else if (result.valid) {
    console.log('\n✅ Validation passed with warnings.');
  }
  // Set explicitly: callers default the exit code to failure before the app is loaded.
  process.exitCode = result.valid ? 0 : 1;
  if (!result.valid) console.error('\n❌ Validation failed.');
}
