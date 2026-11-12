/**
 * @agentapps/create — the CLI behind every bin of the package.
 *
 * Commands:
 *   create-agent-app <app-id> [options]   — scaffold a new app
 *   create-agent-app check-app [dir]      — check an app (also: agentapps-check-app,
 *                                           and the older names validate / agentapps-validate)
 *   create-agent-app health [dir]         — run the app's health check once
 *   create-agent-app dev                  — run dev mode (embedded app station)
 *   create-agent-app pack                 — experimental bundle (also: agentapps-pack); not
 *                                           MCPB yet and not part of generated projects
 *
 * Usage as npm create:
 *   npm create @agentapps my-app [-- --template api]
 */

import { createInterface } from 'node:readline';
import { dev } from './dev.js';
import { health } from './health.js';
import { pack } from './pack.js';
import {
  type ScaffoldOptions,
  scaffoldApp,
  type TemplateName,
  validateProjectName,
} from './scaffold.js';
import { printValidation, validate } from './validate.js';

const TEMPLATE_NAMES: TemplateName[] = ['api', 'minimal', 'full', 'typescript'];

const HELP = `
@agentapps/create — scaffold, check and package an Agent App

Usage:
  npm create @agentapps <app-id> [-- options]
  create-agent-app <app-id> [options]

Commands:
  check-app [dir]  Check the app against the repo rules: manifest schema, all five
                   annotations on every tool, sensitive vs readOnlyHint, logos, README
                   sections and, in the agentapps monorepo, the agentapps.example.json
                   entry and lockfile. The app is loaded to list its real tools.
                   Exits non-zero on errors. --strict also fails on TODO text left in
                   agentapp.json or the README (a logo TODO in the Logos section that
                   lists where you looked still passes): run it before shipping.
                   --load-timeout <s> bounds loading the app (default 10). (Alias: validate.)
  health [dir]     Run the app's health check once against the real service. User
                   secrets are read from environment variables of the same name.
  dev              Run an embedded appStation with reload

Scaffold options:
  --template <name>    api (default) | minimal | full  (typescript = minimal)
  --name <text>        Display name (default: the id in title case)
  --id <app.id>        Manifest id when it is not app.<app-id>, such as
                       app.google.search-console (the directory stays <app-id>)
  --description <text>
  --base-url <url>     API base URL (api template)
  --auth <type>        none (default) | api-key | oauth2 (api template)
  --secrets <A,B>      User secret names for api-key auth, UPPER_SNAKE_CASE
  --system-secrets <A,B>
                       api-key auth: system secrets, shared by every installation and
                       set on the app id (the generated client checks them)
  --provider <name>    oauth2: provider id; google and microsoft fill in the URLs
  --scopes <a,b>       oauth2: least-privilege scopes (required)
  --authorize-url <url>, --token-url <url>
                       oauth2: the provider's endpoints (required for other providers)
  --pkce               oauth2: use PKCE
  --category <name>    Catalog category (default productivity, or samples)
  --health-path <path> Request used by the health check (api template, default /)
  --repo | --standalone
                       Force the mode. By default, inside the agentapps monorepo the app
                       goes to apps/<id> and is listed in agentapps.example.json; anywhere
                       else a self-contained project is created in ./<id>.
  --no-register        Repo mode: do not touch agentapps.example.json
  --agent <list>       Standalone: coding agents to install the create-agent-app skill
                       for: claude, codex, gemini, copilot, cursor, opencode or all
                       (default all; writes .agents/skills and/or .claude/skills)
  --no-skill           Standalone: do not install the skill (AGENTS.md is still written)
  --package-name <n>   Standalone: npm package name (default: the app id; use a scoped
                       name such as @you/<id> before publishing)
  --skip-install       Do not install dependencies (standalone)
  --skip-git           Do not run git init (standalone)
  --help, -h           Show this help

Examples:
  npm create @agentapps weather -- --base-url https://api.example.com
  create-agent-app crm --auth api-key --secrets CRM_API_KEY --base-url https://api.crm.example/v2
  create-agent-app google-ads --id app.google.ads --auth oauth2 --provider google \
    --scopes https://www.googleapis.com/auth/adwords --base-url https://googleads.googleapis.com
  create-agent-app check-app apps/crm
  CRM_API_KEY=... create-agent-app health apps/crm
`;

