/**
 * Agent Apps Manifest v1.0
 *
 * Declarative description of an Agent App. The manifest lives in the app's
 * repository (conventionally as `agentapp.json`) and is consumed by hosts,
 * app stations, registries, and the CLI to discover, install, validate, and
 * run apps without executing them first.
 *
 * The manifest is intentionally agnostic to any host platform. It does not
 * reference workspaces, channels, agents, or any other host-specific concept.
 */

import { z } from 'zod';
import { HookEntrySchema } from './hooks.js';

// ----------------------------------------------------------------------------
// Identity
// ----------------------------------------------------------------------------

/** App ID format: app.<name> or app.<vendor>.<name> or deeper nesting. */
export const AppIdRegex = /^app\.[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$/;

export const AppAuthorSchema = z.object({
  name: z.string().min(1, 'Author name is required'),
  email: z.string().email('Invalid email format'),
  url: z.string().url('Invalid URL format').optional(),
});
export type AppAuthor = z.infer<typeof AppAuthorSchema>;

// ----------------------------------------------------------------------------
// Auth
// ----------------------------------------------------------------------------

export const AppAuthTypeSchema = z.enum(['none', 'api-key', 'oauth2', 'github-app']);
export type AppAuthType = z.infer<typeof AppAuthTypeSchema>;

/**
 * The variables an App may write as `{{name}}` in `auth.setup`. The Station
 * replaces each with its value when it resolves the instructions.
 *
 * @spec SETUP-REQ-3
 */
export const AUTH_SETUP_VARIABLES = ['redirectUri'] as const;
export type AuthSetupVariable = (typeof AUTH_SETUP_VARIABLES)[number];

/** Matches one `{{name}}` in a setup text; group 1 is the name as written. */
const AUTH_SETUP_VARIABLE_PATTERN = /\{\{([^{}]*)\}\}/g;

/**
 * The variable names an `auth.setup` text uses, in order and without repeats.
 *
 * @spec SETUP-REQ-3
 */
export function authSetupVariableNames(setup: string): string[] {
  const names: string[] = [];
  for (const match of setup.matchAll(AUTH_SETUP_VARIABLE_PATTERN)) {
    const name = match[1] ?? '';
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

/**
 * The variables an `auth.setup` text names that are not defined.
 *
 * @spec SETUP-REQ-3
 */
export function undefinedAuthSetupVariables(setup: string): string[] {
  const defined: readonly string[] = AUTH_SETUP_VARIABLES;
  return authSetupVariableNames(setup).filter((name) => !defined.includes(name));
}

/**
 * Replaces every `{{name}}` of a setup text with its value.
 *
 * @spec SETUP-REQ-4
 */
export function resolveAuthSetup(setup: string, values: Record<AuthSetupVariable, string>): string {
  return setup.replace(AUTH_SETUP_VARIABLE_PATTERN, (whole, name: string) =>
    Object.hasOwn(values, name) ? values[name as AuthSetupVariable] : whole,
  );
}

/**
 * `auth.setup`: plain-text steps to obtain and register what the App's system
 * secrets need. Shown as written; unrelated to `setupUrl` of `github-app`.
 *
 * @spec SETUP-REQ-3
 */
const AuthSetupSchema = z
  .string()
  .min(1, 'auth.setup must not be empty')
  .superRefine((setup, ctx) => {
    for (const name of undefinedAuthSetupVariables(setup)) {
      ctx.addIssue({
        code: 'custom',
        message: `auth.setup names the undefined variable {{${name}}}; defined: ${AUTH_SETUP_VARIABLES.map((v) => `{{${v}}}`).join(', ')}`,
      });
    }
  });

export const AppAuthSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('none'),
    /** An App with no auth has nothing to set up (SETUP-REQ-3). */
    setup: z
      .undefined({ message: 'auth.setup is not allowed when auth.type is "none"' })
      .optional(),
  }),
  z.object({
    type: z.literal('api-key'),
    /** Steps to obtain the App's system secrets (SETUP-REQ-3). */
    setup: AuthSetupSchema.optional(),
    /** System-level secrets (shared API keys, service accounts). */
    systemSecrets: z.array(z.string()).optional(),
    /** Installation secrets (personal API keys, OAuth tokens). */
    installationSecrets: z.array(z.string()).optional(),
    /** @deprecated Has no effect: the app builds its own request headers. */
    headerName: z.string().optional(),
    /** @deprecated Has no effect: the app builds its own request headers. */
    headerPrefix: z.string().optional(),
  }),
  z.object({
    type: z.literal('oauth2'),
    /** Steps to obtain and register the OAuth client (SETUP-REQ-3). */
    setup: AuthSetupSchema.optional(),
    /** OAuth provider identifier (e.g., 'google', 'microsoft'). */
    provider: z.string().min(1, 'OAuth2 provider is required'),
    /** OAuth2 authorization URL. */
    authorizeUrl: z.string().url('Invalid authorize URL'),
    /** OAuth2 token exchange URL. */
    tokenUrl: z.string().url('Invalid token URL'),
    /** Required OAuth2 scopes. */
    scopes: z.array(z.string()).min(1, 'At least one scope is required for OAuth2'),
    /** Optional OAuth2 scopes. */
    optionalScopes: z.array(z.string()).optional(),
    /** Separator used to join scopes (defaults to ' '). */
    scopeSeparator: z.string().optional(),
    /** Whether to use PKCE (for public clients without client_secret). */
    pkce: z.boolean().optional(),
    /** Required system secrets (CLIENT_ID, CLIENT_SECRET, etc.). */
    systemSecrets: z.array(z.string()).optional(),
    /** Required installation secrets (ACCESS_TOKEN, REFRESH_TOKEN, etc.). */
    installationSecrets: z.array(z.string()).optional(),
    /** Extra user-configurable fields for OAuth apps (e.g., TEAM_ID). */
    extraFields: z
      .array(
        z.object({
          name: z.string().min(1),
          label: z.string().optional(),
          type: z.enum(['text', 'password']).optional(),
          required: z.boolean().optional(),
          placeholder: z.string().optional(),
          hint: z.string().optional(),
        }),
      )
      .optional(),
  }),
  z
    .object({
      type: z.literal('github-app'),
      /** Steps to register the GitHub App; not `setupUrl` (SETUP-REQ-3). */
      setup: AuthSetupSchema.optional(),
      /** Provider — fixed to 'github' for now. */
      provider: z.literal('github'),
      /** Public slug of the App on github.com (`https://github.com/apps/<slug>`). */
      appSlug: z.string().min(1, 'appSlug is required'),
      /** Setup URL configured in the App settings. */
      setupUrl: z.string().url('Invalid setupUrl'),
      /** Whether the App requests user OAuth during installation. */
      userOAuth: z.boolean().optional(),
      /** OAuth2 token endpoint — required when userOAuth is true. */
      tokenUrl: z.string().url('Invalid tokenUrl').optional(),
      /** Permissions requested at installation time. */
      permissions: z.record(z.string(), z.enum(['read', 'write', 'admin'])).optional(),

      /** Webhook events subscribed by the App. */
      events: z.array(z.string()).optional(),
      /** Required system secrets (GITHUB_APP_ID, PRIVATE_KEY, WEBHOOK_SECRET). */
      systemSecrets: z.array(z.string()).optional(),
      /** Required installation secrets (INSTALLATION_ID). */
      installationSecrets: z.array(z.string()).optional(),
    })
    .refine(
      (data) => {
        if (data.userOAuth === true) {
          return typeof data.tokenUrl === 'string' && data.tokenUrl.length > 0;
        }
        return true;
      },
      {
        message: 'tokenUrl is required when userOAuth is true',
        path: ['tokenUrl'],
      },
    )
    .refine(
      (data) => {
        if (data.userOAuth === true) {
          return Array.isArray(data.events) && data.events.length > 0;
        }
        return true;
      },
      {
        message: 'at least one webhook event is required when userOAuth is true',
        path: ['events'],
      },
    ),
]);
export type AppAuth = z.infer<typeof AppAuthSchema>;

