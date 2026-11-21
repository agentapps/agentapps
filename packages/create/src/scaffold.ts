/**
 * Scaffolding logic: generate an Agent App in the current conventions.
 *
 * One manifest object feeds both `agentapp.json` and the `createApp()` config in
 * `src/app.ts`, so they start identical (the generated tests keep them that way).
 * Shared files (manifest, package.json, tsconfig, README, test harness, manifest
 * tests) are generated here; each template only supplies `src/**` and
 * `test/tools.test.ts`.
 *
 * Two modes:
 * - `repo`: inside the agentapps monorepo. Writes `apps/<id>/` with workspace
 *   dependencies and lists the app in `agentapps.example.json`.
 * - `standalone`: anywhere else. Writes `./<id>/` as a self-contained project.
 */

import { execSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppIdRegex } from '@agentapps/protocol';

const __dirname = dirname(fileURLToPath(import.meta.url));

export type TemplateName = 'api' | 'minimal' | 'full' | 'typescript';
export type ScaffoldMode = 'repo' | 'standalone';

export interface ScaffoldOptions {
  /** Kebab-case name: the directory, the alias in examples, and the id after `app.`. */
  projectName: string;
  /**
   * Manifest id when it is not `app.<projectName>`, such as `app.google.search-console` for
   * a vendor with several apps in the catalog. The directory stays `projectName`.
   */
  appId?: string;
  /** Template (default `api`). `typescript` is an alias of `minimal`. */
  template?: TemplateName;
  /** Display name (default: the id in title case). */
  name?: string;
  description?: string;
  /** Author name for the manifest (default `Your Name`). */
  author?: string;
  /** Author email for the manifest (default `you@example.com`). */
  authorEmail?: string;
  /** API base URL (`api` template). */
  baseUrl?: string;
  /** Auth model (`api` template): `none` (default), `api-key` or `oauth2`. */
  auth?: 'none' | 'api-key' | 'oauth2';
  /** Installation secrets for `api-key` auth, UPPER_SNAKE_CASE. */
  secrets?: string[];
  /**
   * System secrets for `api-key` auth (shared by every installation, set on the app id),
   * UPPER_SNAKE_CASE. The SDK does not enforce them; the generated client checks them.
   */
  systemSecrets?: string[];
  /** `oauth2`: provider id. `google` and `microsoft` also fill in the endpoint URLs. */
  provider?: string;
  /** `oauth2`: least-privilege scopes (at least one). */
  scopes?: string[];
  /** `oauth2`: authorization endpoint (default from a known provider). */
  authorizeUrl?: string;
  /** `oauth2`: token endpoint (default from a known provider). */
  tokenUrl?: string;
  /** `oauth2`: use PKCE (default false). */
  pkce?: boolean;
  category?: string;
  /** Path the health check requests (`api` template, default `/`). */
  healthPath?: string;
  /** Force a mode; default detects the monorepo by walking up from `cwd`. */
  mode?: ScaffoldMode;
  /** Directory to resolve from (default `process.cwd()`). */
  cwd?: string;
  /** Write the app here instead of the default location. */
  destDir?: string;
  /** Repo mode: add the app to agentapps.example.json (default true). */
  register?: boolean;
  /** Skip installing dependencies (repo mode never installs). */
  skipInstall: boolean;
  /** Skip `git init` (repo mode never initialises git). */
  skipGit: boolean;
  /** Standalone mode: the npm package name (default: the app id). Use a scoped name to publish. */
  packageName?: string;
  /**
   * Standalone mode: agents to install the create-agent-app skill for (see
   * {@link AGENT_SKILL_DIRS}), or `['all']` (default). An empty list installs no skill.
   */
  agents?: string[];
}

/**
 * Where each coding agent reads project skills (SKILL.md folders), per its documentation.
 * `.agents/skills` is the shared folder most agents read; Claude Code reads `.claude/skills`.
 */
export const AGENT_SKILL_DIRS: Record<string, string> = {
  claude: '.claude/skills',
  codex: '.agents/skills',
  gemini: '.agents/skills',
  copilot: '.agents/skills',
  cursor: '.agents/skills',
  opencode: '.agents/skills',
};

