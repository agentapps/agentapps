/**
 * @agentapps/sdk — app builder.
 *
 * The main entry point for authoring an agent app. Call `createApp()`
 * to get an `AgentApp` builder, register tools, events, and a health handler,
 * then call `.toFactory()` to produce a factory function the app station
 * can spawn, or `.toManifest()` / `.toTools()` to generate the static
 * protocol artifacts consumed by hosts and registries.
 *
 * @example
 * ```ts
 * import { createApp } from '@agentapps/sdk';
 *
 * const app = createApp({
 *   id: 'app.hello',
 *   version: '1.0.0',
 *   name: 'Hello World',
 *   description: 'A minimal Agent App that greets people.',
 *   author: { name: 'Agent Apps', email: 'team@agentapps.tech' },
 *   category: 'utility',
 *   runtime: { transport: 'stdio', command: 'node', args: ['./dist/index.js'] },
 * });
 *
 * app.tool('greet', {
 *   description: 'Greets someone by name',
 *   parameters: {
 *     type: 'object',
 *     properties: { name: { type: 'string', description: 'Name to greet' } },
 *     required: ['name'],
 *   },
 *   handler: async (args) => ({ greeting: `Hello, ${args.name}!` }),
 * });
 *
 * export default app.toFactory();
 * ```
 */

import {
  type AppAuth,
  type AppCapabilities,
  type AppEntrypoint,
  type AppInstallation,
  type AppManifest,
  AppManifestSchema,
  AppRuntimeSchema,
  type HookEntry,
  type HookPoint,
  type ToolDefinition,
  type Transport,
} from '@agentapps/protocol';
import { AppInstance } from './app-instance.js';
import type {
  AppConfig,
  AppRuntime,
  BuildOptions,
  ComponentConfig,
  EventConfig,
  HealthHandler,
  HookConfig,
  HookHandler,
  LifecycleHandler,
  RegisteredEvent,
  RegisteredHook,
  RegisteredLifecycleHandler,
  RegisteredTool,
  RendererConfig,
  ScreenConfig,
  ToolConfig,
  ToolHandler,
} from './types.js';

// ---------------------------------------------------------------------------
// Factory type
// ---------------------------------------------------------------------------

/**
 * Factory function that wires an app instance to a transport.
 *
 * Structurally identical to the app station's `AppFactory` type — the SDK
 * doesn't import from `@agentapps/station` to avoid a circular
 * dependency; TypeScript structural typing ensures compatibility.
 */
export type AppFactory = (
  transport: Transport,
  environment?: InstanceEnvironment,
) => void | Promise<void>;

/**
 * What the Station hands an in-process Instance at spawn. Structurally the
 * same as the Station's type; child processes receive the same values as
 * environment variables.
 */
export interface InstanceEnvironment {
  /** Volume in mount mode (VOL-REQ-5); `AGENTAPPS_VOLUME_PATH` in a child process. */
  volumePath?: string;
}

// ---------------------------------------------------------------------------
// AgentApp builder
// ---------------------------------------------------------------------------

/**
 * Agent App builder.
 *
 * Constructed via `createApp()`. Call `.tool()` to register tools,
 * `.event()` to register events, `.health()` to register a health check
 * handler, then `.toFactory()` to produce a factory the app station or
 * tests can spawn, or `.toManifest()` / `.toTools()` to export the
 * protocol artifacts.
 */
export class AgentApp {
  /** @internal Registered tools. */
  readonly _tools = new Map<string, RegisteredTool>();
  /** @internal Registered events. */
  readonly _events = new Map<string, RegisteredEvent>();
  /** @internal Registered hook handlers keyed by hook point. */
  readonly _hooks = new Map<string, RegisteredHook>();
  /** @internal Registered lifecycle handlers keyed by event type. */
  readonly _lifecycleHandlers = new Map<string, RegisteredLifecycleHandler>();
  /** @internal Registered renderers. */
  readonly _renderers = new Map<
    string,
    {
      name: string;
      description?: string;
      boundTools: string[];
      formats?: ('text' | 'html' | 'markdown')[];
      bundleUrl?: string;
      render?: (
        result: unknown,
        ctx: import('./types.js').ToolContext,
      ) => Promise<import('@agentapps/protocol').RendererOutput>;
    }
  >();
  /** @internal Registered app-defined UI Components. */
  readonly _components = new Map<
    string,
    { name: string; description?: string; bundleUrl: string; propsSchema?: Record<string, unknown> }
  >();
  /** @internal Registered screens. */
  readonly _screens = new Map<
    string,
    {
      name: string;
      title: string;
      description?: string;
      icon?: string;
      components?: import('@agentapps/protocol').ScreenComponent[];
      bundleUrl?: string;
      propsSchema?: Record<string, unknown>;
      launcher: boolean;
      condition?: string;
    }
  >();
  /** @internal Health handler. */
  _healthHandler: HealthHandler | null = null;

