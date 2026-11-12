/**
 * @agentapps/cli — tests for the new REPL-style CLI.
 *
 * Covers global flag parsing, REPL command parsing, tool argument parsing,
 * state management, renderers, and command handlers.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseGlobalArgs } from '../src/args.js';
import { dispatchCommand } from '../src/dispatch.js';
import { GLOBAL_HELP, renderHelp } from '../src/help.js';
import { GREEN, INDIGO, ORANGE, stripAnsi, YELLOW } from '../src/render/colors.js';
import { formatCompletionColumns } from '../src/render/completions.js';
import { HumanRenderer, JsonRenderer, YamlRenderer } from '../src/render/index.js';
import {
  getCompletionCandidates,
  getCompletions,
  parseReplLine,
  parseReplTokens,
} from '../src/repl-parser.js';
import { SessionPool } from '../src/session-pool.js';
import {
  addBinding,
  addInstallation,
  getBindingsForInstallation,
  getInstallation,
  getPermissionsForInstallation,
  getToolOverridesForInstallation,
  hasInstallationSecrets,
  loadBindings,
  loadInstallations,
  loadPermissions,
  removeAllBindingsForInstallation,
  removeAllPermissionsForInstallation,
  removeBinding,
  removeInstallation,
  removePermission,
  renameInstallation,
  resolveBinding,
  setPermission,
  setToolPermission,
  writeInstallationSecrets,
} from '../src/state.js';
import { parseToolArgs } from '../src/tool-args.js';
import { readCachedTools, writeCachedTools } from '../src/tools-cache.js';
import type { CliContext, GlobalOptions, WorkspaceConfig } from '../src/types.js';

function makeCtx(tmpDir: string, config: WorkspaceConfig): CliContext {
  const configPath = join(tmpDir, 'agentapps.json');
  writeFileSync(configPath, JSON.stringify(config), 'utf8');
  return { cwd: tmpDir, config, configPath };
}

function defaultOptions(): GlobalOptions {
  return {
    json: false,
    yaml: false,
    raw: false,
    manualCode: false,
    urlOnly: false,
    yes: false,
    verbose: false,
    help: false,
  };
}

// ---------------------------------------------------------------------------
// parseGlobalArgs
// ---------------------------------------------------------------------------

describe('parseGlobalArgs', () => {
  it('parses global flags and returns command tokens', () => {
    const { options, commandTokens } = parseGlobalArgs(['--cwd', '/tmp', '--json', 'apps']);
    expect(options.cwd).toBe('/tmp');
    expect(options.json).toBe(true);
    expect(commandTokens).toEqual(['apps']);
  });

  it('parses short flags', () => {
    const { options } = parseGlobalArgs(['-y', '-v']);
    expect(options.yes).toBe(true);
    expect(options.verbose).toBe(true);
  });

  it('throws on unknown flags', () => {
    expect(() => parseGlobalArgs(['--unknown-flag'])).toThrow('Unknown option: --unknown-flag');
  });

  it('keeps a bare dash as a command token', () => {
    const { commandTokens } = parseGlobalArgs(['hello', 'tool', 'greet', '-']);
    expect(commandTokens).toEqual(['hello', 'tool', 'greet', '-']);
  });
});

// ---------------------------------------------------------------------------
// parseToolArgs
// ---------------------------------------------------------------------------

describe('parseToolArgs', () => {
  it('returns empty object when no args', () => {
    expect(parseToolArgs([]).args).toEqual({});
  });

  it('parses named arguments', () => {
    expect(parseToolArgs(['name:World', 'count:3']).args).toEqual({ name: 'World', count: 3 });
  });

  it('parses quoted arguments with spaces', () => {
    expect(parseToolArgs(['msg:"hello world"']).args).toEqual({ msg: 'hello world' });
  });

  it('parses JSON values', () => {
    expect(parseToolArgs(['items:[1,2,3]']).args).toEqual({ items: [1, 2, 3] });
  });

  it('parses a single inline JSON object', () => {
    expect(parseToolArgs(['{"name":"World"}']).args).toEqual({ name: 'World' });
  });

  it('throws on mixed JSON and named args', () => {
    expect(() => parseToolArgs(['{"name":"World"}', 'count:3'])).toThrow(
      'cannot mix JSON and key:value arguments',
    );
  });
});

// ---------------------------------------------------------------------------
// parseReplLine
// ---------------------------------------------------------------------------

describe('parseReplLine', () => {
  let configPath: string;
  let config: WorkspaceConfig;

  beforeEach(() => {
    config = { apps: { hello: { source: './apps/hello' } } };
    configPath = join(tmpdir(), 'agentapps-repl-test.json');
    writeFileSync(configPath, JSON.stringify(config), 'utf8');
  });

  afterEach(() => {
    rmSync(configPath, { force: true });
  });

  it('parses apps', () => {
    const cmd = parseReplLine('apps', { configPath, config, aliases: [] });
    expect(cmd.type).toBe('apps');
  });

  it('parses install', () => {
    const cmd = parseReplLine('install app.hello hello', { configPath, config, aliases: [] });
    expect(cmd).toEqual({ type: 'install', appId: 'app.hello', alias: 'hello' });
  });

  it('parses alias tool command', () => {
    addInstallation(configPath, 'hello', 'app.hello');
    const cmd = parseReplLine('hello tool greet name:World', { configPath, config, aliases: [] });
    expect(cmd).toEqual({ type: 'tool', alias: 'hello', toolName: 'greet', args: ['name:World'] });
    removeInstallation(configPath, 'hello');
  });

  it('parses alias tool command without explicit tool keyword', () => {
    addInstallation(configPath, 'hello', 'app.hello');
    const cmd = parseReplLine('hello greet name:World count:3', {
      configPath,
      config,
      aliases: [],
    });
    expect(cmd).toEqual({
      type: 'tool',
      alias: 'hello',
      toolName: 'greet',
      args: ['name:World', 'count:3'],
    });
    removeInstallation(configPath, 'hello');
  });

  it('treats a bare alias as info', () => {
    addInstallation(configPath, 'hello', 'app.hello');
    expect(parseReplLine('hello', { configPath, config, aliases: [] })).toEqual({
      type: 'info',
      alias: 'hello',
    });
    removeInstallation(configPath, 'hello');
  });

  it('treats alias tool without a name as tools', () => {
    addInstallation(configPath, 'hello', 'app.hello');
    expect(parseReplLine('hello tool', { configPath, config, aliases: [] })).toEqual({
      type: 'tools',
      alias: 'hello',
    });
    removeInstallation(configPath, 'hello');
  });

  it('preserves reserved subcommands after alias', () => {
    addInstallation(configPath, 'hello', 'app.hello');
    expect(parseReplLine('hello tools', { configPath, config, aliases: [] })).toEqual({
      type: 'tools',
      alias: 'hello',
    });
    expect(parseReplLine('hello auth', { configPath, config, aliases: [] })).toEqual({
      type: 'auth',
      alias: 'hello',
    });
    expect(parseReplLine('hello subscribe event.a', { configPath, config, aliases: [] })).toEqual({
      type: 'subscribe',
      alias: 'hello',
      eventTypes: ['event.a'],
      unsubscribe: false,
    });
    removeInstallation(configPath, 'hello');
  });

  it('parses auth logout and reauth subcommands', () => {
    addInstallation(configPath, 'hello', 'app.hello');
    expect(parseReplLine('hello auth logout', { configPath, config, aliases: [] })).toEqual({
      type: 'auth',
      alias: 'hello',
      action: 'logout',
    });
    expect(parseReplLine('hello auth reauth', { configPath, config, aliases: [] })).toEqual({
      type: 'auth',
      alias: 'hello',
      action: 'reauth',
    });
    expect(parseReplLine('hello auth bogus', { configPath, config, aliases: [] })).toEqual({
      type: 'unknown',
      token: 'auth bogus',
    });
    removeInstallation(configPath, 'hello');
  });

  it('parses policy subcommands', () => {
    const opts = { configPath, config, aliases: [] };
    expect(parseReplLine('policy list', opts)).toEqual({ type: 'policy-list' });
    expect(parseReplLine('policy', opts)).toEqual({ type: 'policy-list' });
    expect(parseReplLine('policy show ak_1', opts)).toEqual({
      type: 'policy-show',
      principalId: 'ak_1',
    });
    expect(parseReplLine('policy set ak_1 app.hello greet deny', opts)).toEqual({
      type: 'policy-set',
      principalId: 'ak_1',
      app: 'app.hello',
      tool: 'greet',
      effect: 'deny',
    });
    expect(
      parseReplLine(
        `policy set ak_1 gmail send_email allow '{"to":{"endsWith":"@hexagon.sh"}}'`,
        opts,
      ),
    ).toEqual({
      type: 'policy-set',
      principalId: 'ak_1',
      app: 'gmail',
      tool: 'send_email',
      effect: 'allow',
      when: '{"to":{"endsWith":"@hexagon.sh"}}',
    });
    expect(parseReplLine('policy set ak_1 app.hello greet bogus', opts).type).toBe('unknown');
    expect(parseReplLine('policy set ak_1 app.hello ask', opts).type).toBe('unknown');
    expect(parseReplLine('policy unset ak_1 app.hello/greet', opts)).toEqual({
      type: 'policy-unset',
      principalId: 'ak_1',
      ruleId: 'app.hello/greet',
    });
    expect(parseReplLine('policy delete ak_1', opts)).toEqual({
      type: 'policy-delete',
      principalId: 'ak_1',
    });
  });

  it('parses approval commands', () => {
    const opts = { configPath, config, aliases: [] };
    expect(parseReplLine('approvals', opts)).toEqual({ type: 'approvals' });
    expect(parseReplLine('approve a1', opts)).toEqual({
      type: 'approval-decide',
      id: 'a1',
      decision: 'approve',
    });
    expect(parseReplLine('deny a1', opts)).toEqual({
      type: 'approval-decide',
      id: 'a1',
      decision: 'deny',
    });
  });

  it('parses key subcommands', () => {
    const opts = { configPath, config, aliases: [] };
    expect(parseReplLine('key list', opts)).toEqual({ type: 'key-list' });
    expect(parseReplLine('key', opts)).toEqual({ type: 'key-list' });
    expect(parseReplLine('key create my-key pablo', opts)).toEqual({
      type: 'key-create',
      name: 'my-key',
      userId: 'pablo',
      workspaceId: undefined,
    });
    expect(parseReplLine('key create my-key pablo ws-1', opts)).toEqual({
      type: 'key-create',
      name: 'my-key',
      userId: 'pablo',
      workspaceId: 'ws-1',
    });
    expect(parseReplLine('key create my-key', opts).type).toBe('unknown');
    expect(parseReplLine('key revoke ak_1', opts)).toEqual({
      type: 'key-revoke',
      keyId: 'ak_1',
    });
  });

  it('parses warm command', () => {
    const cmd = parseReplLine('warm', { configPath, config, aliases: [] });
    expect(cmd.type).toBe('warm');
  });

  it('returns unknown for unrecognized token', () => {
    const cmd = parseReplLine('foo', { configPath, config, aliases: [] });
    expect(cmd.type).toBe('unknown');
  });

  it('parses bind command', () => {
    const cmd = parseReplLine('bind my-crm messenger my-whatsapp', {
      configPath,
      config,
      aliases: [],
    });
    expect(cmd).toEqual({
      type: 'bind',
      alias: 'my-crm',
      bindingName: 'messenger',
      targetAlias: 'my-whatsapp',
    });
  });

  it('parses unbind command', () => {
    const cmd = parseReplLine('unbind my-crm messenger', { configPath, config, aliases: [] });
    expect(cmd).toEqual({ type: 'unbind', alias: 'my-crm', bindingName: 'messenger' });
  });

  it('parses list-bindings command', () => {
    const cmd = parseReplLine('list-bindings my-crm', { configPath, config, aliases: [] });
    expect(cmd).toEqual({ type: 'list-bindings', alias: 'my-crm' });
  });

  it('returns usage for incomplete bind', () => {
    expect(parseReplLine('bind', { configPath, config, aliases: [] }).type).toBe('usage');
    expect(parseReplLine('bind my-crm', { configPath, config, aliases: [] }).type).toBe('usage');
    expect(parseReplLine('bind my-crm messenger', { configPath, config, aliases: [] }).type).toBe(
      'usage',
    );
  });

  it('returns usage for incomplete unbind', () => {
    expect(parseReplLine('unbind', { configPath, config, aliases: [] }).type).toBe('usage');
    expect(parseReplLine('unbind my-crm', { configPath, config, aliases: [] }).type).toBe('usage');
  });

  it('returns usage for incomplete list-bindings', () => {
    expect(parseReplLine('list-bindings', { configPath, config, aliases: [] }).type).toBe('usage');
  });
});

// ---------------------------------------------------------------------------
// parseReplTokens (one-shot mode: shell-tokenized argv)
// ---------------------------------------------------------------------------

describe('parseReplTokens', () => {
  let configPath: string;
  let config: WorkspaceConfig;

  beforeEach(() => {
    config = { apps: { hello: { source: './apps/hello' } } };
    configPath = join(tmpdir(), `agentapps-tokens-test-${Date.now()}.json`);
    writeFileSync(configPath, JSON.stringify(config), 'utf8');
  });

  afterEach(() => {
    rmSync(configPath, { force: true });
  });

  it('preserves pre-tokenized args with spaces (one-shot mode)', () => {
    addInstallation(configPath, 'perplexity', 'app.perplexity');
    const cmd = parseReplTokens(['perplexity', 'tool', 'search', 'query:osos polares'], {
      configPath,
      config,
      aliases: [],
    });
    expect(cmd).toEqual({
      type: 'tool',
      alias: 'perplexity',
      toolName: 'search',
      args: ['query:osos polares'],
    });
    removeInstallation(configPath, 'perplexity');
  });

  it('preserves inline JSON with spaces (one-shot mode)', () => {
    addInstallation(configPath, 'perplexity', 'app.perplexity');
    const cmd = parseReplTokens(['perplexity', 'tool', 'search', '{"query":"osos polares"}'], {
      configPath,
      config,
      aliases: [],
    });
    expect(cmd).toEqual({
      type: 'tool',
      alias: 'perplexity',
      toolName: 'search',
      args: ['{"query":"osos polares"}'],
    });
    removeInstallation(configPath, 'perplexity');
  });

  it('handles top-level commands identically to parseReplLine', () => {
    const cmd = parseReplTokens(['apps'], { configPath, config, aliases: [] });
    expect(cmd.type).toBe('apps');
  });

  it('handles shorthand tool invocation with spaced args', () => {
    addInstallation(configPath, 'hello', 'app.hello');
    const cmd = parseReplTokens(['hello', 'greet', 'name:hello world'], {
      configPath,
      config,
      aliases: [],
    });
    expect(cmd).toEqual({
      type: 'tool',
      alias: 'hello',
      toolName: 'greet',
      args: ['name:hello world'],
    });
    removeInstallation(configPath, 'hello');
  });

  it('config command includes third token in args', () => {
    const cmd = parseReplTokens(['config', 'app.replicate', 'API_TOKEN:my-token'], {
      configPath,
      config,
      aliases: [],
    });
    expect(cmd).toEqual({
      type: 'config',
      appId: 'app.replicate',
      args: ['API_TOKEN:my-token'],
    });
  });

  it('config command includes multiple key:value args', () => {
    const cmd = parseReplTokens(['config', 'app.example', 'KEY1:val1', 'KEY2:val2'], {
      configPath,
      config,
      aliases: [],
    });
    expect(cmd).toEqual({
      type: 'config',
      appId: 'app.example',
      args: ['KEY1:val1', 'KEY2:val2'],
    });
  });
});

// ---------------------------------------------------------------------------
// completions
// ---------------------------------------------------------------------------

describe('getCompletions', () => {
  let tmpDir: string;
  let ctx: CliContext;
  const config: WorkspaceConfig = { apps: { 'app.github': { source: './apps/github' } } };

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agentapps-cli-completions-'));
    ctx = makeCtx(tmpDir, config);
    addInstallation(ctx.configPath, 'gh', 'app.github');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const opts = () => ({ configPath: ctx.configPath, config, aliases: [] });

  it('suggests only subcommands after an alias when no tools are cached', () => {
    const completions = getCompletions('gh ', opts());
    expect(completions).toContain('tools');
    expect(completions).toContain('auth');
  });

  it('suggests cached tool names alongside subcommands after an alias', () => {
    writeCachedTools(ctx.configPath, 'app.github', [
      { name: 'create_issue' },
      { name: 'list_repos' },
    ]);
    const completions = getCompletions('gh ', opts());
    expect(completions).toContain('create_issue');
    expect(completions).toContain('list_repos');
    expect(completions).toContain('tools');
  });

  it('filters tool names by prefix', () => {
    writeCachedTools(ctx.configPath, 'app.github', [
      { name: 'create_issue' },
      { name: 'list_repos' },
    ]);
    expect(getCompletions('gh cre', opts())).toEqual(['create_issue']);
  });

  it('suggests cached tool names after the tool subcommand', () => {
    writeCachedTools(ctx.configPath, 'app.github', [
      { name: 'create_issue' },
      { name: 'list_repos' },
    ]);
    expect(getCompletions('gh tool ', opts())).toEqual(['create_issue', 'list_repos']);
    expect(getCompletions('gh tool li', opts())).toEqual(['list_repos']);
  });

  it('does not leak tool names from other apps', () => {
    writeCachedTools(ctx.configPath, 'app.other', [{ name: 'other_tool' }]);
    expect(getCompletions('gh tool ', opts())).toEqual([]);
  });

  it('survives a corrupt cache file', () => {
    writeFileSync(join(tmpDir, '.agentapps', 'tools-cache.json'), '{not json');
    expect(getCompletions('gh tool ', opts())).toEqual([]);
  });

  it('tags candidates with their kind', () => {
    writeCachedTools(ctx.configPath, 'app.github', [{ name: 'create_issue' }]);
    const candidates = getCompletionCandidates('gh ', opts());
    expect(candidates).toContainEqual({ value: 'tools', kind: 'command' });
    expect(candidates).toContainEqual({ value: 'create_issue', kind: 'tool' });

    const topLevel = getCompletionCandidates('', opts());
    expect(topLevel).toContainEqual({ value: 'install', kind: 'command' });
    expect(topLevel).toContainEqual({ value: 'gh', kind: 'alias' });

    // App ids join the pool once a first-token prefix is being typed.
    expect(getCompletionCandidates('app', opts())).toContainEqual({
      value: 'app.github',
      kind: 'app',
    });
  });

  describe('parameter completion', () => {
    beforeEach(() => {
      writeCachedTools(ctx.configPath, 'app.github', [
        {
          name: 'create_issue',
          parameters: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              body: { type: 'string' },
              labels: { type: 'array' },
            },
            required: ['title'],
          },
        },
        { name: 'list_repos' },
      ]);
    });

    it('extracts parameter info from the JSON schema', () => {
      const tools = readCachedTools(ctx.configPath, 'app.github');
      expect(tools[0].params).toEqual([
        { name: 'title', type: 'string', required: true },
        { name: 'body', type: 'string', required: false },
        { name: 'labels', type: 'array', required: false },
      ]);
    });

    it('suggests param keys after a tool name, required first', () => {
      expect(getCompletions('gh tool create_issue ', opts())).toEqual([
        'title:',
        'body:',
        'labels:',
      ]);
      expect(getCompletionCandidates('gh tool create_issue ', opts())[0]).toEqual({
        value: 'title:',
        kind: 'param',
      });
    });

    it('suggests param keys for the bare tool shortcut', () => {
      expect(getCompletions('gh create_issue ', opts())).toEqual(['title:', 'body:', 'labels:']);
    });

    it('filters param keys by prefix', () => {
      expect(getCompletions('gh create_issue la', opts())).toEqual(['labels:']);
    });

    it('skips params that are already typed', () => {
      expect(getCompletions('gh create_issue title:"Fix bug" ', opts())).toEqual([
        'body:',
        'labels:',
      ]);
    });

    it('suggests nothing for a tool without params or unknown tool', () => {
      expect(getCompletions('gh tool list_repos ', opts())).toEqual([]);
      expect(getCompletions('gh tool nope ', opts())).toEqual([]);
    });

    it('reads legacy caches that stored bare tool names', () => {
      writeFileSync(
        join(tmpDir, '.agentapps', 'tools-cache.json'),
        JSON.stringify({ 'app.github': { tools: ['create_issue'], cachedAt: '' } }),
      );
      expect(getCompletions('gh tool cre', opts())).toEqual(['create_issue']);
      expect(getCompletions('gh tool create_issue ', opts())).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// completion columns rendering
// ---------------------------------------------------------------------------

describe('formatCompletionColumns', () => {
  const candidates = [
    { value: 'tools', kind: 'command' as const },
    { value: 'greet', kind: 'tool' as const },
  ];

  it('renders plain padded columns with colors disabled', () => {
    const out = formatCompletionColumns(candidates, { width: 80, colors: { enabled: false } });
    expect(out).toBe('tools  greet');
  });

  it('colorizes candidates by kind', () => {
    const out = formatCompletionColumns(candidates, { width: 80, colors: { enabled: true } });
    expect(out).toContain(INDIGO);
    expect(out).toContain(GREEN);
    expect(stripAnsi(out)).toBe('tools  greet');
  });

  it('wraps into rows when the terminal is narrow', () => {
    const out = formatCompletionColumns(candidates, { width: 10, colors: { enabled: false } });
    expect(out).toBe('tools\ngreet');
  });

  it('returns an empty string for no candidates', () => {
    expect(formatCompletionColumns([], { width: 80, colors: { enabled: false } })).toBe('');
  });
});

// ---------------------------------------------------------------------------
// state management
// ---------------------------------------------------------------------------

describe('state management', () => {
  let tmpDir: string;
  let ctx: CliContext;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agentapps-cli-state-'));
    ctx = makeCtx(tmpDir, { apps: {} });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('adds and loads instances', () => {
    addInstallation(ctx.configPath, 'gmail', 'app.google.gmail');
    const instances = loadInstallations(ctx.configPath);
    expect(instances).toHaveLength(1);
    expect(instances[0].alias).toBe('gmail');
    expect(instances[0].appId).toBe('app.google.gmail');
  });

  it('throws when adding a duplicate alias', () => {
    addInstallation(ctx.configPath, 'gmail', 'app.google.gmail');
    expect(() => addInstallation(ctx.configPath, 'gmail', 'app.google.calendar')).toThrow(
      'Alias "gmail" is already used',
    );
  });

  it('removes an instance and its secrets', () => {
    const inst = addInstallation(ctx.configPath, 'gmail', 'app.google.gmail');
    writeInstallationSecrets(ctx.configPath, inst.installationId, { TOKEN: 'abc' });
    removeInstallation(ctx.configPath, 'gmail');
    expect(getInstallation(ctx.configPath, 'gmail')).toBeUndefined();
    expect(hasInstallationSecrets(ctx.configPath, inst.installationId)).toBe(false);
  });

  it('renames an instance and its secrets', () => {
    const inst = addInstallation(ctx.configPath, 'gmail', 'app.google.gmail');
    writeInstallationSecrets(ctx.configPath, inst.installationId, { TOKEN: 'abc' });
    renameInstallation(ctx.configPath, 'gmail', 'work-gmail');
    expect(getInstallation(ctx.configPath, 'gmail')).toBeUndefined();
    expect(getInstallation(ctx.configPath, 'work-gmail')?.appId).toBe('app.google.gmail');
    // Secrets stay keyed by installationId, so the rename preserves them.
    expect(hasInstallationSecrets(ctx.configPath, inst.installationId)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// binding state management
// ---------------------------------------------------------------------------

describe('binding state management', () => {
  let tmpDir: string;
  let ctx: CliContext;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agentapps-cli-bind-'));
    ctx = makeCtx(tmpDir, { apps: {} });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('adds and loads bindings', () => {
    addBinding(ctx.configPath, 'my-crm', 'messenger', 'my-whatsapp');
    const bindings = loadBindings(ctx.configPath);
    expect(bindings).toHaveLength(1);
    expect(bindings[0].installationId).toBe('my-crm');
    expect(bindings[0].bindingName).toBe('messenger');
    expect(bindings[0].targetInstallationId).toBe('my-whatsapp');
  });

  it('resolves a specific binding', () => {
    addBinding(ctx.configPath, 'my-crm', 'messenger', 'my-whatsapp');
    const binding = resolveBinding(ctx.configPath, 'my-crm', 'messenger');
    expect(binding?.targetInstallationId).toBe('my-whatsapp');
  });

  it('returns undefined for unknown binding', () => {
    expect(resolveBinding(ctx.configPath, 'my-crm', 'missing')).toBeUndefined();
  });

  it('gets bindings for a specific alias', () => {
    addBinding(ctx.configPath, 'my-crm', 'messenger', 'my-whatsapp');
    addBinding(ctx.configPath, 'my-crm', 'email', 'my-gmail');
    addBinding(ctx.configPath, 'other-app', 'storage', 'my-drive');
    const bindings = getBindingsForInstallation(ctx.configPath, 'my-crm');
    expect(bindings).toHaveLength(2);
    expect(bindings.map((b) => b.bindingName).sort()).toEqual(['email', 'messenger']);
  });

  it('overwrites existing binding', () => {
    addBinding(ctx.configPath, 'my-crm', 'messenger', 'my-whatsapp');
    addBinding(ctx.configPath, 'my-crm', 'messenger', 'my-slack');
    const binding = resolveBinding(ctx.configPath, 'my-crm', 'messenger');
    expect(binding?.targetInstallationId).toBe('my-slack');
    expect(loadBindings(ctx.configPath)).toHaveLength(1);
  });

  it('removes a binding', () => {
    addBinding(ctx.configPath, 'my-crm', 'messenger', 'my-whatsapp');
    const removed = removeBinding(ctx.configPath, 'my-crm', 'messenger');
    expect(removed).toBe(true);
    expect(resolveBinding(ctx.configPath, 'my-crm', 'messenger')).toBeUndefined();
  });

  it('returns false when removing nonexistent binding', () => {
    expect(removeBinding(ctx.configPath, 'my-crm', 'missing')).toBe(false);
  });

  it('removes all bindings for an alias', () => {
    addBinding(ctx.configPath, 'my-crm', 'messenger', 'my-whatsapp');
    addBinding(ctx.configPath, 'my-crm', 'email', 'my-gmail');
    addBinding(ctx.configPath, 'other', 'storage', 'my-drive');
    removeAllBindingsForInstallation(ctx.configPath, 'my-crm');
    expect(getBindingsForInstallation(ctx.configPath, 'my-crm')).toHaveLength(0);
    expect(loadBindings(ctx.configPath)).toHaveLength(1); // 'other' remains
  });
});

// ---------------------------------------------------------------------------
// renderers
// ---------------------------------------------------------------------------

describe('renderers', () => {
  it('human renderer formats success', () => {
    const renderer = new HumanRenderer({ colors: { enabled: false } });
    const out = renderer.render({ success: true, message: 'Installed hello' });
    expect(out).toContain('✓ Installed hello');
  });

  it('human renderer formats errors', () => {
    const renderer = new HumanRenderer({ colors: { enabled: false } });
    const out = renderer.render({
      success: false,
      error: { message: 'Alias taken', suggestion: 'Use a different alias' },
    });
    expect(out).toContain('✗ Alias taken');
    expect(out).toContain('Use a different alias');
  });

  it('human renderer lists an array of objects as readable blocks', () => {
    const renderer = new HumanRenderer({ colors: { enabled: false } });
    const out = renderer.render({
      success: true,
      data: {
        events: [
          { summary: 'Oficina', start: '2026-06-25' },
          { summary: 'Daily', start: '2026-06-26' },
        ],
      },
    });
    expect(out).toContain('[1] summary: Oficina');
    expect(out).toContain('start:');
    expect(out).toContain('[2] summary: Daily');
    // Entities are separated by a blank line.
    expect(out).toContain('\n\n');
    // Should not collapse into a single JSON blob.
    expect(out).not.toContain('[{');
    expect(out).not.toContain('},{');
  });

  it('human renderer wraps long values to terminal width with aligned continuation', () => {
    const width = 40;
    const renderer = new HumanRenderer({ colors: { enabled: false }, width });
    const out = renderer.render({
      success: true,
      data: {
        events: [
          {
            summary: 'Daily',
            attendees: 'aaa@x.com, bbb@y.com, ccc@z.com, ddd@w.com, eee@v.com',
          },
        ],
      },
    });
    const lines = out.split('\n');
    // No line exceeds the terminal width.
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(width);
    // The attendees value wraps across multiple lines, each indented (never at
    // column 0) so continuation aligns under the value column.
    const attendeeLines = lines.filter((l) => l.includes('@'));
    expect(attendeeLines.length).toBeGreaterThan(1);
    for (const l of attendeeLines) expect(l.startsWith('  ')).toBe(true);
  });

  it('human renderer does not wrap when no width is configured', () => {
    const renderer = new HumanRenderer({ colors: { enabled: false } });
    const long = 'aaa@x.com, bbb@y.com, ccc@z.com, ddd@w.com, eee@v.com, fff@u.com';
    const out = renderer.render({ success: true, data: { events: [{ attendees: long }] } });
    expect(out).toContain(long);
  });

  it('human renderer wraps wide table columns to terminal width', () => {
    const width = 60;
    const renderer = new HumanRenderer({ colors: { enabled: false }, width });
    const description =
      'Discover models available on Replicate and their exact input parameters, ' +
      'with three different modes covering collections, queries and schemas.';
    const out = renderer.render({
      success: true,
      data: [
        { Tool: 'list_models', Description: description },
        { Tool: 'run', Description: 'Run any model.' },
      ],
    });
    const lines = out.split('\n');
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(width);
    // The long description wraps into continuation lines under its column:
    // more lines than header + divider + one per row.
    expect(lines.length).toBeGreaterThan(4);
    expect(out).toContain('list_models');
    expect(out).toContain('Run any model.');
  });

  it('human renderer formats entries layout as multiline blocks', () => {
    const width = 60;
    const renderer = new HumanRenderer({ colors: { enabled: false }, width });
    const out = renderer.render({
      success: true,
      layout: 'entries',
      data: [
        {
          Tool: 'list_models',
          Parameters: 'mode:<string> query:<string>? collection:<string>?',
          Description:
            'Discover models available on Replicate and their exact input parameters across three modes.',
        },
        { Tool: 'run', Parameters: 'model:<string>', Description: 'Run any model.' },
      ],
    });
    const lines = out.split('\n');
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(width);
    // Title and first annotation share a line; the body wraps below at the
    // full remaining width instead of a narrow column.
    expect(lines[0]).toContain('list_models  mode:<string>');
    expect(out).toContain('\n      Discover models available on Replicate and their');
    // Blocks are separated by a blank line.
    expect(out).toContain('\n\n  run  model:<string>');
  });

  it('human renderer applies entity colors to known columns', () => {
    const renderer = new HumanRenderer({ colors: { enabled: true }, width: 90 });
    const out = renderer.render({
      success: true,
      data: [{ Alias: 'gh', 'App ID': 'app.github', Status: 'ok' }],
    });
    expect(out).toContain(`${YELLOW}gh`); // instances → yellow
    expect(out).toContain(`${ORANGE}app.github`); // apps → orange
  });

  it('renderHelp colorizes entities and stays plain without colors', () => {
    expect(renderHelp({ enabled: false })).toBe(GLOBAL_HELP.trim());
    const colored = renderHelp({ enabled: true });
    expect(colored).toContain(`${YELLOW}<alias>`);
    expect(colored).toContain(`${ORANGE}<app-id>`);
    expect(colored).toContain(`${GREEN}<name>`);
    expect(colored).toContain(`${INDIGO}install`);
    expect(stripAnsi(colored)).toBe(GLOBAL_HELP.trim());
  });

  it('json renderer drops the layout presentation hint', () => {
    const renderer = new JsonRenderer();
    const out = JSON.parse(
      renderer.render({ success: true, layout: 'entries', data: [{ Tool: 'x' }] }),
    );
    expect(out.layout).toBeUndefined();
    expect(out.data).toEqual([{ Tool: 'x' }]);
  });

  it('human renderer leaves tables untouched when they fit', () => {
    const renderer = new HumanRenderer({ colors: { enabled: false }, width: 80 });
    const out = renderer.render({
      success: true,
      data: [{ Tool: 'greet', Description: 'Say hello.' }],
    });
    expect(out).toContain('greet');
    expect(out.split('\n')).toHaveLength(3); // header, divider, one row
  });

  it('json renderer emits JSON', () => {
    const renderer = new JsonRenderer();
    const out = JSON.parse(renderer.render({ success: true, message: 'ok' }));
    expect(out.success).toBe(true);
  });

  it('yaml renderer emits YAML', () => {
    const renderer = new YamlRenderer();
    const out = renderer.render({ success: true, message: 'ok' });
    expect(out).toContain('success: true');
    expect(out).toContain('message: ok');
  });
});

// ---------------------------------------------------------------------------
// command handlers
// ---------------------------------------------------------------------------

describe('command handlers', () => {
  let tmpDir: string;
  let ctx: CliContext;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agentapps-cli-cmd-'));
    const configPath = join(tmpDir, 'agentapps.json');
    const config: WorkspaceConfig = {
      apps: {
        hello: { source: resolve(__dirname, '../../../apps/hello') },
      },
    };
    writeFileSync(configPath, JSON.stringify(config), 'utf8');
    ctx = { cwd: tmpDir, config, configPath };
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('apps returns apps', async () => {
    const result = await dispatchCommand({ type: 'apps' }, { ctx, options: defaultOptions() });
    expect(result.exitCode).toBe(0);
    expect(result.success).toBe(true);
  });

  it('[CLI-AC-1] apps <query> keeps the apps whose name, tagline, description or keywords match', async () => {
    ctx.config = {
      apps: {
        'app.google.gmail': { source: resolve(__dirname, '../../../apps/google-gmail') },
        'app.github': { source: resolve(__dirname, '../../../apps/github') },
      },
    };
    const ids = async (query: string) => {
      const result = await dispatchCommand(
        { type: 'apps', query },
        { ctx, options: defaultOptions() },
      );
      expect(result.exitCode).toBe(0);
      return (result.data as Array<{ 'App ID': string }>).map((row) => row['App ID']);
    };
    expect(await ids('mail')).toEqual(['app.google.gmail']);
    expect(await ids('MAIL')).toEqual(['app.google.gmail']);
    expect(
      parseReplLine('apps mail', { configPath: ctx.configPath, config: ctx.config, aliases: [] }),
    ).toEqual({
      type: 'apps',
      query: 'mail',
    });
  });

  it('[CLI-AC-2] a successful tool call prints only its result unless --verbose', async () => {
    addInstallation(ctx.configPath, 'hello', 'hello');
    const call = (toolName: string, verbose: boolean) =>
      dispatchCommand(
        { type: 'tool', alias: 'hello', toolName, args: ['name:Pablo'] },
        { ctx, options: { ...defaultOptions(), verbose } },
      );

    const quiet = await call('greet', false);
    expect(quiet.success).toBe(true);
    expect(quiet.data).toEqual({ message: 'Hello, Pablo!' });
    expect(quiet.message).toBeUndefined();

    const verbose = await call('greet', true);
    expect(verbose.message).toBe('greet succeeded');

    const failed = await call('nope', false);
    expect(failed.success).toBe(false);
    expect(failed.error?.message).toContain('nope');
  });

  it('install records an instance', async () => {
    const result = await dispatchCommand(
      { type: 'install', appId: 'hello', alias: 'hello' },
      { ctx, options: defaultOptions() },
    );
    expect(result.exitCode).toBe(0);
    expect(getInstallation(ctx.configPath, 'hello')).toBeDefined();
  });

  it('instances shows installed apps', async () => {
    addInstallation(ctx.configPath, 'hello', 'hello');
    const result = await dispatchCommand(
      { type: 'installations' },
      { ctx, options: defaultOptions() },
    );
    expect(result.exitCode).toBe(0);
  });

  it('tools lists tools for an instance', async () => {
    addInstallation(ctx.configPath, 'hello', 'hello');
    const result = await dispatchCommand(
      { type: 'tools', alias: 'hello' },
      { ctx, options: defaultOptions() },
    );
    expect(result.exitCode).toBe(0);
    expect(result.success).toBe(true);
  });

  it('tool invokes a tool', async () => {
    addInstallation(ctx.configPath, 'hello', 'hello');
    const result = await dispatchCommand(
      { type: 'tool', alias: 'hello', toolName: 'greet', args: ['name:World'] },
      { ctx, options: defaultOptions() },
    );
    expect(result.exitCode).toBe(0);
    expect(result.success).toBe(true);
  });

  it('session pool reuses one session per alias and reopens after release', async () => {
    addInstallation(ctx.configPath, 'hello', 'hello');
    const pool = new SessionPool();
    try {
      const first = await pool.acquire('hello', 'hello', ctx);
      const again = await pool.acquire('hello', 'hello', ctx);
      expect(again).toBe(first);

      await pool.release('hello');
      const reopened = await pool.acquire('hello', 'hello', ctx);
      expect(reopened).not.toBe(first);
    } finally {
      await pool.closeAll();
    }
  });

  it('tool command reuses a pooled session across invocations', async () => {
    addInstallation(ctx.configPath, 'hello', 'hello');
    const sessions = new SessionPool();
    try {
      const first = await dispatchCommand(
        { type: 'tool', alias: 'hello', toolName: 'greet', args: ['name:World'] },
        { ctx, options: defaultOptions(), sessions },
      );
      const second = await dispatchCommand(
        { type: 'tool', alias: 'hello', toolName: 'greet', args: ['name:Again'] },
        { ctx, options: defaultOptions(), sessions },
      );
      expect(first.success).toBe(true);
      expect(second.success).toBe(true);
    } finally {
      await sessions.closeAll();
    }
  });

  it('install hints about missing system secrets', async () => {
    const appSource = join(tmpDir, 'secret-app');
    mkdirSync(join(appSource, 'dist'), { recursive: true });
    writeFileSync(
      join(appSource, 'agentapp.json'),
      JSON.stringify({
        id: 'secret-app',
        version: '1.0.0',
        auth: { type: 'api-key', systemSecrets: ['APIKEY', 'SECRET'] },
      }),
    );
    writeFileSync(join(appSource, 'dist', 'app.js'), 'export function factory() {}');

    const configWithSecretApp: WorkspaceConfig = {
      apps: { 'secret-app': { source: appSource } },
    };
    const secretCtx = makeCtx(tmpDir, configWithSecretApp);

    const result = await dispatchCommand(
      { type: 'install', appId: 'secret-app', alias: 'mysecret' },
      { ctx: secretCtx, options: defaultOptions() },
    );
    expect(result.exitCode).toBe(0);
    expect(result.success).toBe(true);
    expect(result.data?.hint).toContain('Missing system secrets');
    expect(result.data?.hint).toContain('APIKEY');
    expect(result.data?.hint).toContain('SECRET');
    expect(result.data?.hint).toContain('agentapps config secret-app');
  });

  it('uninstall removes an instance', async () => {
    addInstallation(ctx.configPath, 'hello', 'hello');
    const result = await dispatchCommand(
      { type: 'uninstall', alias: 'hello' },
      { ctx, options: { ...defaultOptions(), yes: true } },
    );
    expect(result.exitCode).toBe(0);
    expect(getInstallation(ctx.configPath, 'hello')).toBeUndefined();
  });

  it('uninstall removes bindings for the instance', async () => {
    const crm = addInstallation(ctx.configPath, 'crm', 'app.crm');
    const messenger = addInstallation(ctx.configPath, 'messenger', 'app.messenger');
    addBinding(ctx.configPath, crm.installationId, 'messenger', messenger.installationId);
    await dispatchCommand(
      { type: 'uninstall', alias: 'crm' },
      { ctx, options: { ...defaultOptions(), yes: true } },
    );
    expect(getBindingsForInstallation(ctx.configPath, crm.installationId)).toHaveLength(0);
  });

  it('bind creates a binding between instances', async () => {
    const crm = addInstallation(ctx.configPath, 'crm', 'app.crm');
    const messenger = addInstallation(ctx.configPath, 'messenger', 'app.messenger');
    const result = await dispatchCommand(
      { type: 'bind', alias: 'crm', bindingName: 'msg', targetAlias: 'messenger' },
      { ctx, options: defaultOptions() },
    );
    expect(result.exitCode).toBe(0);
    expect(result.success).toBe(true);
    expect(resolveBinding(ctx.configPath, crm.installationId, 'msg')?.targetInstallationId).toBe(
      messenger.installationId,
    );
  });

  it('bind rejects unknown consumer', async () => {
    const result = await dispatchCommand(
      { type: 'bind', alias: 'unknown', bindingName: 'msg', targetAlias: 'messenger' },
      { ctx, options: defaultOptions() },
    );
    expect(result.success).toBe(false);
  });

  it('bind rejects unknown target', async () => {
    addInstallation(ctx.configPath, 'crm', 'app.crm');
    const result = await dispatchCommand(
      { type: 'bind', alias: 'crm', bindingName: 'msg', targetInstallationId: 'unknown' },
      { ctx, options: defaultOptions() },
    );
    expect(result.success).toBe(false);
  });

  it('bind rejects self-binding', async () => {
    addInstallation(ctx.configPath, 'crm', 'app.crm');
    const result = await dispatchCommand(
      { type: 'bind', alias: 'crm', bindingName: 'msg', targetInstallationId: 'crm' },
      { ctx, options: defaultOptions() },
    );
    expect(result.success).toBe(false);
  });

  it('unbind removes a binding', async () => {
    const crm = addInstallation(ctx.configPath, 'crm', 'app.crm');
    const messenger = addInstallation(ctx.configPath, 'messenger', 'app.messenger');
    addBinding(ctx.configPath, crm.installationId, 'msg', messenger.installationId);
    const result = await dispatchCommand(
      { type: 'unbind', alias: 'crm', bindingName: 'msg' },
      { ctx, options: defaultOptions() },
    );
    expect(result.exitCode).toBe(0);
    expect(resolveBinding(ctx.configPath, crm.installationId, 'msg')).toBeUndefined();
  });

  it('unbind returns error for nonexistent binding', async () => {
    addInstallation(ctx.configPath, 'crm', 'app.crm');
    const result = await dispatchCommand(
      { type: 'unbind', alias: 'crm', bindingName: 'missing' },
      { ctx, options: defaultOptions() },
    );
    expect(result.success).toBe(false);
  });

  it('list-bindings shows bindings for an instance', async () => {
    const crm = addInstallation(ctx.configPath, 'crm', 'app.crm');
    const messenger = addInstallation(ctx.configPath, 'messenger', 'app.messenger');
    addBinding(ctx.configPath, crm.installationId, 'msg', messenger.installationId);
    const result = await dispatchCommand(
      { type: 'list-bindings', alias: 'crm' },
      { ctx, options: defaultOptions() },
    );
    expect(result.exitCode).toBe(0);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it('list-bindings shows message when no bindings', async () => {
    addInstallation(ctx.configPath, 'crm', 'app.crm');
    const result = await dispatchCommand(
      { type: 'list-bindings', alias: 'crm' },
      { ctx, options: defaultOptions() },
    );
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain('No bindings');
  });

  it('warm caches tools for all installed apps', async () => {
    addInstallation(ctx.configPath, 'hello', 'hello');
    const result = await dispatchCommand({ type: 'warm' }, { ctx, options: defaultOptions() });
    expect(result.exitCode).toBe(0);
    expect(result.success).toBe(true);
    expect(result.message).toContain('warmed');
    expect(result.message).toContain('cached');
    // The cache should now contain tools from the hello app.
    const cached = readCachedTools(ctx.configPath, 'hello');
    expect(cached.length).toBeGreaterThan(0);
  });

  it('warm reports no instances when none installed', async () => {
    const result = await dispatchCommand({ type: 'warm' }, { ctx, options: defaultOptions() });
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain('No installed apps');
  });

  it('warm reports failures for missing app configs', async () => {
    addInstallation(ctx.configPath, 'ghost', 'nonexistent-app');
    const result = await dispatchCommand({ type: 'warm' }, { ctx, options: defaultOptions() });
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(Array.isArray(result.data)).toBe(true);
    const rows = result.data as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({ Alias: 'ghost', Status: '✗' });
  });
});

// ============================================================================
// Permissions — parser (R9 — Phase 5.6)
// ============================================================================

describe('Parser: permissions commands', () => {
  let tmpDir: string;
  let parseOpts: { configPath: string; config: WorkspaceConfig; aliases: string[] };

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cli-perm-'));
    const config = { apps: { 'app.test': { source: 'npm:app.test' } } };
    const ctx = makeCtx(tmpDir, config);
    addInstallation(ctx.configPath, 'myapp', 'app.test');
    parseOpts = { configPath: ctx.configPath, config, aliases: ['myapp'] };
  });

  afterEach(() => rmSync(tmpDir, { recursive: true, force: true }));

  it('parses "permissions myapp"', () => {
    const cmd = parseReplLine('permissions myapp', parseOpts);
    expect(cmd).toEqual({ type: 'permissions', alias: 'myapp' });
  });

  it('parses "permissions myapp set send-message deny"', () => {
    const cmd = parseReplLine('permissions myapp set send-message deny', parseOpts);
    expect(cmd).toEqual({
      type: 'permissions-set',
      alias: 'myapp',
      tool: 'send-message',
      effect: 'deny',
    });
  });

  it('parses "permissions myapp set send-message ask"', () => {
    const cmd = parseReplLine('permissions myapp set send-message ask', parseOpts);
    expect(cmd).toEqual({
      type: 'permissions-set',
      alias: 'myapp',
      tool: 'send-message',
      effect: 'ask',
    });
  });

  it('parses "permissions myapp remove send-message"', () => {
    const cmd = parseReplLine('permissions myapp remove send-message', parseOpts);
    expect(cmd).toEqual({
      type: 'permissions-remove',
      alias: 'myapp',
      tool: 'send-message',
    });
  });

  it('returns usage for "permissions" without alias', () => {
    const cmd = parseReplLine('permissions', parseOpts);
    expect(cmd.type).toBe('usage');
  });

  it('returns usage for "permissions myapp set" without permission/effect', () => {
    const cmd = parseReplLine('permissions myapp set', parseOpts);
    expect(cmd.type).toBe('usage');
  });
});

// ============================================================================
// Permissions — state management (R9 — Phase 5.6)
// ============================================================================

describe('Permission state', () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cli-perm-state-'));
    const config = { apps: { 'app.test': { source: 'npm:app.test' } } };
    const ctx = makeCtx(tmpDir, config);
    configPath = ctx.configPath;
    addInstallation(configPath, 'myapp', 'app.test');
  });

  afterEach(() => rmSync(tmpDir, { recursive: true, force: true }));

  it('starts with empty permissions', () => {
    expect(loadPermissions(configPath)).toEqual([]);
  });

  it('sets and loads a permission rule', () => {
    setPermission(configPath, 'myapp', 'core-actions:boards', 'deny');
    const rules = getPermissionsForInstallation(configPath, 'myapp');
    expect(rules).toHaveLength(1);
    expect(rules[0].permission).toBe('core-actions:boards');
    expect(rules[0].effect).toBe('deny');
  });

  it('sets a scoped permission rule', () => {
    setPermission(configPath, 'myapp', 'core-actions:repos', 'allow', ['repo-x', 'repo-y']);
    const rules = getPermissionsForInstallation(configPath, 'myapp');
    expect(rules).toHaveLength(1);
    expect(rules[0].scope).toEqual(['repo-x', 'repo-y']);
  });

  it('updates an existing rule', () => {
    setPermission(configPath, 'myapp', 'core-actions:boards', 'allow');
    setPermission(configPath, 'myapp', 'core-actions:boards', 'deny');
    const rules = getPermissionsForInstallation(configPath, 'myapp');
    expect(rules).toHaveLength(1);
    expect(rules[0].effect).toBe('deny');
  });

  it('removes a permission rule', () => {
    setPermission(configPath, 'myapp', 'core-actions:boards', 'deny');
    const removed = removePermission(configPath, 'myapp', 'core-actions:boards');
    expect(removed).toBe(true);
    expect(loadPermissions(configPath)).toEqual([]);
  });

  it('removePermission returns false when no match', () => {
    expect(removePermission(configPath, 'myapp', 'nonexistent')).toBe(false);
  });

  it('removeAllPermissionsForInstallation cleans up on uninstall', () => {
    setPermission(configPath, 'myapp', 'core-actions:boards', 'deny');
    setPermission(configPath, 'myapp', 'network', 'deny');
    removeAllPermissionsForInstallation(configPath, 'myapp');
    expect(loadPermissions(configPath)).toEqual([]);
  });

  it('does not affect other aliases when removing', () => {
    addInstallation(configPath, 'other', 'app.other');
    setPermission(configPath, 'myapp', 'core-actions:boards', 'deny');
    setPermission(configPath, 'other', 'network', 'deny');
    removeAllPermissionsForInstallation(configPath, 'myapp');
    const remaining = loadPermissions(configPath);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].installationId).toBe('other');
  });
});

// ============================================================================
// Permissions — command handlers (R9 — Phase 5.6)
// ============================================================================

describe('Permission commands', () => {
  let tmpDir: string;
  let ctx: CliContext;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cli-perm-cmd-'));
    const config = { apps: { 'app.test': { source: 'npm:app.test' } } };
    ctx = makeCtx(tmpDir, config);
    addInstallation(ctx.configPath, 'myapp', 'app.test');
  });

  afterEach(() => rmSync(tmpDir, { recursive: true, force: true }));

  it('permissions-set stores a per-tool override', async () => {
    const result = await dispatchCommand(
      { type: 'permissions-set', alias: 'myapp', tool: 'send-message', effect: 'deny' },
      { ctx, options: defaultOptions() },
    );
    expect(result.success).toBe(true);
    expect(result.message).toContain('send-message');
    expect(result.message).toContain('deny');

    const installationId = getInstallation(ctx.configPath, 'myapp')!.installationId;
    expect(getToolOverridesForInstallation(ctx.configPath, installationId)['send-message']).toBe(
      'deny',
    );
  });

  it('permissions-remove removes an override', async () => {
    const installationId = getInstallation(ctx.configPath, 'myapp')!.installationId;
    setToolPermission(ctx.configPath, installationId, 'send-message', 'deny');
    const result = await dispatchCommand(
      { type: 'permissions-remove', alias: 'myapp', tool: 'send-message' },
      { ctx, options: defaultOptions() },
    );
    expect(result.success).toBe(true);
    expect(result.message).toContain('removed');
    expect(
      getToolOverridesForInstallation(ctx.configPath, installationId)['send-message'],
    ).toBeUndefined();
  });

  it('permissions-remove fails when the tool has no override', async () => {
    const result = await dispatchCommand(
      { type: 'permissions-remove', alias: 'myapp', tool: 'nonexistent' },
      { ctx, options: defaultOptions() },
    );
    expect(result.success).toBe(false);
  });

  it('permissions fails for unknown alias', async () => {
    const result = await dispatchCommand(
      { type: 'permissions', alias: 'unknown' },
      { ctx, options: defaultOptions() },
    );
    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('Unknown instance');
  });
});