/** The skill folders to write for a list of agent names (`all` means every known agent). */
export function skillDirsFor(agents: string[]): string[] {
  const names = agents.includes('all') ? Object.keys(AGENT_SKILL_DIRS) : agents;
  const unknown = names.filter((n) => !(n in AGENT_SKILL_DIRS));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown agent(s): ${unknown.join(', ')}. Known: ${Object.keys(AGENT_SKILL_DIRS).join(', ')}, all`,
    );
  }
  return [...new Set(names.map((n) => AGENT_SKILL_DIRS[n]))].sort();
}

interface TemplateSpec {
  dir: string;
  description: (name: string) => string;
  tools: string[];
  sensitive: string[];
  destructive: string[];
}

const TEMPLATES: Record<Exclude<TemplateName, 'typescript'>, TemplateSpec> = {
  api: {
    dir: 'api',
    description: (name) =>
      `TODO: describe what the ${name} app lets an agent do and which API it uses.`,
    tools: ['get-example'],
    sensitive: [],
    destructive: [],
  },
  minimal: {
    dir: 'minimal',
    description: () => 'A minimal Agent App with one read-only tool and a health check.',
    tools: ['hello'],
    sensitive: [],
    destructive: [],
  },
  full: {
    dir: 'full',
    description: () =>
      'A sample Agent App with several tools, progress reporting, cancellation and a health check.',
    tools: ['countdown', 'echo', 'greet'],
    sensitive: [],
    destructive: [],
  },
};

const SHARED_DIR = '_shared';

/** Endpoints of OAuth providers that several apps share, so `--provider` alone is enough. */
export const OAUTH_PROVIDERS: Record<string, { authorizeUrl: string; tokenUrl: string }> = {
  google: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
  },
  microsoft: {
    authorizeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
  },
};

/** What the host's OAuth flow reads (system) and writes (user) for an `oauth2` app. */
const OAUTH_SYSTEM_SECRETS = ['CLIENT_ID', 'CLIENT_SECRET', 'REDIRECT_URI'];
const OAUTH_USER_SECRETS = ['ACCESS_TOKEN', 'REFRESH_TOKEN', 'EXPIRY_DATE'];

export function validateProjectName(name: string): string | null {
  if (!name) return 'Project name is required';
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    return 'Project name must be kebab-case (lowercase letters, numbers, hyphens), starting with a letter';
  }
  if (name.length > 50) return 'Project name must be 50 characters or less';
  return null;
}

/** The create-agent-app skill shipped with this package. */
export function getSkillDir(): string {
  return join(__dirname, '..', 'skill', 'create-agent-app');
}

/** Templates live at the package root, one level above src/ or dist/. */
export function getTemplateDir(template: string): string {
  return join(__dirname, '..', 'templates', template);
}

/**
 * Finds the agentapps monorepo root above `from`: a directory with
 * pnpm-workspace.yaml, apps/ and packages/sdk/package.json.
 */
export function findRepoRoot(from: string): string | null {
  let dir = resolve(from);
  for (;;) {
    if (
      existsSync(join(dir, 'pnpm-workspace.yaml')) &&
      existsSync(join(dir, 'apps')) &&
      existsSync(join(dir, 'packages', 'sdk', 'package.json'))
    ) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Renders a template string. `{{KEY}}` is replaced by `vars[KEY]`;
 * `{{#FLAG}}...{{/FLAG}}` is kept only when `flags[FLAG]` is true and
 * `{{^FLAG}}...{{/FLAG}}` only when it is false.
 */
export function renderTemplate(
  text: string,
  vars: Record<string, string>,
  flags: Record<string, boolean> = {},
): string {
  return renderSections(text, flags).replace(/\{\{([A-Z_]+)\}\}/g, (m, key) =>
    key in vars ? vars[key] : m,
  );
}

/** Keeps or drops `{{#FLAG}}` / `{{^FLAG}}` sections; sections with other flags may nest. */
function renderSections(text: string, flags: Record<string, boolean>): string {
  return text.replace(
    /\{\{([#^])([A-Z_]+)\}\}\n?([\s\S]*?)\{\{\/\2\}\}\n?/g,
    (_m, kind, key, body) =>
      (kind === '#') === Boolean(flags[key]) ? renderSections(body, flags) : '',
  );
}

/** Copies a template directory, rendering every file and dropping a `.tmpl` suffix. */
export function copyTemplate(
  src: string,
  dest: string,
  vars: Record<string, string>,
  flags: Record<string, boolean> = {},
): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry.replace(/\.tmpl$/, ''));
    if (statSync(srcPath).isDirectory()) {
      copyTemplate(srcPath, destPath, vars, flags);
    } else {
      writeFileSync(destPath, renderTemplate(readFileSync(srcPath, 'utf-8'), vars, flags), 'utf-8');
    }
  }
}

/** Renders a JSON value as a TypeScript literal (single quotes, bare keys). */
export function tsLiteral(value: unknown, indent = 0): string {
  const pad = ' '.repeat(indent);
  const inner = ' '.repeat(indent + 2);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.every((v) => typeof v !== 'object' || v === null)) {
      return `[${value.map((v) => tsLiteral(v)).join(', ')}]`;
    }
    return `[\n${value.map((v) => `${inner}${tsLiteral(v, indent + 2)},`).join('\n')}\n${pad}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    const lines = entries.map(([k, v]) => {
      const key = /^[A-Za-z_$][\w$]*$/.test(k) ? k : `'${k}'`;
      return `${inner}${key}: ${tsLiteral(v, indent + 2)},`;
    });
    return `{\n${lines.join('\n')}\n${pad}}`;
  }
  if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  return String(value);
}

function titleCase(id: string): string {
  return id
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * The semver range of a published @agentapps package, for standalone projects.
 *
 * A published @agentapps/create lists its sibling packages with exact versions (pnpm turns
 * `workspace:*` into the version at publish time), so that is the first source. Running from
 * the monorepo source it is still `workspace:*`; then the installed package's package.json
 * is read from node_modules directly (its `exports` map does not expose package.json).
 */
export function publishedRange(pkg: string): string {
  const own = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
  const declared: string | undefined = own.dependencies?.[pkg] ?? own.devDependencies?.[pkg];
  if (declared && /^\d+\.\d+\.\d+/.test(declared)) return `^${declared}`;
  if (declared && /^[\^~]\d/.test(declared)) return declared;
  // Node's own lookup order: node_modules/<pkg> in this directory and every parent.
  for (let dir = __dirname; ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', ...pkg.split('/'), 'package.json');
    if (existsSync(candidate)) {
      return `^${JSON.parse(readFileSync(candidate, 'utf-8')).version}`;
    }
    if (dirname(dir) === dir) break;
  }
  // The @agentapps packages are versioned together (one changesets "fixed" group).
  return `^${ownVersion()}`;
}

function ownVersion(): string {
  return JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')).version;
}

function toPosix(p: string): string {
  return p.split('\\').join('/');
}

export function runCommand(cmd: string, args: string[], cwd: string): void {
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: false });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(' ')}`);
  }
}

/**
 * Initialises a git repository with one commit. Returns a warning when the commit could
 * not be made (no git, or no git identity on a fresh machine), so the caller can say so.
 */
export function initGit(cwd: string): string | null {
  const run = (cmd: string) => execSync(cmd, { cwd, stdio: 'pipe' });
  try {
    run('git init');
  } catch {
    return 'git is not available: the project was not put under version control';
  }
  try {
    run('git add .');
    run('git commit -m "chore: initial commit from @agentapps/create"');
    return null;
  } catch {
    return 'git init ran, but the first commit failed (is user.name / user.email set?): run `git add . && git commit` yourself';
  }
}

/** The package manager that launched us (npm create / pnpm create / yarn create), default npm. */
export function detectPackageManager(): 'npm' | 'pnpm' | 'yarn' {
  const agent = process.env.npm_config_user_agent ?? '';
  if (agent.startsWith('pnpm')) return 'pnpm';
  if (agent.startsWith('yarn')) return 'yarn';
  return 'npm';
}

export function runInstall(cwd: string): void {
  runCommand(detectPackageManager(), ['install'], cwd);
}

/**
 * Adds `{ "source": "./apps/<id>" }`, one entry per line, right after the entry that sorts just
 * before it (or before the first entry when it sorts first). The list is not sorted as a
 * whole, but this keeps the diff to one new line unless the app lands after the last entry,
 * and apps scaffolded in parallel land in different places, so their PRs do not conflict.
 */
export function registerInExampleConfig(repoRoot: string, id: string): boolean {
  const path = join(repoRoot, 'agentapps.example.json');
  if (!existsSync(path)) return false;
  const text = readFileSync(path, 'utf-8');
  const source = `./apps/${id}`;
  const config = JSON.parse(text) as { apps?: Array<{ source?: string }> };
  if (config.apps?.some((a) => a.source === source)) return false;

  const lines = text.split('\n');
  const entries = lines
    .map((line, index) => ({ index, source: line.match(/^\s*\{ "source": "([^"]+)"/)?.[1] }))
    .filter((e): e is { index: number; source: string } => e.source !== undefined);
  if (entries.length === 0) {
    throw new Error('agentapps.example.json has no app entries to add to');
  }
  const before = entries
    .filter((e) => e.source < source)
    .reduce<{ index: number; source: string } | undefined>(
      (best, e) => (!best || e.source > best.source ? e : best),
      undefined,
    );
  const last = entries[entries.length - 1];
  const indent = lines[entries[0].index].match(/^\s*/)?.[0] ?? '    ';
  const entry = `${indent}{ "source": "${source}" }`;
  if (!before) {
    lines.splice(entries[0].index, 0, `${entry},`);
  } else if (before.index === last.index) {
    lines[last.index] = lines[last.index].trimEnd().replace(/,?$/, ',');
    lines.splice(last.index + 1, 0, entry);
  } else {
    lines.splice(before.index + 1, 0, `${entry},`);
  }
  const updated = lines.join('\n');
  JSON.parse(updated);
  writeFileSync(path, updated);
  return true;
}

export interface ScaffoldResult {
  destDir: string;
  /** Standalone mode: the skill folders written (relative to destDir). */
  skillDirs: string[];
  /** Things the user should know or do (formatting not run, git commit failed). */
  notes: string[];
  mode: ScaffoldMode;
  appId: string;
  repoRoot: string | null;
  registered: boolean;
}

/** Generates the app and returns where it went. See {@link scaffoldApp} for details. */
export async function scaffold(options: ScaffoldOptions): Promise<string> {
  return (await scaffoldApp(options)).destDir;
}

export async function scaffoldApp(options: ScaffoldOptions): Promise<ScaffoldResult> {
  const id = options.projectName;
  const nameError = validateProjectName(id);
  if (nameError) throw new Error(nameError);

  const templateName = options.template === 'typescript' ? 'minimal' : (options.template ?? 'api');
  const spec = TEMPLATES[templateName];
  if (!spec) throw new Error(`Template not found: ${options.template}`);

  const auth = options.auth ?? 'none';
  if (!['none', 'api-key', 'oauth2'].includes(auth)) {
    throw new Error(`Unknown auth type: ${auth}. Choose none, api-key or oauth2`);
  }
  const secrets = options.secrets ?? [];
  const extraSystemSecrets = options.systemSecrets ?? [];
  const scopes = options.scopes ?? [];
  if (templateName !== 'api' && (options.auth || secrets.length || options.baseUrl)) {
    throw new Error('--auth, --secrets and --base-url apply to the api template only');
  }
  if (auth === 'api-key' && secrets.length === 0) {
    throw new Error('api-key auth needs at least one secret name (--secrets KEY_ONE,KEY_TWO)');
  }
  if (auth !== 'api-key' && (secrets.length > 0 || extraSystemSecrets.length > 0)) {
    throw new Error(
      auth === 'oauth2'
        ? '--secrets and --system-secrets apply to api-key auth: the host OAuth flow writes the tokens'
        : '--secrets and --system-secrets need --auth api-key',
    );
  }
  for (const s of [...secrets, ...extraSystemSecrets]) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(s)) throw new Error(`Secret names are UPPER_SNAKE_CASE: ${s}`);
  }
  const overlap = secrets.filter((s) => extraSystemSecrets.includes(s));
  if (overlap.length > 0) {
    throw new Error(
      `A secret is either a user or a system secret, not both: ${overlap.join(', ')}`,
    );
  }
  const oauthOptions = [options.provider, options.authorizeUrl, options.tokenUrl, options.pkce];
  if (auth !== 'oauth2' && (scopes.length > 0 || oauthOptions.some((o) => o !== undefined))) {
    throw new Error(
      '--provider, --scopes, --authorize-url, --token-url and --pkce need --auth oauth2',
    );
  }
  let oauth: Record<string, unknown> | undefined;
  if (auth === 'oauth2') {
    const provider = options.provider ?? '';
    if (!/^[a-z][a-z0-9-]*$/.test(provider)) {
      throw new Error(
        'oauth2 auth needs --provider <name> (lowercase, such as google or microsoft)',
      );
    }
    const known = OAUTH_PROVIDERS[provider];
    const authorizeUrl = options.authorizeUrl ?? known?.authorizeUrl;
    const tokenUrl = options.tokenUrl ?? known?.tokenUrl;
    if (!authorizeUrl || !tokenUrl) {
      throw new Error(
        `oauth2 auth for ${provider} needs --authorize-url and --token-url (known providers: ${Object.keys(OAUTH_PROVIDERS).join(', ')})`,
      );
    }
    new URL(authorizeUrl);
    new URL(tokenUrl);
    if (scopes.length === 0) {
      throw new Error('oauth2 auth needs at least one scope (--scopes scope-one,scope-two)');
    }
    oauth = {
      type: 'oauth2',
      provider,
      systemSecrets: OAUTH_SYSTEM_SECRETS,
      installationSecrets: OAUTH_USER_SECRETS,
      authorizeUrl,
      tokenUrl,
      scopes,
      pkce: options.pkce ?? false,
    };
  }
  const systemSecrets = auth === 'oauth2' ? OAUTH_SYSTEM_SECRETS : extraSystemSecrets;
  const baseUrl = (options.baseUrl ?? 'https://api.example.com').replace(/\/+$/, '');
  new URL(baseUrl);

  const cwd = resolve(options.cwd ?? process.cwd());
  const repoRoot = options.mode === 'standalone' ? null : findRepoRoot(cwd);
  if (options.mode === 'repo' && !repoRoot) {
    throw new Error('Repo mode needs the agentapps monorepo above the current directory');
  }
  const mode: ScaffoldMode = repoRoot ? 'repo' : 'standalone';
  const destDir = resolve(
    options.destDir ?? (repoRoot ? join(repoRoot, 'apps', id) : join(cwd, id)),
  );
  if (existsSync(destDir)) throw new Error(`Directory already exists: ${destDir}`);
  // Validated before anything is written; repo mode never installs the skill (the repo has it).
  const skillDirs = mode === 'standalone' ? skillDirsFor(options.agents ?? ['all']) : [];

  const appId = options.appId ?? `app.${id}`;
  if (!AppIdRegex.test(appId)) {
    throw new Error(
      `App id must be app. followed by lowercase dot-separated segments (app.google.ads): ${appId}`,
    );
  }
  const name = options.name ?? titleCase(id);
  const errorPrefix = id.toUpperCase().replace(/[^A-Z0-9]+/g, '_');

  // One object feeds both agentapp.json and createApp(), so they start identical.
  const manifest: Record<string, unknown> = {
    id: appId,
    name,
    version: '1.0.0',
    description: options.description ?? spec.description(name),
    tagline: `TODO: one-line tagline for ${name}`,
    author: {
      name: options.author || (repoRoot ? 'Pablo López Torres' : 'Your Name'),
      email: options.authorEmail || (repoRoot ? 'pablolopeztorres@gmail.com' : 'you@example.com'),
    },
    license: 'MIT',
    logo: 'assets/logo.svg',
    logoMono: 'assets/logo-mono.svg',
    terms: 'https://agentapps.tech/terms',
    category: options.category ?? (templateName === 'api' ? 'productivity' : 'samples'),
    keywords: [id],
    entrypoint: { type: 'module', path: 'src/app.ts', export: 'factory' },
    runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
    capabilities: {
      tools: true,
      health: true,
      ...(templateName === 'full' ? { streaming: true } : {}),
    },
    ...(auth === 'api-key'
      ? {
          auth: {
            type: 'api-key',
            ...(systemSecrets.length > 0 ? { systemSecrets } : {}),
            installationSecrets: secrets,
          },
        }
      : {}),
    ...(oauth ? { auth: oauth } : {}),
  };

  const alias = id;
  const fakeUserSecrets: Record<string, string> =
    auth === 'oauth2'
      ? {
          ACCESS_TOKEN: 'fake-access-token',
          REFRESH_TOKEN: 'fake-refresh-token',
          EXPIRY_DATE: '2099-01-01T00:00:00.000Z',
        }
      : Object.fromEntries(secrets.map((s) => [s, `fake-${s.toLowerCase()}`]));
  const fakeSystemSecrets: Record<string, string> =
    auth === 'oauth2'
      ? {
          CLIENT_ID: 'fake-client-id',
          CLIENT_SECRET: 'fake-client-secret',
          REDIRECT_URI: 'https://station.example.com/auth/callback',
        }
      : Object.fromEntries(systemSecrets.map((s) => [s, `fake-${s.toLowerCase()}`]));
  const vars: Record<string, string> = {
    ID: id,
    APP_ID: appId,
    NAME: name,
    BASE_URL: baseUrl,
    ERROR_PREFIX: errorPrefix,
    HEALTH_PATH: options.healthPath ?? '/',
    CONFIG: tsLiteral(manifest),
    SECRETS_LIST: tsLiteral(secrets),
    SYSTEM_SECRETS_LIST: tsLiteral(systemSecrets),
    FAKE_SECRETS: tsLiteral(fakeUserSecrets, 2),
    FAKE_SYSTEM_SECRETS: tsLiteral(fakeSystemSecrets, 2),
    PROVIDER: options.provider ?? '',
    EXPECTED_TOOLS: tsLiteral(spec.tools),
    SENSITIVE_TOOLS: tsLiteral(spec.sensitive),
    DESTRUCTIVE_TOOLS: tsLiteral(spec.destructive),
    CONFIG_LINES: configLines(auth, appId, alias, secrets, systemSecrets),
    SECRETS_HELP: secretsHelp(auth, appId, alias, secrets, systemSecrets, scopes, options.provider),
    // Legacy placeholders kept for custom templates written against 0.1.
    PROJECT_NAME: id,
    PROJECT_DESCRIPTION: String(manifest.description),
    AUTHOR: (manifest.author as { name: string }).name,
  };
  const flags = {
    AUTH: auth !== 'none',
    API_KEY: auth === 'api-key',
    OAUTH: auth === 'oauth2',
    SYSTEM_SECRETS: auth === 'api-key' && systemSecrets.length > 0,
    REPO: mode === 'repo',
  };

  copyTemplate(getTemplateDir(SHARED_DIR), destDir, vars, flags);
  copyTemplate(getTemplateDir(spec.dir), destDir, vars, flags);

  writeJson(join(destDir, 'agentapp.json'), manifest);
  writeJson(
    join(destDir, 'package.json'),
    packageJson(id, appId, String(manifest.description), mode, options.packageName),
  );
  writeJson(join(destDir, 'tsconfig.json'), tsconfigJson(destDir, repoRoot));
  // Type-checks the tests as well as src/ (vitest itself does not type-check).
  writeJson(join(destDir, 'test', 'tsconfig.json'), {
    extends: '../tsconfig.json',
    compilerOptions: {
      rootDir: '..',
      noEmit: true,
      composite: false,
      declaration: false,
      declarationMap: false,
      types: ['node'],
    },
    include: ['../src', '.'],
  });

  let registered = false;
  const notes: string[] = [];
  if (mode === 'repo' && repoRoot) {
    formatWithBiome(destDir, repoRoot);
    if (options.register !== false && destDir === join(repoRoot, 'apps', id)) {
      registered = registerInExampleConfig(repoRoot, id);
    }
  } else {
    // Standalone projects carry their own lint config, ignore file, AGENTS.md and the skill.
    for (const dir of skillDirs) {
      cpSync(getSkillDir(), join(destDir, dir, 'create-agent-app'), { recursive: true });
    }
    const agentsMd = renderTemplate(
      readFileSync(join(getTemplateDir('_project'), 'AGENTS.md.tmpl'), 'utf-8'),
      { ...vars, SKILL_PATH: `${skillDirs[0] ?? ''}/create-agent-app` },
      { SKILL: skillDirs.length > 0 },
    );
    writeFileSync(join(destDir, 'AGENTS.md'), agentsMd);
    // Agents that do not read AGENTS.md on their own get a pointer to it.
    const agents = new Set(
      (options.agents ?? ['all']).includes('all') ? Object.keys(AGENT_SKILL_DIRS) : options.agents,
    );
    if (agents.has('claude')) {
      // Claude Code reads AGENTS.md only from v2.1.277 and only when no CLAUDE.md exists in
      // this folder or above; importing it from CLAUDE.md works in every case.
      writeFileSync(join(destDir, 'CLAUDE.md'), '@AGENTS.md\n');
    }
    if (agents.has('gemini')) {
      // Gemini CLI reads GEMINI.md unless context.fileName lists other files.
      writeJson(join(destDir, '.gemini', 'settings.json'), {
        context: { fileName: ['AGENTS.md', 'GEMINI.md'] },
      });
    }
    writeFileSync(
      join(destDir, '.gitignore'),
      'node_modules/\ndist/\n.agentapps/\n.secrets/\n*.mcpb\n',
    );
    // pnpm 10.26+ reads build permissions from here (pnpm 11 ignores package.json's "pnpm"
    // field); esbuild's install script fetches the native binary that tsx and vitest need.
    writeFileSync(
      join(destDir, 'pnpm-workspace.yaml'),
      '# Dependencies pnpm may run install scripts for (esbuild fetches its native binary).\nallowBuilds:\n  esbuild: true\n',
    );
    writeJson(join(destDir, 'biome.json'), {
      vcs: { enabled: true, clientKind: 'git', useIgnoreFile: true },
      formatter: { enabled: true, indentStyle: 'space', indentWidth: 2, lineWidth: 100 },
      linter: { enabled: true, rules: { preset: 'recommended' } },
      javascript: { formatter: { quoteStyle: 'single', trailingCommas: 'all' } },
    });
    // Install first, so the lockfile is in the first commit and the project's own biome
    // formats the files; commit last.
    if (!options.skipInstall) runInstall(destDir);
    if (!formatWithBiome(destDir, destDir)) {
      notes.push('Run `npm install && npx biome format --write .` once to format the files.');
    }
    if (!options.skipGit) {
      const warning = initGit(destDir);
      if (warning) notes.push(warning);
    }
  }

  return { destDir, skillDirs, notes, mode, appId, repoRoot, registered };
}

/** The README's setup commands for the secrets: system ones on the app id, user ones on the alias. */
function configLines(
  auth: string,
  appId: string,
  alias: string,
  secrets: string[],
  systemSecrets: string[],
): string {
  if (auth === 'oauth2') {
    return [
      `agentapps config ${appId} CLIENT_ID:"<client id>" CLIENT_SECRET:"<client secret>"`,
      `agentapps ${alias} auth                              # opens the consent page`,
    ].join('\n');
  }
  const lines = [];
  if (systemSecrets.length > 0) {
    lines.push(`agentapps config ${appId} ${systemSecrets.map((s) => `${s}:"<value>"`).join(' ')}`);
  }
  if (secrets.length > 0) {
    lines.push(`agentapps config ${alias} ${secrets.map((s) => `${s}:"<value>"`).join(' ')}`);
  }
  return lines.length > 0 ? lines.join('\n') : '# no secrets needed';
}

function secretsHelp(
  auth: string,
  appId: string,
  alias: string,
  secrets: string[],
  systemSecrets: string[],
  scopes: string[],
  provider?: string,
): string {
  if (auth === 'oauth2') {
    return [
      `The app signs in with ${provider} OAuth. Register an OAuth client with ${provider} (TODO: where,`,
      'and which test users or app review it needs). Its id and secret are *system* secrets, shared',
      `by every installation: set them once on \`${appId}\`. The redirect URI to register is the`,
      "station's `/auth/callback` (`station.publicUrl` in agentapps.json, or `REDIRECT_URI` on the",
      `app id). \`agentapps ${alias} auth\` then opens the consent page; the station stores this`,
      `installation's tokens and refreshes them (\`agentapps ${alias} auth reauth\` starts over).`,
      '',
      `Scopes: ${scopes.map((s) => `\`${s}\``).join(', ')}. TODO: why each one is needed.`,
    ].join('\n');
  }
  const parts = [];
  if (secrets.length > 0) {
    parts.push(
      `Installation secrets are per installation: set them on the alias (\`${alias}\` above), not on \`${appId}\`.`,
    );
  }
  if (systemSecrets.length > 0) {
    parts.push(`System secrets are shared by every installation: set them once on \`${appId}\`.`);
  }
  if (parts.length === 0) return 'No account or key is needed.';
  const items = [...systemSecrets, ...secrets].map(
    (s) => `- \`${s}\`: TODO where to get it and which scopes it needs.`,
  );
  return `${parts.join(' ')}\n\n${items.join('\n')}`;
}

/** A biome binary: the project's own after install, else the nearest one above create. */
function findBiome(destDir: string): string | null {
  const name = process.platform === 'win32' ? 'biome.cmd' : 'biome';
  const own = join(destDir, 'node_modules', '.bin', name);
  if (existsSync(own)) return own;
  for (let dir = __dirname; ; dir = dirname(dir)) {
    const bin = join(dir, 'node_modules', '.bin', name);
    if (existsSync(bin)) return bin;
    if (dirname(dir) === dir) return null;
  }
}

/**
 * Formats the generated files with biome so a fresh project passes its own lint (layout
 * depends on the app's names, so the templates alone cannot guarantee it). Best effort:
 * returns false when no biome is available. `configRoot` is where biome reads its config.
 */
function formatWithBiome(destDir: string, configRoot: string): boolean {
  const bin = findBiome(destDir);
  if (!bin) return false;
  const result = spawnSync(bin, ['format', '--write', '--vcs-enabled=false', destDir], {
    cwd: configRoot,
    stdio: 'ignore',
  });
  return result.status === 0;
}

/**
 * JSON in the layout biome's formatter produces (objects expanded, arrays of plain values on
 * one line when they fit in 100 columns), so a fresh project passes its own lint.
 */
export function formatJson(value: unknown, indent = 0, prefix = 0): string {
  const pad = ' '.repeat(indent);
  const inner = ' '.repeat(indent + 2);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const flat = value.every((v) => v === null || typeof v !== 'object');
    const inline = `[${value.map((v) => JSON.stringify(v)).join(', ')}]`;
    if (flat && prefix + inline.length <= 100) return inline;
    return `[\n${value.map((v) => `${inner}${formatJson(v, indent + 2, inner.length)}`).join(',\n')}\n${pad}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    const lines = entries.map(([k, v]) => {
      const head = `${inner}${JSON.stringify(k)}: `;
      return `${head}${formatJson(v, indent + 2, head.length)}`;
    });
    return `{\n${lines.join(',\n')}\n${pad}}`;
  }
  return JSON.stringify(value);
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${formatJson(value)}\n`);
}