  constructor(readonly config: AppConfig) {}

  /**
   * Register an event type.
   *
   * @param name — unique event name (e.g. 'user_joined', 'calendar_updated').
   * @param config — description of the event.
   * @returns `this` for chaining.
   * @throws if an event with the same name is already registered.
   */
  event(name: string, config: EventConfig): this {
    if (this._events.has(name)) {
      throw new Error(`Event '${name}' is already registered`);
    }
    this._events.set(name, {
      name,
      description: config.description,
    });
    return this;
  }

  /**
   * Register a tool.
   *
   * @param name — unique tool name (e.g. 'greet', 'search-tasks').
   * @param config — description, parameters schema, optional annotations, handler.
   * @returns `this` for chaining.
   * @throws if a tool with the same name is already registered.
   */
  tool<TArgs = Record<string, unknown>>(name: string, config: ToolConfig<TArgs>): this {
    if (this._tools.has(name)) {
      throw new Error(`Tool '${name}' is already registered`);
    }
    this._tools.set(name, {
      name,
      description: config.description,
      parameters: config.parameters,
      annotations: config.annotations,
      handler: config.handler as ToolHandler,
    });
    return this;
  }

  /**
   * Declare that this app needs the workspace volume mounted directly into
   * the container at /workspace (POSIX filesystem access via Node's `fs`).
   *
   * Only for apps that need real filesystem access (e.g. Bash, Filesystem).
   * Most apps should use `ctx.volume` SDK requests instead.
   *
   * @returns `this` for chaining.
   */
  mountVolume(): this {
    this.config.mountVolume = true;
    return this;
  }

  /**
   * Register a health check handler.
   *
   * @param handler — async function that returns a `HealthResult`.
   * @returns `this` for chaining.
   */
  health(handler: HealthHandler): this {
    this._healthHandler = handler;
    return this;
  }

  /**
   * Register a callback invoked when a session subscribes to events.
   *
   * This lets apps start polling, open connections, or emit an initial event
   * when a subscriber is attached. The request receives a ToolContext bound
   * to the subscribing session.
   *
   * @param handler — request invoked with the subscription context and event types.
   * @returns `this` for chaining.
   */
  onSubscribe(handler: NonNullable<AppConfig['onSubscribe']>): this {
    this.config.onSubscribe = handler;
    return this;
  }

  /**
   * Register a conversation hook and declare it in the manifest.
   *
   * @example
   * ```ts
   * app.hook('pre-turn', {
   *   maxTokens: 40,
   *   handler: ({ input }) => ({ context: [{ label: 'Now', text: input.now }] }),
   * });
   * ```
   *
   * @spec HOOK-REQ-8
   */
  hook<P extends HookPoint>(point: P, config: HookConfig<P> | HookHandler<P>): this {
    if (this._hooks.has(point)) {
      throw new Error(`Hook '${point}' is already registered`);
    }
    const options: HookConfig<P> = typeof config === 'function' ? { handler: config } : config;
    if (options.transform !== undefined && point !== 'pre-turn') {
      throw new Error('`transform` is only allowed on the pre-turn hook point');
    }
    this._hooks.set(point, {
      point,
      description: options.description,
      transform: options.transform,
      handler: options.handler as HookHandler,
    });

    // HOOK-REQ-8: the registration becomes the manifest entry.
    const declaration = {
      point,
      ...(options.maxTokens !== undefined ? { maxTokens: options.maxTokens } : {}),
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      ...(options.history !== undefined ? { history: options.history } : {}),
      ...(options.transform !== undefined ? { transform: options.transform } : {}),
    };
    const entry: HookEntry = Object.keys(declaration).length === 1 ? point : declaration;
    this.config.hooks = [
      ...(this.config.hooks ?? []).filter((e) => (typeof e === 'string' ? e : e.point) !== point),
      entry,
    ];
    return this;
  }

