/**
 * Tests for check-app (validate). Fixtures are real, loadable apps: check-app loads them
 * to list the tools the host would see. They live under packages/create/.gen/ (gitignored)
 * so `@agentapps/sdk` resolves from this workspace.
 *
 * The cases include every miss and false flag found by the independent review of the
 * regex-based checker (annotations only in comments, helper registration, shared constants,
 * annotations leaking from the next file, logo colours and TODO placement, drift).
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  configHintTargetsUserSecrets,
  findToolBlocks,
  monoLogoColours,
  protocolSupportsAccess,
  readmeSection,
  toolNameProblem,
  validate,
} from '../src/validate.js';

const GEN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '.gen');
mkdirSync(GEN_ROOT, { recursive: true });
const RUN_DIR = mkdtempSync(join(GEN_ROOT, 'validate-'));

afterAll(() => {
  rmSync(RUN_DIR, { recursive: true, force: true });
});

const MANIFEST = {
  id: 'app.test',
  name: 'Test',
  version: '1.0.0',
  description: 'A test app with one tool.',
  tagline: 'Test app',
  author: { name: 'Tester', email: 'tester@example.com' },
  logo: 'assets/logo.svg',
  logoMono: 'assets/logo-mono.svg',
  terms: 'https://agentapps.tech/terms',
  category: 'samples',
  entrypoint: { type: 'module', path: 'src/app.ts', export: 'factory' },
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
  capabilities: { tools: true, health: true },
};

const READ_ONLY =
  '{ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, sensitive: false }';
const WRITE =
  '{ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true, sensitive: true }';

/** A complete src/app.ts whose createApp() config equals `manifest`. */
function appTs(tools: string, extra = '', manifest: object = MANIFEST): string {
  return `import { createApp } from '@agentapps/sdk';
${extra}
export const app = createApp(${JSON.stringify(manifest)});
${tools}
app.health(async () => ({ status: 'ready' as const }));
export const factory = app.toFactory();
`;
}

function tool(name: string, annotations: string): string {
  return `app.tool('${name}', {
  description: 'A tool',
  parameters: { type: 'object', properties: {} },
  annotations: ${annotations},
  handler: async () => ({ ok: true }),
});`;
}

const README = '# Test\n\n## Terms of use\n\nFree tier.\n\n## Logos\n\nFrom the press kit.\n';
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1z"/></svg>';

let dir: string;
let counter = 0;

beforeEach(() => {
  dir = join(RUN_DIR, `app-${counter++}`);
});

function createProject(files: Record<string, string | object | null>) {
  const all: Record<string, string | object | null> = {
    'package.json': {
      name: 'test-app',
      type: 'module',
      dependencies: { '@agentapps/sdk': '^0.1.0' },
    },
    'agentapp.json': MANIFEST,
    'src/app.ts': appTs(tool('hello', READ_ONLY)),
    'assets/logo.svg':
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" fill="#123456"/></svg>',
    'assets/logo-mono.svg': SVG,
    'README.md': README,
    ...files,
  };
  for (const [filePath, content] of Object.entries(all)) {
    if (content === null) continue;
    const fullPath = join(dir, filePath);
    if (!existsSync(dirname(fullPath))) mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, typeof content === 'string' ? content : JSON.stringify(content));
  }
}

const check = (strict = false) => validate({ cwd: dir, strict });