// ----------------------------------------------------------------------------
// Entrypoint
// ----------------------------------------------------------------------------

export const AppEntrypointSchema = z.object({
  /** Module system of the entry file. */
  type: z.enum(['module', 'commonjs']),
  /** Path to the entry file, relative to the manifest. */
  path: z.string().min(1, 'Entrypoint path is required'),
  /** Name of the export to use as the app factory. Default: 'default'. */
  export: z.string().min(1).default('default'),
});
export type AppEntrypoint = z.infer<typeof AppEntrypointSchema>;

// ----------------------------------------------------------------------------
// Runtime — transport-specific schemas
// ----------------------------------------------------------------------------

export const AppTransportSchema = z.enum(['stdio', 'http']);
export type AppTransport = z.infer<typeof AppTransportSchema>;

const AppRuntimeBaseSchema = z.object({
  /** Transport binding used by the app to speak the Agent Apps protocol. */
  transport: AppTransportSchema,
});

export const AppStdioRuntimeSchema = AppRuntimeBaseSchema.extend({
  transport: z.literal('stdio'),
  /** Command to execute. */
  command: z.string().min(1, 'Command is required for stdio transport'),
  /** Arguments for the command. */
  args: z.array(z.string()).optional(),
  /** Working directory for the spawned process, relative to the manifest. */
  cwd: z.string().optional(),
  /** Additional environment variables to set. */
  env: z.record(z.string(), z.string()).optional(),
  /**
   * Volume in mount mode: the Station hands the instance the workspace Volume
   * as a real directory (at /workspace) instead of the API. Only for apps that
   * need POSIX access, such as Bash. Default: false.
   */
  mountVolume: z.boolean().optional(),
}).strict();
export type AppStdioRuntime = z.infer<typeof AppStdioRuntimeSchema>;