  /**
   * Register an installation lifecycle handler.
   *
   * Called when the app is first installed for an installation.
   * Use for one-time setup: initializing storage, registering webhooks,
   * sending welcome messages, etc.
   *
   * @param handler — lifecycle handler function.
   * @returns `this` for chaining.
   * @throws if an onInstall handler is already registered.
   */
  onInstall(handler: LifecycleHandler): this {
    return this.registerLifecycleHandler('install', handler);
  }

  /**
   * Register an uninstallation lifecycle handler.
   *
   * Called when the app is being removed from an installation.
   * Use for cleanup: deleting stored data, revoking webhooks, etc.
   *
   * @param handler — lifecycle handler function.
   * @returns `this` for chaining.
   * @throws if an onUninstall handler is already registered.
   */
  onUninstall(handler: LifecycleHandler): this {
    return this.registerLifecycleHandler('uninstall', handler);
  }

  /**
   * Register a hook called each time a session is opened.
   *
   * The hook receives a `SessionContext` with execution context and event
   * emission capabilities.
   *
   * @param handler — async function invoked with a session context.
   * @returns `this` for chaining.
   */
  onSessionOpen(handler: NonNullable<AppConfig['onSessionOpen']>): this {
    this.config.onSessionOpen = handler;
    return this;
  }

  /**
   * Register a hook called when a session is closed.
   *
   * @param handler — async function invoked with a session context.
   * @returns `this` for chaining.
   */
  onSessionClose(handler: NonNullable<AppConfig['onSessionClose']>): this {
    this.config.onSessionClose = handler;
    return this;
  }

  /**
   * Register an upgrade lifecycle handler.
   *
   * Called when the app version changes for an installation.
   * Use for migrations: schema changes, data format updates, etc.
   * The handler receives `ctx.previousVersion` with the old version.
   *
   * @param handler — lifecycle handler function.
   * @returns `this` for chaining.
   * @throws if an onUpgrade handler is already registered.
   */
  onUpgrade(handler: LifecycleHandler): this {
    return this.registerLifecycleHandler('upgrade', handler);
  }

  /** @internal Register a lifecycle handler by event type. */
  private registerLifecycleHandler(
    event: import('@agentapps/protocol').LifecycleEvent,
    handler: LifecycleHandler,
  ): this {
    if (this._lifecycleHandlers.has(event)) {
      throw new Error(`Lifecycle handler '${event}' is already registered`);
    }
    this._lifecycleHandlers.set(event, { event, handler });
    return this;
  }

  /**
   * Register a renderer — the presentation of a tool's result, bound to tools by name.
   *
   * @param name — unique renderer name (e.g. 'task-card', 'chart-view').
   * @param config — bound tools, format variants, optional iframe bundle URL.
   * @returns `this` for chaining.
   */
  renderer(name: string, config: RendererConfig): this {
    if (this._renderers.has(name)) {
      throw new Error(`Renderer '${name}' is already registered`);
    }
    this._renderers.set(name, {
      name,
      description: config.description,
      boundTools: config.boundTools,
      formats: config.formats,
      bundleUrl: config.bundleUrl,
      render: config.render,
    });
    return this;
  }

  /**
   * Register an app-defined UI Component — a sandboxed bundle for what the
   * standard component vocabulary does not cover. Referenced by name from
   * a screen's `components`.
   *
   * @param name — unique component name.
   * @param config — bundle URL, optional props schema.
   * @returns `this` for chaining.
   */
  component(name: string, config: ComponentConfig): this {
    if (this._components.has(name)) {
      throw new Error(`Component '${name}' is already registered`);
    }
    this._components.set(name, {
      name,
      description: config.description,
      bundleUrl: config.bundleUrl,
      propsSchema: config.propsSchema,
    });
    return this;
  }

  /**
   * Register a screen — a navigable page composed of UI Components or a
   * full-page bundle. The screen flagged `launcher` is where the user lands.
   *
   * @param name — unique screen name.
   * @param config — title, components or bundle URL, launcher, condition.
   * @returns `this` for chaining.
   */
  screen(name: string, config: ScreenConfig): this {
    if (this._screens.has(name)) {
      throw new Error(`Screen '${name}' is already registered`);
    }
    this._screens.set(name, {
      name,
      title: config.title,
      description: config.description,
      icon: config.icon,
      components: config.components,
      bundleUrl: config.bundleUrl,
      propsSchema: config.propsSchema,
      launcher: config.launcher ?? false,
      condition: config.condition,
    });
    return this;
  }