describe('check-app: basics', () => {
  it('passes a complete project with no warnings', async () => {
    createProject({});
    const result = await check();
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('fails when package.json is missing', async () => {
    mkdirSync(dir, { recursive: true });
    const result = await check();
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing package.json');
  });

  it('fails when the @agentapps/sdk dependency is missing', async () => {
    createProject({ 'package.json': { name: 'x', type: 'module', dependencies: {} } });
    expect((await check()).errors).toContain('Missing @agentapps/sdk dependency');
  });

  it('fails when agentapp.json is unreadable', async () => {
    createProject({ 'agentapp.json': '{ not json' });
    expect((await check()).errors).toContain('Missing or unreadable agentapp.json');
  });

  it('reports manifest schema errors by field', async () => {
    const { tagline: _drop, ...noTagline } = MANIFEST;
    createProject({ 'agentapp.json': noTagline });
    expect((await check()).errors.some((e) => e.startsWith('agentapp.json: tagline'))).toBe(true);
  });
});

describe('check-app: tools, as the host sees them', () => {
  it('fails when a tool leaves annotations undeclared', async () => {
    createProject({ 'src/app.ts': appTs(tool('hello', '{ readOnlyHint: true }')) });
    const error = (await check()).errors.find((e) => e.includes("'hello'"));
    expect(error).toContain('destructiveHint, idempotentHint, openWorldHint, sensitive');
  });

  it('fails when an annotation appears only in a comment', async () => {
    const annotations = READ_ONLY.replace('idempotentHint: true, ', '');
    createProject({
      'src/app.ts': appTs(`// idempotentHint: true\n${tool('hello', annotations)}`),
    });
    expect((await check()).errors.some((e) => e.includes('idempotentHint'))).toBe(true);
  });

  it('fails when an annotation is a string, not a boolean', async () => {
    const annotations = READ_ONLY.replace('sensitive: false', "sensitive: 'false'");
    createProject({ 'src/app.ts': appTs(tool('hello', annotations)) });
    expect((await check()).errors.some((e) => e.includes('does not declare sensitive'))).toBe(true);
  });

  it('[DEVX-AC-4] fails when a read-only tool is sensitive', async () => {
    const annotations = READ_ONLY.replace('sensitive: false', 'sensitive: true');
    createProject({ 'src/app.ts': appTs(tool('hello', annotations)) });
    expect((await check()).errors).toContain(
      "Tool 'hello': sensitive must be false (a read-only tool changes nothing, so it never waits for approval)",
    );
  });

  it('[DEVX-AC-5] tool names are kebab-case and do not carry the app name', () => {
    expect(toolNameProblem('list_issues')).toMatch(/kebab-case/);
    expect(toolNameProblem('listIssues')).toMatch(/kebab-case/);
    expect(toolNameProblem('-health-check')).toMatch(/kebab-case/);
    expect(toolNameProblem('linear-list-issues', 'app.linear')).toMatch(/'linear-' prefix/);
    expect(toolNameProblem('analytics-run-report', 'app.google.analytics')).toMatch(
      /'analytics-' prefix/,
    );
    expect(toolNameProblem('google-analytics-run-report', 'app.google.analytics')).toMatch(
      /prefix/,
    );
    expect(toolNameProblem('list-issues', 'app.linear')).toBeUndefined();
    expect(toolNameProblem('git-status', 'app.github')).toBeUndefined();
  });

  it('[DEVX-AC-5] check-app reports a tool whose name breaks the rule', async () => {
    createProject({ 'src/app.ts': appTs(tool('list_things', READ_ONLY)) });
    const errors = (await check()).errors;
    expect(errors.some((e) => e.includes("'list_things'") && e.includes('kebab-case'))).toBe(true);
  });

  it('[DEVX-AC-4] accepts a write tool that is not sensitive: it changes only its own data', async () => {
    const annotations = WRITE.replace('sensitive: true', 'sensitive: false');
    createProject({ 'src/app.ts': appTs(tool('write', annotations)) });
    const errors = (await check()).errors;
    expect(errors.some((e) => e.includes("'write'"))).toBe(false);
  });

  it('fails when a read-only tool is marked destructive', async () => {
    const annotations = READ_ONLY.replace('destructiveHint: false', 'destructiveHint: true');
    createProject({ 'src/app.ts': appTs(tool('hello', annotations)) });
    expect((await check()).errors).toContain(
      "Tool 'hello': a read-only tool cannot be destructive",
    );
  });

  it('accepts annotations shared through a constant (valid code)', async () => {
    const tools = `${tool('a', 'READ_ONLY')}\n${tool('b', 'READ_ONLY')}`;
    createProject({ 'src/app.ts': appTs(tools, `const READ_ONLY = ${READ_ONLY};`) });
    expect((await check()).errors).toEqual([]);
  });

  it('checks tools registered through a helper in another file', async () => {
    const helper = `import type { AgentApp } from '@agentapps/sdk';
export function registerAll(app: AgentApp, annotations: Record<string, boolean>) {
  for (const name of ['list-tasks', 'get-task']) {
    app.tool(name, {
      description: 'A tool',
      parameters: { type: 'object', properties: {} },
      annotations,
      handler: async () => ({ ok: true }),
    });
  }
}
`;
    createProject({
      'src/tools/shared.ts': helper,
      'src/app.ts': appTs(
        'registerAll(app, { readOnlyHint: true });',
        "import { registerAll } from './tools/shared.js';",
      ),
    });
    const errors = (await check()).errors;
    expect(errors.some((e) => e.startsWith("Tool 'list-tasks' does not declare"))).toBe(true);
    expect(errors.some((e) => e.startsWith("Tool 'get-task' does not declare"))).toBe(true);
  });

  it('loads app after app in one process without slowing down', async () => {
    // Each load used to register tsx again; on Node 20 and 22 the sixth one hung the worker.
    createProject({
      'src/tools/hello.ts': `import type { AgentApp } from '@agentapps/sdk';
export const register = (app: AgentApp) => ${tool('hello', READ_ONLY).replace(/;$/, '')};
`,
      'src/app.ts': appTs('register(app);', "import { register } from './tools/hello.js';"),
    });
    const start = Date.now();
    for (let i = 0; i < 10; i++) expect((await check()).errors).toEqual([]);
    expect(Date.now() - start).toBeLessThan(10_000);
  }, 30_000);

  it('does not borrow annotations from the next file', async () => {
    const incomplete =
      '{ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }';
    const file = (
      name: string,
      annotations: string,
    ) => `import type { AgentApp } from '@agentapps/sdk';
export const register = (app: AgentApp) => ${tool(name, annotations).replace(/;$/, '')};
`;
    createProject({
      'src/tools/a.ts': file('a', incomplete),
      'src/tools/b.ts': file('b', READ_ONLY),
      'src/app.ts': appTs(
        'registerA(app);\nregisterB(app);',
        "import { register as registerA } from './tools/a.js';\nimport { register as registerB } from './tools/b.js';",
      ),
    });
    expect((await check()).errors).toContain(
      "Tool 'a' does not declare sensitive (all five, as booleans)",
    );
  });

  it('fails when a tool has an empty description or no object parameters', async () => {
    const source = appTs(tool('hello', READ_ONLY))
      .replace("description: 'A tool'", "description: ''")
      .replace("parameters: { type: 'object', properties: {} }", 'parameters: undefined as never');
    createProject({ 'src/app.ts': source });
    const errors = (await check()).errors;
    expect(errors).toContain("Tool 'hello' has no description");
    expect(errors).toContain('Tool \'hello\' has no parameters schema of type "object"');
  });

  it('fails when the app registers no tools', async () => {
    createProject({ 'src/app.ts': appTs('') });
    expect((await check()).errors).toContain('The app registers no tools');
  });

  it('fails, and reads the source instead, when the app cannot be loaded', async () => {
    createProject({ 'src/app.ts': `${appTs(tool('hello', READ_ONLY))}\nthis is not TypeScript (` });
    const errors = (await check()).errors;
    expect(errors.some((e) => e.startsWith('Could not load the app'))).toBe(true);
  });

  it('treats no tools in the source fallback as an error', async () => {
    createProject({
      'src/app.ts':
        "import { createApp } from '@agentapps/sdk';\nvoid createApp;\nthrow new Error('boom');\n",
    });
    expect((await check()).errors).toContain(
      'No tools found in src/ (and the app could not be loaded to list them)',
    );
  });

  it('fails when agentapp.json and createApp() drift apart', async () => {
    createProject({ 'agentapp.json': { ...MANIFEST, tagline: 'A different tagline' } });
    expect((await check()).errors.some((e) => e.startsWith('agentapp.json differs'))).toBe(true);
  });

  it('warns when no health check is registered', async () => {
    const source = appTs(tool('hello', READ_ONLY)).replace(
      "app.health(async () => ({ status: 'ready' as const }));",
      '',
    );
    createProject({ 'src/app.ts': source });
    expect((await check()).warnings.some((w) => w.includes('No health check'))).toBe(true);
  });

  it('asks for access: authenticated on apps with sensitive tools, when the protocol has it', async () => {
    createProject({ 'src/app.ts': appTs(tool('write', WRITE)) });
    const asked = (await check()).warnings.some((w) => w.includes('"access"'));
    expect(asked).toBe(protocolSupportsAccess());
  });

  it('warns when secret hints point at the app id instead of the alias', async () => {
    createProject({
      'src/lib/client.ts': 'export const hint = "run agentapps config app.test KEY:v";',
    });
    expect((await check()).warnings.some((w) => w.includes('installed alias'))).toBe(true);
  });
});

describe('check-app: logos and README', () => {
  it('allows missing logo files only while the Logos section records a TODO', async () => {
    createProject({ 'assets/logo.svg': null, 'assets/logo-mono.svg': null });
    expect((await check()).errors.filter((e) => e.includes('is missing'))).toHaveLength(2);

    dir = `${dir}-todo`;
    createProject({
      'assets/logo.svg': null,
      'assets/logo-mono.svg': null,
      'README.md':
        '# Test\n\n## Terms of use\n\nFree.\n\n## Logos\n\nTODO: no official logo found.\n',
    });
    const result = await check();
    expect(result.valid).toBe(true);
    expect(result.warnings.filter((w) => w.includes('still a TODO'))).toHaveLength(2);
  });

  it('does not count a TODO under a later heading as the logo TODO', async () => {
    createProject({
      'assets/logo.svg': null,
      'README.md': '# Test\n\n## Logos\n\nSee below.\n\n## Terms of use\n\nTODO: check terms.\n',
    });
    const errors = (await check()).errors;
    expect(errors.some((e) => e.startsWith('logo file assets/logo.svg is missing'))).toBe(true);
  });

  it('fails on an empty Logos section', async () => {
    createProject({ 'README.md': '# Test\n\n## Logos\n\n## Terms of use\n\nFree.\n' });
    expect((await check()).errors.some((e) => e.includes('"## Logos" section is empty'))).toBe(
      true,
    );
  });

  it.each([
    ['fill hex', '<svg><path fill="#000" d="M0 0"/></svg>'],
    ['fill named', '<svg><path fill="red" d="M0 0"/></svg>'],
    ['fill rgb', '<svg><path fill="rgb(1,2,3)" d="M0 0"/></svg>'],
    ['stroke hex', '<svg><path stroke="#abcdef" d="M0 0"/></svg>'],
    ['style attribute', '<svg><path style="fill: blue" d="M0 0"/></svg>'],
    ['style element', '<svg><style>.a{}</style><path d="M0 0"/></svg>'],
  ])('fails when the mono logo carries a colour (%s)', async (_label, svg) => {
    createProject({ 'assets/logo-mono.svg': svg });
    const errors = (await check()).errors;
    expect(errors.some((e) => e.startsWith('logoMono carries its own colours'))).toBe(true);
  });

  it('accepts neutral paint in the mono logo', () => {
    expect(
      monoLogoColours(
        '<svg><path fill="none" stroke="currentColor" fill-opacity="0.5" d="M0 0"/><g fill="inherit"/></svg>',
      ),
    ).toEqual([]);
  });

  it('warns about an XML declaration in an SVG logo', async () => {
    createProject({ 'assets/logo.svg': `<?xml version="1.0"?>\n${SVG}` });
    expect((await check()).warnings.some((w) => w.includes('<?xml'))).toBe(true);
  });

  it('fails when the README lacks its Logos or Terms of use section', async () => {
    createProject({ 'README.md': '# Test\n' });
    const errors = (await check()).errors;
    expect(errors.some((e) => e.includes('no "## Logos" section'))).toBe(true);
    expect(errors.some((e) => e.includes('no "## Terms of use" section'))).toBe(true);
  });

  it('with --strict, fails on unfinished work', async () => {
    const unfinished = { ...MANIFEST, tagline: 'TODO: tagline' };
    createProject({
      'agentapp.json': unfinished,
      'src/app.ts': appTs(tool('hello', READ_ONLY), '', unfinished),
    });
    expect((await check()).valid).toBe(true);
    const strict = await check(true);
    expect(strict.valid).toBe(false);
    expect(strict.errors.some((e) => e.includes('tagline still contains TODO (--strict)'))).toBe(
      true,
    );
  });

  it('with --strict, still accepts a documented logo TODO', async () => {
    createProject({
      'assets/logo.svg': null,
      'README.md':
        '# Test\n\n## Terms of use\n\nFree.\n\n## Logos\n\nTODO: searched the press page.\n',
    });
    expect((await check(true)).valid).toBe(true);
  });
});

describe('check-app: monorepo wiring', () => {
  /** A directory that looks like the agentapps monorepo, with the app at apps/test. */
  function inFakeRepo(options: { listed: boolean; importer: boolean }) {
    const root = join(RUN_DIR, `repo-${counter++}`);
    mkdirSync(join(root, 'packages', 'sdk'), { recursive: true });
    writeFileSync(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n");
    writeFileSync(join(root, 'packages', 'sdk', 'package.json'), '{"name":"@agentapps/sdk"}');
    const listed = options.listed ? './apps/test' : './apps/other';
    writeFileSync(
      join(root, 'agentapps.example.json'),
      JSON.stringify({ apps: [{ source: listed }] }),
    );
    const importer = options.importer ? 'apps/test' : 'apps/other';
    writeFileSync(
      join(root, 'pnpm-lock.yaml'),
      `lockfileVersion: '9.0'\nimporters:\n  ${importer}:\n    {}\n`,
    );
    dir = join(root, 'apps', 'test');
    createProject({});
  }

  it('passes when the app is listed and has a lockfile importer', async () => {
    inFakeRepo({ listed: true, importer: true });
    expect((await check()).errors).toEqual([]);
  });

  it('fails when agentapps.example.json does not list the app', async () => {
    inFakeRepo({ listed: false, importer: true });
    expect((await check()).errors).toContain(
      'Not listed in agentapps.example.json: add { "source": "./apps/test" }',
    );
  });

  it('fails when pnpm-lock.yaml has no importer for the app', async () => {
    inFakeRepo({ listed: true, importer: false });
    expect((await check()).errors.some((e) => e.includes('no "apps/test:" importer'))).toBe(true);
  });
});

describe('helpers', () => {
  it('splits sources into one block per tool (fallback)', () => {
    const blocks = findToolBlocks(`app.tool('a', { x: 1 }); app.tool("b", { y: 2 });`);
    expect(blocks.map((b) => b.name)).toEqual(['a', 'b']);
    expect(blocks[0].body).not.toContain('y: 2');
  });

  it('cuts a README section at the next ## heading', () => {
    const readme = '# T\n\n## Logos\n\nA\n\n### Detail\n\nB\n\n## Terms of use\n\nC\n';
    expect(readmeSection(readme, 'Logos')).toBe('\nA\n\n### Detail\n\nB\n\n');
    expect(readmeSection(readme, 'Terms')).toBe('\nC\n');
    expect(readmeSection(readme, 'Missing')).toBeNull();
  });

  it('flags config hints on the app id only when they set installation secrets', () => {
    const oauth = {
      user: ['ACCESS_TOKEN', 'REFRESH_TOKEN'],
      system: ['CLIENT_ID', 'CLIENT_SECRET'],
    };
    // System secrets belong on the app id, also when the message is split over two literals.
    const split =
      "'Set it with `agentapps config app.x.y ' +\n  'CLIENT_ID:<id> CLIENT_SECRET:<s>`.'";
    expect(configHintTargetsUserSecrets(split, oauth)).toBe(false);
    expect(configHintTargetsUserSecrets('agentapps config app.x ACCESS_TOKEN:v', oauth)).toBe(true);
    // Without system secrets, any hint on the app id is about installation secrets.
    expect(
      configHintTargetsUserSecrets('agentapps config app.x KEY:v', { user: [], system: [] }),
    ).toBe(true);
    expect(configHintTargetsUserSecrets('agentapps config my-alias KEY:v', oauth)).toBe(false);
  });
});