function packageJson(
  id: string,
  appId: string,
  description: string,
  mode: ScaffoldMode,
  packageName?: string,
): Record<string, unknown> {
  if (mode === 'repo') {
    return {
      // DIST-REQ-10: an app's package is named after its app id.
      name: `@agentapps/${appId}`,
      version: '1.0.0',
      private: true,
      type: 'module',
      main: 'src/app.ts',
      scripts: { test: 'vitest run', typecheck: 'tsc --noEmit && tsc -p test' },
      dependencies: { '@agentapps/sdk': 'workspace:*' },
      devDependencies: {
        '@agentapps/station': 'workspace:*',
        '@agentapps/protocol': 'workspace:*',
        vitest: '^3.2.0',
      },
    };
  }
  return {
    name: packageName ?? id,
    version: '1.0.0',
    description,
    // Private until you choose a scoped or unique npm name (see the skill's ship-it guide).
    private: true,
    type: 'module',
    main: 'src/app.ts',
    files: ['src', 'assets', 'agentapp.json', 'README.md'],
    scripts: {
      test: 'vitest run',
      typecheck: 'tsc --noEmit && tsc -p test',
      check: 'create-agent-app check-app',
      health: 'create-agent-app health',
      dev: 'create-agent-app dev',
      lint: 'biome check .',
    },
    dependencies: { '@agentapps/sdk': publishedRange('@agentapps/sdk'), tsx: '^4.19.4' },
    devDependencies: {
      // The agentapps CLI for live tests: `npx @agentapps/cli ...`. Never the unscoped `agentapps`
      // package on npm, which is an unrelated project.
      '@agentapps/cli': publishedRange('@agentapps/cli'),
      '@agentapps/create': `^${ownVersion()}`,
      '@agentapps/protocol': publishedRange('@agentapps/protocol'),
      '@agentapps/station': publishedRange('@agentapps/station'),
      '@biomejs/biome': '^2.5.0',
      '@types/node': '^22.10.1',
      typescript: '^5.7.2',
      vitest: '^3.2.0',
    },
  };
}

function tsconfigJson(destDir: string, repoRoot: string | null): Record<string, unknown> {
  if (repoRoot) {
    const rel = (p: string) => toPosix(relative(destDir, join(repoRoot, p)));
    return {
      extends: rel('tsconfig.base.json'),
      compilerOptions: { rootDir: 'src', outDir: 'dist' },
      include: ['src'],
      references: [{ path: rel('packages/protocol') }, { path: rel('packages/sdk') }],
    };
  }
  return {
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      lib: ['ES2022'],
      types: ['node'],
      strict: true,
      skipLibCheck: true,
      isolatedModules: true,
      rootDir: 'src',
      outDir: 'dist',
    },
    include: ['src'],
  };
}
