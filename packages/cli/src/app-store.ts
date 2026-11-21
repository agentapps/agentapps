/**
 * @agentapps/cli — the workspace's app store, `.agentapps/apps/node_modules/`,
 * where `npm:` app packages are downloaded (`sync`, and `install` on demand,
 * DIST-REQ-3).
 *
 * Downloading does not run npm (DIST-REQ-6): the package's tarball is fetched
 * from the registry, checked against the registry's integrity hash and
 * unpacked. App packages are self-contained (DIST-REQ-5), so there is no
 * dependency tree to resolve. The registry is npm's, or `npm_config_registry`.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { stateDir } from './state.js';

const DEFAULT_REGISTRY = 'https://registry.npmjs.org';

/** Where `npm:` app packages are downloaded. @spec DIST-REQ-3 */
export function appStoreDir(configPath: string): string {
  return resolve(stateDir(configPath), 'apps');
}

/**
 * Download package specs (`name`, `name@version` or `name@tag`) into the app
 * store. `echo` receives one line per package downloaded.
 *
 * @spec DIST-REQ-3
 * @spec DIST-REQ-6
 */
export async function downloadAppPackages(
  configPath: string,
  specs: string[],
  echo?: NodeJS.WritableStream,
): Promise<{ code: number; stderr: string }> {
  const modules = join(appStoreDir(configPath), 'node_modules');
  for (const spec of specs) {
    try {
      const { name, version } = await downloadPackage(spec, modules);
      echo?.write(`Downloaded ${name}@${version}\n`);
    } catch (err) {
      return { code: 1, stderr: `ERR ${(err as Error).message}` };
    }
  }
  return { code: 0, stderr: '' };
}

function splitSpec(spec: string): { name: string; range: string } {
  const at = spec.lastIndexOf('@');
  // at > 0: a version or tag after the name; at === 0 is only the scope marker.
  return at > 0
    ? { name: spec.slice(0, at), range: spec.slice(at + 1) }
    : { name: spec, range: 'latest' };
}

async function downloadPackage(
  spec: string,
  modules: string,
): Promise<{ name: string; version: string }> {
  const { name, range } = splitSpec(spec);
  const registry = (process.env.npm_config_registry || DEFAULT_REGISTRY).replace(/\/+$/, '');

  const res = await fetch(`${registry}/${name.replace('/', '%2f')}`, {
    headers: { accept: 'application/json' },
  });
  if (res.status === 404) throw new Error(`${name} is not in the registry ${registry}`);
  if (!res.ok) throw new Error(`the registry answered ${res.status} for ${name}`);
  const packument = (await res.json()) as {
    'dist-tags'?: Record<string, string>;
    versions?: Record<string, { dist?: { tarball?: string; integrity?: string; shasum?: string } }>;
  };

  const version = packument['dist-tags']?.[range] ?? range;
  const dist = packument.versions?.[version]?.dist;
  if (!dist?.tarball) {
    throw new Error(`${name} has no version ${range} (use an exact version or a tag)`);
  }

  const tarball = await fetch(dist.tarball);
  if (!tarball.ok) throw new Error(`downloading ${name}@${version} failed: ${tarball.status}`);
  const bytes = Buffer.from(await tarball.arrayBuffer());
  verifyIntegrity(bytes, dist, `${name}@${version}`);

  // Unpack next to the target, then swap, so a failure never leaves half a package.
  const target = join(modules, ...name.split('/'));
  const staging = `${target}.download-${process.pid}`;
  rmSync(staging, { recursive: true, force: true });
  try {
    untar(gunzipSync(bytes), staging);
    rmSync(target, { recursive: true, force: true });
    mkdirSync(dirname(target), { recursive: true });
    renameSync(staging, target);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  return { name, version };
}

function verifyIntegrity(
  bytes: Buffer,
  dist: { integrity?: string; shasum?: string },
  what: string,
): void {
  if (dist.integrity) {
    const [algorithm, expected] = dist.integrity.split('-', 2) as [string, string];
    const actual = createHash(algorithm).update(bytes).digest('base64');
    if (actual !== expected) throw new Error(`${what} does not match its integrity hash`);
    return;
  }
  if (dist.shasum) {
    const actual = createHash('sha1').update(bytes).digest('hex');
    if (actual !== dist.shasum) throw new Error(`${what} does not match its shasum`);
    return;
  }
  throw new Error(`the registry gives no hash for ${what}`);
}

/**
 * Unpack an npm tarball (ustar, with pax headers) into `dest`, dropping the
 * leading `package/` folder and refusing paths that leave `dest`.
 */
function untar(data: Buffer, dest: string): void {
  const root = resolve(dest);
  mkdirSync(root, { recursive: true });
  let offset = 0;
  let paxPath: string | undefined;
  while (offset + 512 <= data.length) {
    const header = data.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const field = (start: number, length: number) =>
      header
        .subarray(start, start + length)
        .toString('utf8')
        .replace(/\0.*$/s, '');
    const size = Number.parseInt(field(124, 12).trim() || '0', 8);
    const type = field(156, 1);
    const prefix = field(345, 155);
    const body = data.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;

    if (type === 'x') {
      // A pax header: only the long path matters here.
      const match = /\d+ path=([^\n]*)\n/.exec(body.toString('utf8'));
      paxPath = match?.[1];
      continue;
    }
    if (type === 'g') continue;

    const fullName = paxPath ?? (prefix ? `${prefix}/${field(0, 100)}` : field(0, 100));
    paxPath = undefined;
    const relative = fullName.split('/').slice(1).join('/');
    if (!relative) continue;
    const out = resolve(root, normalize(relative));
    if (out !== root && !out.startsWith(root + sep)) {
      throw new Error(`the package tries to write outside its folder: ${fullName}`);
    }
    if (type === '5') {
      mkdirSync(out, { recursive: true });
    } else if (type === '0' || type === '') {
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, body);
    }
  }
}