/** Keywords that suggest a variable name is a secret. */
export const SECRET_NAME_KEYWORDS = ['KEY', 'TOKEN', 'SECRET', 'PASSWORD', 'PRIVATE'];

/** Check whether a variable name looks like a secret. */
export function looksLikeSecretName(name: string): boolean {
  const upper = name.toUpperCase();
  return SECRET_NAME_KEYWORDS.some((keyword) => upper.includes(keyword));
}

export const AppHttpRuntimeSchema = AppRuntimeBaseSchema.extend({
  transport: z.literal('http'),
  /** Base URL of the app. */
  url: z.string().url('Invalid URL'),
  /** Health check endpoint path. */
  healthCheck: z.string().optional(),
}).strict();
export type AppHttpRuntime = z.infer<typeof AppHttpRuntimeSchema>;

export const AppRuntimeSchema = z.discriminatedUnion('transport', [
  AppStdioRuntimeSchema,
  AppHttpRuntimeSchema,
]);
export type AppRuntime = z.infer<typeof AppRuntimeSchema>;

// ----------------------------------------------------------------------------
// Capabilities — protocol-level features the app uses
// ----------------------------------------------------------------------------

export const AppCapabilitiesSchema = z.object({
  /** Exposes tools via the session plane. */
  tools: z.boolean().default(true),
  /** Emits and/or receives events. */
  events: z.boolean().default(false),
  /** Responds to health_check requests. */
  health: z.boolean().default(true),
  /** Supports progress, stream, and log messages. */
  streaming: z.boolean().default(false),
});
export type AppCapabilities = z.infer<typeof AppCapabilitiesSchema>;

// ----------------------------------------------------------------------------
// Permissions — platform access the app requests, approved at install time
// ----------------------------------------------------------------------------

/**
 * Risk level determines the consent tier:
 * - low: approved by the installing user alone
 * - high: additionally requires workspace-admin approval
 */