  /**
   * Produce an `AppFactory` function.
   *
   * Each call to the returned factory creates a fresh `AppInstance`
   * wired to the given transport. Use with `InProcessRuntime`, or
   * any future runtime adapter that expects an `AppFactory`.
   */
  toFactory(): AppFactory {
    // Snapshot the current registration state so mutations after
    // toFactory() don't affect already-spawned instances.
    const config = { ...this.config };
    const tools = new Map(this._tools);
    const events = new Map(this._events);
    const healthHandler = this._healthHandler;
    const hooks = new Map(this._hooks);
    const lifecycleHandlers = new Map(this._lifecycleHandlers);
    const renderers = new Map(this._renderers);

    return (transport: Transport, environment?: InstanceEnvironment) => {
      new AppInstance(
        config,
        tools,
        events,
        healthHandler,
        transport,
        hooks,
        lifecycleHandlers,
        renderers,
        // VOL-REQ-5: in-process spawn first, then the child-process environment.
        environment?.volumePath ?? process.env.AGENTAPPS_VOLUME_PATH,
      );
    };
  }

  /**
   * Generate a protocol v2.0 `AppManifest` from the declarative config.
   *
   * Inferred fields:
   * - `capabilities.tools` defaults to true.
   * - `capabilities.events` defaults to true if any event is registered.
   * - `capabilities.health` defaults to true.
   * - `entrypoint` is normalized from a plain string to the structured shape.
   * - `runtime.mountVolume` is set from `config.mountVolume`.
   *
   * The returned object has keys in a stable RFC order so that
   * `JSON.stringify` produces deterministic output for CI diffs.
   */
  toManifest(): AppManifest {
    const capabilities = this.buildCapabilities();
    const auth = this.buildAuth();
    const entrypoint = this.buildEntrypoint();
    const installation = this.buildInstallation();
    const runtime = this.buildRuntime();

    const manifest: AppManifest = sortManifestFields({
      id: this.config.id,
      version: this.config.version,
      name: this.config.name,
      description: this.config.description,
      tagline: this.config.tagline ?? this.config.description.slice(0, 120),
      author: this.config.author,
      category: this.config.category,
      logo: this.config.logo ?? 'assets/logo.svg',
      logoMono: this.config.logoMono ?? 'assets/logo-mono.svg',
      terms: this.config.terms ?? 'https://agentapps.tech/terms',
      runtime,
      entrypoint,
      capabilities,
      auth,
      installation,
      ...(this.config.license !== undefined ? { license: this.config.license } : {}),
      ...(this.config.icon !== undefined ? { icon: this.config.icon } : {}),
      ...(this.config.color !== undefined ? { color: this.config.color } : {}),
      ...(this.config.image !== undefined ? { image: this.config.image } : {}),
      ...(this.config.screenshots !== undefined ? { screenshots: this.config.screenshots } : {}),
      ...(this.config.homepage !== undefined ? { homepage: this.config.homepage } : {}),
      ...(this.config.keywords !== undefined ? { keywords: this.config.keywords } : {}),
      ...(this.config.permissions !== undefined ? { permissions: this.config.permissions } : {}),
      ...(this.config.requires !== undefined && this.config.requires.length > 0
        ? { requires: this.config.requires }
        : {}),
      ...(this.config.hooks !== undefined && this.config.hooks.length > 0
        ? { hooks: this.config.hooks }
        : {}),
      ...(this._renderers.size > 0 ? { renderers: [...this._renderers.values()] } : {}),
      ...(this._components.size > 0 ? { components: [...this._components.values()] } : {}),
      ...(this._screens.size > 0 ? { screens: [...this._screens.values()] } : {}),
    });

    return AppManifestSchema.parse(manifest);
  }