function parseArgs(argv: string[]): {
  positional: string[];
  flags: Record<string, string | boolean>;
} {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  const booleans = new Set([
    'repo',
    'standalone',
    'no-register',
    'skip-install',
    'skip-git',
    'strict',
    'pkce',
    'help',
  ]);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!booleans.has(key) && next !== undefined && !next.startsWith('-')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else if (arg === '-h') {
      flags.help = true;
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

const str = (v: string | boolean | undefined) => (typeof v === 'string' ? v : undefined);

async function runScaffold(args: string[], flags: Record<string, string | boolean>): Promise<void> {
  let projectName = args[0];
  if (!projectName && process.stdin.isTTY) {
    projectName = await prompt('App id (kebab-case): ');
  }
  const nameError = validateProjectName(projectName ?? '');
  if (nameError) {
    console.error(`❌ ${nameError}`);
    process.exitCode = 1;
    return;
  }

  const template = (str(flags.template) ?? 'api') as TemplateName;
  if (!TEMPLATE_NAMES.includes(template)) {
    console.error(`❌ Unknown template: ${template}. Choose: api, minimal, full`);
    process.exitCode = 1;
    return;
  }
  const auth = str(flags.auth);
  if (auth !== undefined && auth !== 'none' && auth !== 'api-key' && auth !== 'oauth2') {
    console.error('❌ --auth must be none, api-key or oauth2');
    process.exitCode = 1;
    return;
  }
  const list = (v: string | boolean | undefined) =>
    str(v)
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  const options: ScaffoldOptions = {
    projectName,
    template,
    appId: str(flags.id),
    name: str(flags.name),
    description: str(flags.description),
    baseUrl: str(flags['base-url']),
    auth: auth as ScaffoldOptions['auth'],
    secrets: list(flags.secrets),
    systemSecrets: list(flags['system-secrets']),
    provider: str(flags.provider),
    scopes: list(flags.scopes),
    authorizeUrl: str(flags['authorize-url']),
    tokenUrl: str(flags['token-url']),
    pkce: flags.pkce === true ? true : undefined,
    category: str(flags.category),
    packageName: str(flags['package-name']),
    healthPath: str(flags['health-path']),
    mode: flags.repo ? 'repo' : flags.standalone ? 'standalone' : undefined,
    register: !flags['no-register'],
    agents: flags['no-skill']
      ? []
      : (str(flags.agent)
          ?.split(',')
          .map((s) => s.trim())
          .filter(Boolean) ?? ['all']),
    skipInstall: flags['skip-install'] === true,
    skipGit: flags['skip-git'] === true,
  };

  try {
    const result = await scaffoldApp(options);
    console.log(`\n✅ Created ${result.appId} in ${result.destDir} (${result.mode} mode)\n`);
    console.log('Next steps:');
    if (result.mode === 'repo') {
      if (result.registered) console.log('  (listed in agentapps.example.json)');
      console.log('  pnpm install          # writes the lockfile importer for the new app');
      console.log(
        '                        # Node 26: pnpm install --ignore-scripts && pnpm rebuild esbuild',
      );
      console.log(`  pnpm vitest run apps/${projectName}`);
      console.log(`  node packages/create/dist/cli.js check-app apps/${projectName}`);
    } else {
      if (result.skillDirs.length > 0) {
        console.log(
          `  (AGENTS.md and the create-agent-app skill in ${result.skillDirs.join(', ')})`,
        );
      }
      console.log(`  cd ${projectName}`);
      if (options.skipInstall) console.log('  npm install');
      console.log('  npm test');
      console.log('  npm run check');
    }
    console.log('  Then replace the TODOs (description, tagline, example tool, README).\n');
    for (const note of result.notes) console.warn(`⚠️  ${note}`);
  } catch (err) {
    console.error(`❌ ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  }
}

/**
 * Runs one CLI invocation. The command is always the first argument: package managers run
 * bins through shims that hide the bin's name (pnpm, npm on Windows), so the alias bins have
 * their own entry files that pass their command explicitly (see bin/).
 */
export async function run(argv: string[]): Promise<void> {
  const { positional, flags } = parseArgs(argv);
  const command = positional.shift();

  if (flags.help) {
    console.log(HELP);
    return;
  }
  if (!command && argv.length === 0 && !process.stdin.isTTY) {
    // Nothing to do and nobody to ask: never let this look like a successful run.
    console.error(HELP);
    console.error('❌ No command given.');
    process.exitCode = 1;
    return;
  }

  switch (command) {
    case 'dev':
      await dev();
      break;

    case 'check-app':
    case 'validate': {
      // Failure until a verdict is printed: if the app ends the process early, it exits 1.
      process.exitCode = 1;
      const seconds = Number(str(flags['load-timeout']) ?? '');
      printValidation(
        await validate({
          cwd: positional[0],
          strict: flags.strict === true,
          loadTimeoutMs: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined,
        }),
      );
      break;
    }

    case 'health': {
      try {
        const report = await health({ cwd: positional[0] });
        console.log(JSON.stringify(report, null, 2));
        if (report.status !== 'ready') process.exitCode = 1;
      } catch (err) {
        console.error(`❌ ${err instanceof Error ? err.message : err}`);
        process.exitCode = 1;
      }
      break;
    }

    case 'pack':
      try {
        await pack();
      } catch (err) {
        console.error(`❌ ${err instanceof Error ? err.message : err}`);
        process.exitCode = 1;
      }
      break;

    default:
      await runScaffold(command ? [command, ...positional] : positional, flags);
  }

  // check-app and health load the app; do not let its timers or sockets keep the process alive.
  if (command === 'check-app' || command === 'validate' || command === 'health') {
    process.exit(process.exitCode ?? 0);
  }
}