export const PermissionRiskLevel = {
  low: 'low',
  high: 'high',
} as const;

/**
 * Maps each permission key to its risk level. Used by hosts to build consent screens.
 */
export const PERMISSION_RISK_LEVELS: Record<string, 'low' | 'high'> = {
  profile: 'low',
  'profile.full': 'low',
  network: 'high',
  volume: 'high',
  intents: 'high',
  hooksContext: 'low',
  hooksVeto: 'high',
  hooksTransform: 'high',
  hooksHistory: 'high',
  hooksConversation: 'high',
  hooksWorkspaceWide: 'high',
};

/** Network egress permission: allowlist of destination hosts/patterns. */
export const NetworkPermissionSchema = z.object({
  /** Allowed egress destinations. Glob patterns supported (e.g. '*.googleapis.com'). '*' means unrestricted. */
  egress: z.array(z.string().min(1)).min(1, 'At least one egress destination is required'),
});
export type NetworkPermission = z.infer<typeof NetworkPermissionSchema>;

/**
 * Structured permissions object: access the app asks for to something that is
 * not its own, approved once at install time. What the app offers (tools,
 * events, renderers, screens, components) is a capability, declared elsewhere
 * in the manifest, and needs no permission. Storage and Objects are private to
 * the Installation and need no declaration either.
 * The host uses this for consent screens, and enforces permissions at runtime.
 */
export const AppPermissionsSchema = z
  .object({
    /** Access to user profile data. 'basic' = id, displayName, locale, tz. 'full' = basic + email, avatar. */
    profile: z.enum(['basic', 'full']).optional(),

    /** Outbound network access with egress allowlist. */
    network: NetworkPermissionSchema.optional(),

    /** The Workspace's shared Volume, in API or mount mode. */
    volume: z.boolean().optional(),

    /** Calling tools of other apps through Bindings (see `requires`). */
    intents: z.boolean().optional(),

    /** Hooks: contribute context at any shaping point (HOOK-REQ-9). */
    hooksContext: z.boolean().optional(),

    /** Hooks: veto the user's message at pre-turn (HOOK-REQ-9). */
    hooksVeto: z.boolean().optional(),

    /** Hooks: transform the user's message at pre-turn (HOOK-REQ-9). */
    hooksTransform: z.boolean().optional(),

    /** Hooks: receive previous turns in the pre-turn input (HOOK-REQ-9). */
    hooksHistory: z.boolean().optional(),

    /** Hooks: receive conversation content at post-turn, post-compaction and on-dream (HOOK-REQ-9). */
    hooksConversation: z.boolean().optional(),

    /** Hooks: fire in every conversation of the Workspace (HOOK-REQ-10). */
    hooksWorkspaceWide: z.boolean().optional(),
  })
  .strict();
export type AppPermissions = z.infer<typeof AppPermissionsSchema>;

// ----------------------------------------------------------------------------
// Requires — app-to-app dependencies (intent bindings)
// ----------------------------------------------------------------------------

export const AppRequirementSchema = z.object({
  /** Local dependency name used by the app in ctx.intent(name, ...). */
  name: z.string().min(1, 'Requirement name is required'),
  /** Tool names the target must expose (structural contract). */
  tools: z.array(z.string().min(1)).min(1, 'At least one required tool must be specified'),
  /** Canonical app id hint for the binding UX (e.g. 'app.whatsapp.messenger'). */
  suggest: z.string().regex(AppIdRegex, { message: 'suggest must be a valid app id' }).optional(),
  /** Whether this dependency is optional (app degrades gracefully if unbound). */
  optional: z.boolean().default(false),
});
export type AppRequirement = z.infer<typeof AppRequirementSchema>;

// ----------------------------------------------------------------------------
// UI — renderers, app-defined components, screens
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// UI Components — the standard vocabulary a Renderer or a Screen is made of
// ----------------------------------------------------------------------------

