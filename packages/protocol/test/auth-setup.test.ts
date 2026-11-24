import { describe, expect, it } from 'vitest';
import {
  authSetupVariableNames,
  resolveAuthSetup,
  safeParseAppManifest,
  undefinedAuthSetupVariables,
} from '../src/app-manifest.js';

const base = {
  id: 'app.setup',
  version: '1.0.0',
  name: 'Setup',
  description: 'An app that declares setup instructions.',
  tagline: 'Setup instructions test app',
  author: { name: 'Alice', email: 'alice@example.com' },
  logo: 'assets/logo.svg',
  logoMono: 'assets/logo-mono.svg',
  terms: 'https://example.com/terms',
  category: 'samples',
  entrypoint: { type: 'module' as const, path: 'dist/app.js' },
  runtime: { transport: 'stdio' as const, command: 'node', args: ['dist/app.js'] },
};

const authByType = {
  'api-key': { type: 'api-key', systemSecrets: ['APIKEY'] },
  oauth2: {
    type: 'oauth2',
    provider: 'google',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: ['email'],
  },
  'github-app': {
    type: 'github-app',
    provider: 'github',
    appSlug: 'agentapps',
    setupUrl: 'https://github.com/apps/agentapps/installations/new',
  },
} as const;

function messages(result: ReturnType<typeof safeParseAppManifest>): string {
  return result.success ? '' : result.error.issues.map((issue) => issue.message).join('\n');
}

describe('auth.setup in the Manifest', () => {
  for (const [type, auth] of Object.entries(authByType)) {
    it(`[SETUP-AC-3] a setup text with {{redirectUri}} parses for auth type ${type}`, () => {
      const result = safeParseAppManifest({
        ...base,
        auth: { ...auth, setup: 'Register {{redirectUri}}' },
      });
      expect(messages(result)).toBe('');
      expect(result.success).toBe(true);
    });

    it(`[SETUP-AC-3] an undefined variable fails validation naming it, for auth type ${type}`, () => {
      const result = safeParseAppManifest({
        ...base,
        auth: { ...auth, setup: 'Register {{callbackUrl}}' },
      });
      expect(result.success).toBe(false);
      expect(messages(result)).toContain('{{callbackUrl}}');
    });
  }

  it('[SETUP-AC-3] a setup text on an app with no auth fails validation', () => {
    const result = safeParseAppManifest({
      ...base,
      auth: { type: 'none', setup: 'Register {{redirectUri}}' },
    });
    expect(result.success).toBe(false);
  });

  it('a Manifest with no auth.setup still parses', () => {
    expect(safeParseAppManifest({ ...base, auth: authByType.oauth2 }).success).toBe(true);
    expect(safeParseAppManifest({ ...base, auth: { type: 'none' } }).success).toBe(true);
  });

  it('a variable is its exact name: spaces inside the braces make it another one', () => {
    expect(undefinedAuthSetupVariables('Register {{ redirectUri }}')).toEqual([' redirectUri ']);
  });

  it('lists each variable once, in order of first use', () => {
    expect(authSetupVariableNames('{{redirectUri}} then {{other}} then {{redirectUri}}')).toEqual([
      'redirectUri',
      'other',
    ]);
  });

  it('replaces every use of a variable and leaves the rest of the text as written', () => {
    expect(
      resolveAuthSetup('1. Add {{redirectUri}}\n2. Again: {{redirectUri}} **bold**', {
        redirectUri: 'https://station.example.com/auth/callback',
      }),
    ).toBe(
      '1. Add https://station.example.com/auth/callback\n2. Again: https://station.example.com/auth/callback **bold**',
    );
  });
});