  /**
   * Generate the array of `ToolDefinition` objects for `tools.json`.
   *
   * Each registered tool is serialized with its name, description,
   * parameters schema, and the annotations its author declared. Nothing is
   * inferred: a hint that was not declared is left out.
   *
   * Tools are returned sorted by name for stable output.
   */
  toTools(): ToolDefinition[] {
    return [...this._tools.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        annotations: tool.annotations,
      }));
  }

  /**
   * Build the static artifacts (`agentapp.json` and `tools.json`) to disk.
   *
   * @param options — output directory and filename options.
   * @returns paths to the written files.
   */
  async build(options: BuildOptions = {}): Promise<{ manifestPath: string; toolsPath: string }> {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const { join } = await import('node:path');

    const outDir = options.outDir ?? process.cwd();
    await mkdir(outDir, { recursive: true });

    const manifestFileName = options.manifestFileName ?? 'agentapp.json';
    const manifestPath = join(outDir, manifestFileName);
    const toolsPath = join(outDir, 'tools.json');

    const manifest = this.toManifest();
    const tools = this.toTools();

    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await writeFile(toolsPath, `${JSON.stringify(tools, null, 2)}\n`, 'utf8');

    return { manifestPath, toolsPath };
  }

  // -------------------------------------------------------------------------
  // Manifest helpers
  // -------------------------------------------------------------------------

  private buildCapabilities(): AppCapabilities {
    const input = this.config.capabilities ?? {};
    const hasEvents = this._events.size > 0;

    return {
      tools: input.tools ?? true,
      events: input.events ?? hasEvents,
      health: input.health ?? true,
      streaming: input.streaming ?? false,
    };
  }

  private buildAuth(): AppAuth | false {
    const auth = this.config.auth;
    if (auth === undefined || auth === false) {
      return false;
    }
    if (auth.type === 'none') {
      return { type: 'none' };
    }
    // The protocol AppAuth schema includes api-key and github-app, so the SDK definition is a structural
    // subset of the protocol type. The cast is safe because the manifest
    // schema validates the emitted shape.
    return auth as AppAuth;
  }

  private buildEntrypoint(): AppEntrypoint {
    const entrypoint = this.config.entrypoint;
    if (entrypoint === undefined) {
      return { type: 'module', path: './src/index.ts', export: 'default' };
    }
    if (typeof entrypoint === 'string') {
      return { type: 'module', path: entrypoint, export: 'default' };
    }
    return entrypoint;
  }

  private buildInstallation(): AppInstallation {
    const input = this.config.installation ?? {};
    return {
      singleton: input.singleton ?? false,
      requiresUserConsent: input.requiresUserConsent ?? false,
    };
  }

  private buildRuntime(): AppRuntime {
    const runtime = this.config.runtime as Record<string, unknown>;
    if (this.config.mountVolume !== undefined) {
      return AppRuntimeSchema.parse({ ...runtime, mountVolume: this.config.mountVolume });
    }
    return AppRuntimeSchema.parse(runtime);
  }
}

// ---------------------------------------------------------------------------
// Stable serialization helpers
// ---------------------------------------------------------------------------

/**
 * Canonical field order for `agentapp.json`.
 *
 * Keeping keys in a fixed order makes diffs deterministic and makes it
 * easier for humans to scan generated manifests. Optional fields are
 * omitted when undefined by the caller; when present they are placed
 * in this order.
 */
const MANIFEST_FIELD_ORDER: Array<keyof AppManifest | '$schema'> = [
  '$schema',
  'id',
  'version',
  'name',
  'description',
  'author',
  'license',
  'icon',
  'category',
  'keywords',
  'entrypoint',
  'runtime',
  'capabilities',
  'permissions',
  'requires',
  'hooks',
  'auth',
  'installation',
];

/**
 * Reorder an object to match the canonical manifest field order.
 *
 * Only iterates over known fields; unknown fields are preserved at the
 * end in insertion order. This function is a pure helper — the final
 * validation is still performed by `AppManifestSchema`.
 */
function sortManifestFields<T extends Record<string, unknown>>(input: T): T {
  const sorted = {} as Record<string, unknown>;
  for (const key of MANIFEST_FIELD_ORDER) {
    if (key in input) {
      sorted[key] = input[key];
    }
  }
  for (const key of Object.keys(input)) {
    if (!MANIFEST_FIELD_ORDER.includes(key as (typeof MANIFEST_FIELD_ORDER)[number])) {
      sorted[key] = input[key];
    }
  }
  return sorted as T;
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Create a new Agent App.
 *
 * @param config — full app configuration including identity, runtime, auth, and capabilities.
 * @returns an `AgentApp` builder for registering tools, events, and health checks.
 */
export function createApp(config: AppConfig): AgentApp {
  return new AgentApp(config);
}