/** A node of a `tree` component. Recursive. */
export interface UITreeNode {
  id: string;
  label: string;
  icon?: string;
  badge?: string | number;
  completed?: boolean;
  collapsed?: boolean;
  children?: UITreeNode[];
  meta?: Record<string, unknown>;
}

export const UITreeNodeSchema: z.ZodType<UITreeNode> = z.object({
  /** Unique node id (within this tree). */
  id: z.string(),
  /** Display label shown to the user. */
  label: z.string(),
  /** Optional icon name or emoji. */
  icon: z.string().optional(),
  /** Optional badge (count, status indicator). */
  badge: z.union([z.string(), z.number()]).optional(),
  /** Whether the node is marked done. */
  completed: z.boolean().optional(),
  /** Whether the host should show the node folded. */
  collapsed: z.boolean().optional(),
  /** Nested children. */
  children: z.array(z.lazy(() => UITreeNodeSchema)).optional(),
  /** Arbitrary metadata for host-side use. */
  meta: z.record(z.string(), z.unknown()).optional(),
});

/** How a `detail` field value should be drawn. */
export const UIDetailFieldKindSchema = z.enum(['text', 'code', 'date', 'url', 'markdown', 'image']);
export type UIDetailFieldKind = z.infer<typeof UIDetailFieldKindSchema>;

/** One key/value field of a `detail` component. */
export const UIDetailFieldSchema = z.object({
  label: z.string(),
  value: z.unknown(),
  kind: UIDetailFieldKindSchema.optional(),
});
export type UIDetailField = z.infer<typeof UIDetailFieldSchema>;

/**
 * Standard UI Components. The Host draws them in its own theme; an App never
 * ships view code for them. App-defined components are declared separately
 * (see `ComponentDeclarationSchema`) and referenced by name from a Screen.
 */
export const UIComponentSchema = z.discriminatedUnion('type', [
  /** Simple text block with optional style. */
  z.object({
    type: z.literal('text'),
    content: z.string(),
    style: z.enum(['body', 'heading', 'subheading', 'caption', 'code']).optional(),
  }),
  /** Tabular data with typed columns. */
  z.object({
    type: z.literal('table'),
    columns: z.array(z.object({ key: z.string(), label: z.string() })).min(1),
    rows: z.array(z.record(z.string(), z.unknown())),
  }),
  /** Card with optional title and key/value fields. */
  z.object({
    type: z.literal('card'),
    title: z.string().optional(),
    fields: z.array(z.object({ label: z.string(), value: z.unknown() })),
  }),
  /** Simple bar/line/pie chart. */
  z.object({
    type: z.literal('chart'),
    chartType: z.enum(['bar', 'line', 'pie']),
    data: z.array(z.object({ label: z.string(), value: z.number() })),
    title: z.string().optional(),
  }),
  /** Interactive form. The host collects the values and, when `submit` is set, calls that tool with them. */
  z.object({
    type: z.literal('form'),
    fields: z.array(
      z.object({
        name: z.string(),
        label: z.string(),
        inputType: z.enum(['text', 'number', 'boolean', 'select']),
        options: z.array(z.string()).optional(),
        required: z.boolean().optional(),
      }),
    ),
    submitLabel: z.string().optional(),
    /** Tool the host calls with the field values when the form is submitted. */
    submit: z.object({ tool: z.string().min(1) }).optional(),
  }),
  /** Flat list of items. */
  z.object({
    type: z.literal('list'),
    items: z.array(
      z.object({
        label: z.string(),
        description: z.string().optional(),
        icon: z.string().optional(),
      }),
    ),
    title: z.string().optional(),
  }),
  /** Hierarchical tree of nodes (task lists, file explorers, outlines). */
  z.object({
    type: z.literal('tree'),
    nodes: z.array(UITreeNodeSchema),
    title: z.string().optional(),
  }),
  /** Panel of key/value fields grouped in sections. */
  z.object({
    type: z.literal('detail'),
    title: z.string().optional(),
    sections: z.array(
      z.object({
        title: z.string().optional(),
        fields: z.array(UIDetailFieldSchema),
      }),
    ),
  }),
  /** Displayed image. */
  z.object({
    type: z.literal('image'),
    url: z.string(),
    alt: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
  }),
  /** Visual divider / separator. */
  z.object({ type: z.literal('divider') }),
]);
export type UIComponent = z.infer<typeof UIComponentSchema>;

