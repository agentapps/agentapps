/**
 * Unit tests for Google Drive helper modules (_mime.ts and _query.ts).
 *
 * These are pure functions with no external dependencies, so they are tested
 * via direct import without the InProcessRuntime harness.
 *
 * Migrated from mca.google.drive/test/mime.test.ts and query.test.ts.
 */

import { describe, expect, it } from 'vitest';
import { ALL_DRIVES, ALL_DRIVES_LIST } from '../src/lib/shared-drive.js';
import { extToMime, isTextualMimeType } from '../src/tools/_mime.js';
import { buildListQuery, escapeQueryValue } from '../src/tools/_query.js';

// ===========================================================================
// isTextualMimeType
// ===========================================================================

describe('isTextualMimeType', () => {
  it('accepts text/* types', () => {
    expect(isTextualMimeType('text/plain')).toBe(true);
    expect(isTextualMimeType('text/html')).toBe(true);
    expect(isTextualMimeType('text/csv')).toBe(true);
    expect(isTextualMimeType('text/markdown')).toBe(true);
  });

  it('accepts structured text types', () => {
    expect(isTextualMimeType('application/json')).toBe(true);
    expect(isTextualMimeType('application/xml')).toBe(true);
    expect(isTextualMimeType('application/javascript')).toBe(true);
    expect(isTextualMimeType('application/xhtml+xml')).toBe(true);
    expect(isTextualMimeType('application/ld+json')).toBe(true);
  });

  it('rejects PDF and Office binary types', () => {
    expect(isTextualMimeType('application/pdf')).toBe(false);
    expect(
      isTextualMimeType('application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    ).toBe(false);
    expect(isTextualMimeType('application/msword')).toBe(false);
  });

  it('rejects images, archives and octet-stream', () => {
    expect(isTextualMimeType('image/png')).toBe(false);
    expect(isTextualMimeType('application/zip')).toBe(false);
    expect(isTextualMimeType('application/octet-stream')).toBe(false);
  });

  it('rejects missing/empty mime types', () => {
    expect(isTextualMimeType(undefined)).toBe(false);
    expect(isTextualMimeType(null)).toBe(false);
    expect(isTextualMimeType('')).toBe(false);
  });
});

// ===========================================================================
// extToMime
// ===========================================================================

describe('extToMime derives the real Content-Type from the extension', () => {
  it('maps known extensions, case-insensitive', () => {
    expect(extToMime('report.html')).toBe('text/html');
    expect(extToMime('REPORT.HTML')).toBe('text/html');
    expect(extToMime('a.pdf')).toBe('application/pdf');
    expect(extToMime('photo.PNG')).toBe('image/png');
    expect(extToMime('data.csv')).toBe('text/csv');
    expect(extToMime('sheet.xlsx')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  });

  it('falls back to octet-stream for unknown / extensionless names', () => {
    expect(extToMime('rawdata')).toBe('application/octet-stream');
    expect(extToMime('trailing.')).toBe('application/octet-stream');
    expect(extToMime('weird.xyz')).toBe('application/octet-stream');
  });
});

// ===========================================================================
// escapeQueryValue
// ===========================================================================

describe('escapeQueryValue', () => {
  it("escapes single quotes as \\'", () => {
    expect(escapeQueryValue("O'Brien")).toBe("O\\'Brien");
  });

  it('escapes backslashes first, then quotes', () => {
    expect(escapeQueryValue("a\\b'c")).toBe("a\\\\b\\'c");
  });

  it('leaves quote-free values untouched', () => {
    expect(escapeQueryValue('budget report.pdf')).toBe('budget report.pdf');
  });

  it('round-trips losslessly over generated adversarial inputs', () => {
    const unescapeValue = (s: string): string => {
      let out = '';
      for (let i = 0; i < s.length; i++) {
        if (s[i] === '\\' && i + 1 < s.length) {
          out += s[i + 1];
          i++;
        } else {
          out += s[i];
        }
      }
      return out;
    };
    const frags = ['a', "'", '\\', "''", '\\\\', "\\'", ' ', 'x\ty'];
    const inputs: string[] = [];
    for (const a of frags) for (const b of frags) for (const c of frags) inputs.push(a + b + c);
    expect(inputs.length).toBeGreaterThan(500);
    for (const s of inputs) {
      expect(unescapeValue(escapeQueryValue(s))).toBe(s);
    }
  });
});

// ===========================================================================
// buildListQuery
// ===========================================================================

describe('buildListQuery (pure)', () => {
  it('defaults to non-trashed files', () => {
    expect(buildListQuery({})).toBe('trashed=false');
  });

  it('skips empty-string clauses (no dangling operators)', () => {
    expect(buildListQuery({ folderId: '', query: '', mimeType: '' })).toBe('trashed=false');
  });

  it('regression: query with single quotes is escaped, not broken', () => {
    expect(buildListQuery({ query: "not 'me' in owners" })).toBe(
      "trashed=false and name contains 'not \\'me\\' in owners'",
    );
  });

  it('escapes folderId and mimeType too', () => {
    expect(buildListQuery({ folderId: "fol'der", mimeType: "ty'pe" })).toBe(
      "trashed=false and 'fol\\'der' in parents and mimeType='ty\\'pe'",
    );
  });

  it('appends driveQuery raw (NOT escaped) and parenthesised', () => {
    expect(buildListQuery({ driveQuery: "not 'me' in owners" })).toBe(
      "trashed=false and (not 'me' in owners)",
    );
  });

  it('combines all clauses in order', () => {
    expect(
      buildListQuery({
        folderId: 'F',
        query: 'budget',
        mimeType: 'application/pdf',
        driveQuery: 'starred = true',
      }),
    ).toBe(
      "trashed=false and 'F' in parents and name contains 'budget' and mimeType='application/pdf' and (starred = true)",
    );
  });
});

// ===========================================================================
// Shared Drive constants
// ===========================================================================

describe('shared-drive constants', () => {
  it('ALL_DRIVES enables shared-drive support', () => {
    expect(ALL_DRIVES).toEqual({ supportsAllDrives: true });
  });

  it('ALL_DRIVES_LIST scopes listing across My Drive + all shared drives', () => {
    expect(ALL_DRIVES_LIST).toEqual({
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: 'allDrives',
    });
  });
});
