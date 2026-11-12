/**
 * Pack — generates an .mcpb bundle from an Agent App project.
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface PackOptions {
  cwd?: string;
  output?: string;
}

function readPackageJson(cwd: string): Record<string, unknown> | null {
  const path = join(cwd, 'package.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readAppTs(cwd: string): string | null {
  const path = join(cwd, 'src', 'app.ts');
  if (!existsSync(path)) return null;
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
}

function extractTools(appTs: string): Array<{ name: string; description: string }> {
  const tools: Array<{ name: string; description: string }> = [];
  const toolRegex = /\.tool\s*\(\s*['"]([^'"]+)['"]\s*,\s*\{/g;
  let match: RegExpExecArray | null;
  do {
    match = toolRegex.exec(appTs);
    if (match !== null) {
      const name = match[1];
      const descMatch = appTs.slice(match.index).match(/description\s*:\s*['"]([^'"]*)['"]/);
      tools.push({ name, description: descMatch?.[1] ?? '' });
    }
  } while (match !== null);
  return tools;
}

export async function pack(options: PackOptions = {}): Promise<string> {
  const cwd = options.cwd ?? process.cwd();
  const pkg = readPackageJson(cwd);
  if (!pkg) {
    throw new Error('Missing package.json');
  }

  const appTs = readAppTs(cwd);
  if (!appTs) {
    throw new Error('Missing src/app.ts');
  }

  const name = (pkg.name as string) ?? 'app';
  const version = (pkg.version as string) ?? '0.0.0';
  const description = (pkg.description as string) ?? '';
  const tools = extractTools(appTs);

  // Build dist if not present
  const distDir = join(cwd, 'dist');
  if (!existsSync(distDir)) {
    console.log('📦 Building project...');
    try {
      execSync('pnpm build', { cwd, stdio: 'inherit' });
    } catch {
      // Try tsc directly
      try {
        execSync('npx tsc', { cwd, stdio: 'inherit' });
      } catch {
        throw new Error('Build failed — run `pnpm build` manually to see errors');
      }
    }
  }

  // Create temp bundle dir
  const bundleDir = join(cwd, '.agentapps-bundle');
  if (existsSync(bundleDir)) {
    execSync(`rm -rf ${bundleDir}`);
  }
  mkdirSync(bundleDir, { recursive: true });

  // Write manifest
  const manifest = {
    id: name,
    version,
    description,
    tools: tools.map((t) => ({ name: t.name, description: t.description })),
    dependencies: Object.keys((pkg.dependencies as Record<string, unknown>) ?? {}),
    bundledAt: new Date().toISOString(),
  };
  writeFileSync(join(bundleDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // Copy dist
  if (existsSync(distDir)) {
    execSync(`cp -r ${distDir} ${join(bundleDir, 'dist')}`);
  }

  // Copy assets if present
  const assetsDir = join(cwd, 'assets');
  if (existsSync(assetsDir)) {
    execSync(`cp -r ${assetsDir} ${join(bundleDir, 'assets')}`);
  }

  // Create tar.gz
  const outputPath = join(cwd, options.output ?? `${name}-${version}.mcpb`);
  execSync(`tar -czf ${outputPath} -C ${bundleDir} .`);

  // Cleanup
  execSync(`rm -rf ${bundleDir}`);

  const size = readFileSync(outputPath).length;
  console.log(`\n✅ Bundle created: ${outputPath}`);
  console.log(`   Tools: ${tools.map((t) => t.name).join(', ') || 'none'}`);
  console.log(`   Size: ${(size / 1024).toFixed(1)} KB\n`);

  return outputPath;
}