/**
 * Renderer output carried in a tool result (6.1).
 *
 * Contains declarative components the host renders natively, plus
 * optional pre-rendered format variants for hosts that can't render
 * the declarative schema (text-only CLI, markdown chat, etc.).
 */
export const RendererOutputSchema = z.object({
  /** Declarative components the host renders using its own theme. */
  components: z.array(UIComponentSchema).optional(),
  /** Pre-rendered format variants (fallback for non-declarative hosts). */
  variants: z
    .object({
      text: z.string().optional(),
      html: z.string().optional(),
      markdown: z.string().optional(),
    })
    .optional(),
});
export type RendererOutput = z.infer<typeof RendererOutputSchema>;

/**
 * Renderer declaration in the manifest (6.1, 6.4, 6.5).
 *
 * A renderer is a UI piece embedded in chat context, bound to specific tools.
 * When a bound tool returns, the host renders its result with this renderer
 * instead of plain text. Deterministic — neither the LLM nor the app decides.
 */
export const RendererDeclarationSchema = z.object({
  /** Renderer name (unique within the app). */
  name: z.string().min(1),
  /** Human-readable description. */
  description: z.string().optional(),
  /** Tools this renderer is bound to (by name). */
  boundTools: z.array(z.string().min(1)).min(1),
  /**
   * Supported format variants the app can produce (6.5).
   * Host picks by its presentation mode. If the app produces declarative
   * components, the host renders those regardless of this list.
   */
  formats: z.array(z.enum(['text', 'html', 'markdown'])).optional(),
  /** Iframe bundle URL for the escape hatch (6.3). If present, the host loads a sandboxed iframe. */
  bundleUrl: z.string().url().optional(),
});
export type RendererDeclaration = z.infer<typeof RendererDeclarationSchema>;

/**
 * App-defined UI Component declared in the manifest.
 *
 * A sandboxed bundle the Host loads where the standard vocabulary does not
 * reach. Referenced by name from a Screen's `components`.
 */
export const ComponentDeclarationSchema = z.object({
  /** Component name (unique within the app). */
  name: z.string().min(1),
  /** Human-readable description. */
  description: z.string().optional(),
  /** Component bundle URL (host loads in a sandboxed container). */
  bundleUrl: z.string().url(),
  /** Props schema (JSON Schema) the host can pass to the component. */
  propsSchema: z.record(z.string(), z.unknown()).optional(),
});
export type ComponentDeclaration = z.infer<typeof ComponentDeclarationSchema>;

/** One UI Component placed on a composed Screen. */
export const ScreenComponentSchema = z.object({
  /** A standard component type (`tree`, `table`, …) or an app-defined component name. */
  component: z.string().min(1),
  /** Tool the Host calls to obtain the component's data. */
  source: z
    .object({
      tool: z.string().min(1),
      args: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  /** Static props passed to the component. */
  props: z.record(z.string(), z.unknown()).optional(),
});
export type ScreenComponent = z.infer<typeof ScreenComponentSchema>;

/**
 * Screen declaration in the manifest.
 *
 * A navigable page of the App: either composed of UI Components the Host
 * fills by calling each component's `source.tool`, or a full-page bundle.
 * The screen flagged `launcher` is where the user lands when opening the App.
 */
export const ScreenDeclarationSchema = z
  .object({
    /** Screen name (unique within the app). */
    name: z.string().min(1),
    /** Human-readable title shown in navigation. */
    title: z.string(),
    /** Description of the screen's purpose. */
    description: z.string().optional(),
    /** Icon identifier (platform-specific). */
    icon: z.string().optional(),
    /** UI Components this screen is composed of. */
    components: z.array(ScreenComponentSchema).min(1).optional(),
    /** Full-page bundle URL or relative path (alternative to composition). */
    bundleUrl: z.string().min(1).optional(),
    /**
     * Props schema (JSON Schema) the host can pass to the screen's bundle.
     * Only meaningful when `bundleUrl` is set.
     */
    propsSchema: z.record(z.string(), z.unknown()).optional(),
    /**
     * Marks this screen as the entry point (launcher).
     * When true, the host may surface this screen in its launcher / new-tab
     * picker so the user can open it directly. Screens without `launcher` are
     * only reachable via in-app navigation from other screens.
     */
    launcher: z.boolean().default(false),
    /**
     * Optional visibility condition evaluated by the host before showing
     * the screen. Supports simple predicates prefixed with `!` for negation.
     * Examples: `'authenticated'`, `'!authenticated'`.
     * When omitted, the screen is always visible.
     */
    condition: z.string().optional(),
  })
  .refine((data) => (data.components !== undefined) !== (data.bundleUrl !== undefined), {
    message: 'A screen is either composed of components or a full-page bundleUrl, not both',
    path: ['components'],
  });
export type ScreenDeclaration = z.infer<typeof ScreenDeclarationSchema>;

// ----------------------------------------------------------------------------
// Installation
// ----------------------------------------------------------------------------

export const AppInstallationSchema = z.object({
  /** Whether only one installation of this app is allowed per host. */
  singleton: z.boolean().default(false),
  /** Whether the user must explicitly approve installation. */
  requiresUserConsent: z.boolean().default(false),
});
export type AppInstallation = z.infer<typeof AppInstallationSchema>;

// ----------------------------------------------------------------------------
// Full manifest schema
// ----------------------------------------------------------------------------

export const AppManifestSchema = z
  .object({
    /** JSON Schema reference for editor support. */
    $schema: z.string().optional(),

    /** Unique app identifier. */
    id: z.string().regex(AppIdRegex, {
      message:
        'ID must start with app. followed by lowercase segments (e.g., app.hello, app.acme.calendar)',
    }),

    /** Semantic version. */
    version: z.string().regex(/^\d+\.\d+\.\d+$/, {
      message: 'Version must be semantic (e.g., 1.0.0)',
    }),

    /** Display name. */
    name: z.string().min(1, 'Name is required').max(50, 'Name too long (max 50 chars)'),

    /** Human-readable description. */
    description: z
      .string()
      .min(10, 'Description too short (min 10 chars)')
      .max(500, 'Description too long (max 500 chars)'),

    /** Short one-liner for catalog cards and list views (max 120 chars). */
    tagline: z
      .string()
      .min(5, 'Tagline too short (min 5 chars)')
      .max(120, 'Tagline too long (max 120 chars)'),

    /** Author information. */
    author: AppAuthorSchema,

    /** SPDX license identifier. */
    license: z.string().optional(),

    // ------------------------------------------------------------------
    // Branding & catalog
    // ------------------------------------------------------------------

    /**
     * Branded logo with the app's real colors (as per the brand guidelines).
     * Path relative to the manifest. SVG recommended; PNG accepted at 1024×1024 minimum.
     */
    logo: z.string().min(1, 'logo is required'),

    /**
     * Mono-tint logo — single-color SVG that the host recolors freely
     * (sidebar, dark mode, compact views). Must be SVG.
     */
    logoMono: z
      .string()
      .min(1, 'logoMono is required')
      .refine((v) => v.toLowerCase().endsWith('.svg'), {
        message: 'logoMono must be an SVG file',
      }),

    /**
     * @deprecated Use `logo` instead. Kept for backward compatibility.
     * Icon path or URL.
     */
    icon: z.string().optional(),

    /** Theme color in hex (e.g. "#E44332"). Used for accents in the catalog and host UI. */
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'color must be a hex color (e.g. "#E44332")')
      .optional(),

    /**
     * Cover / header image (like a Facebook cover photo).
     * Displayed in catalog detail pages and app profiles.
     */
    image: z.string().optional(),

    /** Preview screenshots for the catalog detail page. */
    screenshots: z.array(z.string()).optional(),

    /** URL to the app's homepage or documentation. */
    homepage: z.string().url('Invalid homepage URL').optional(),

    /** URL to the app's terms of service. */
    terms: z.string().url('Invalid terms URL'),

    /** Category for grouping in catalogs. */
    category: z.string().min(1, 'Category is required'),

    /** Search keywords. */
    keywords: z.array(z.string()).optional(),

    /** Entry point that produces the app factory. */
    entrypoint: AppEntrypointSchema,

    /** Runtime configuration. */
    runtime: AppRuntimeSchema,

    /** Capabilities advertised by the app (protocol-level features). */
    capabilities: z
      .object({
        tools: z.boolean().default(true),
        events: z.boolean().default(false),
        health: z.boolean().default(true),
        streaming: z.boolean().default(false),
      })
      .default({
        tools: true,
        events: false,
        health: true,
        streaming: false,
      }),

    /** Platform access permissions requested by the app, approved at install time. */
    permissions: AppPermissionsSchema.optional(),

    /** App-to-app dependencies — interfaces this app requires, resolved by user binding. */
    requires: z.array(AppRequirementSchema).optional(),

    /** Renderers — presentations of tool results, bound to tools. */
    renderers: z.array(RendererDeclarationSchema).optional(),

    /** App-defined UI Components (sandboxed bundles). */
    components: z.array(ComponentDeclarationSchema).optional(),

    /** Screens — navigable pages composed of UI Components or a full-page bundle. */
    screens: z.array(ScreenDeclarationSchema).optional(),

    /** Conversation lifecycle hooks this app registers. */
    hooks: z.array(HookEntrySchema).optional(),

    /** Authentication configuration. */
    auth: z.union([z.literal(false), AppAuthSchema]).default(false),

    /** Installation behavior. */
    installation: AppInstallationSchema.default({
      singleton: false,
      requiresUserConsent: false,
    }),
  })
  .strict();

export type AppManifest = z.infer<typeof AppManifestSchema>;

// ----------------------------------------------------------------------------
// Validation helpers
// ----------------------------------------------------------------------------

export interface AppManifestValidationError {
  path: string;
  message: string;
  code: string;
}

export interface AppManifestValidationResult {
  valid: boolean;
  errors: AppManifestValidationError[];
  manifest?: AppManifest;
}

/**
 * Parse and validate an app manifest. Throws on validation failure.
 */
export function parseAppManifest(data: unknown): AppManifest {
  return AppManifestSchema.parse(data);
}

/**
 * Safely parse and validate an app manifest.
 */
export function safeParseAppManifest(
  data: unknown,
): ReturnType<typeof AppManifestSchema.safeParse> {
  return AppManifestSchema.safeParse(data);
}

/**
 * Validate an app manifest and return a detailed result object.
 */
export function validateAppManifest(data: unknown): AppManifestValidationResult {
  const result = safeParseAppManifest(data);
  if (result.success) {
    return { valid: true, errors: [], manifest: result.data };
  }

  return {
    valid: false,
    errors: result.error.issues.map((issue) => ({
      path: issue.path.map(String).join('.') || '(root)',
      message: issue.message,
      code: issue.code,
    })),
  };
}

/**
 * Type guard for app manifests.
 */
export function isAppManifest(data: unknown): data is AppManifest {
  return safeParseAppManifest(data).success;
}

/**
 * Type guard for screen declarations.
 */
export function isScreenDeclaration(data: unknown): data is ScreenDeclaration {
  return ScreenDeclarationSchema.safeParse(data).success;
}

/**
 * Type guard: true when the screen is marked as a launcher entry point.
 */
export function isLauncherScreen(data: unknown): boolean {
  const result = ScreenDeclarationSchema.safeParse(data);
  return result.success && result.data.launcher === true;
}
