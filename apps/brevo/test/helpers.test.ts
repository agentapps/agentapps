/**
 * Unit tests for Brevo helper functions (_helpers.ts).
 *
 * These are pure exported functions — validators, builders, shapers, coercers.
 * Migrated from the old MCA test files:
 *   validate.test.ts, contacts-crud.test.ts, contacts-import.test.ts,
 *   send-email.test.ts, campaigns.test.ts, reports.test.ts, lists-templates.test.ts
 */

import { describe, expect, it } from 'vitest';
import {
  buildAggregatedReportQuery,
  buildCampaignBody,
  buildCreateContactBody,
  buildCreateListBody,
  buildCreateTemplateBody,
  buildEmailEventQuery,
  buildImportContactsBody,
  buildMembershipBody,
  buildSendEmailBody,
  buildSendTestBody,
  buildUpdateContactBody,
  clampInt,
  coerceInt,
  // constants
  EMAIL_EVENT_TYPES,
  // Primitive guards & coercion
  isValidEmail,
  shapeAggregatedReport,
  // list-attributes / list-segments shaping
  shapeAttribute,
  shapeCampaign,
  // response shapers
  shapeContact,
  shapeEmailEvent,
  shapeFolder,
  shapeList,
  shapeMembershipResult,
  shapeSegment,
  shapeTemplate,
  validateAggregatedReportArgs,
  // contact CRUD
  validateContactIdentifier,
  // campaigns
  validateCreateCampaignArgs,
  // create-contact
  validateCreateContactArgs,
  // lists, folders, templates
  validateCreateListArgs,
  validateCreateTemplateArgs,
  // reports
  validateEmailEventReportArgs,
  validateEnum,
  // import-contacts
  validateImportContactsArgs,
  // membership (add/remove contact to list)
  validateMembershipArgs,
  // send-transactional-email
  validateSendEmailArgs,
  validateSendTestArgs,
  validateUpdateContactArgs,
} from '../src/tools/_helpers.js';

// ============================================================================
// Primitive guards & coercion (from validate.test.ts)
// ============================================================================

const validSend = {
  sender: { email: 'ana@empresa.com', name: 'Ana' },
  to: [{ email: 'cliente@dominio.com' }],
  subject: 'Hola',
  textContent: 'Cuerpo',
};

describe('isValidEmail', () => {
  it('accepts well-formed addresses', () => {
    expect(isValidEmail('a@b.com')).toBe(true);
    expect(isValidEmail('  a@b.com  ')).toBe(true);
  });
  it('rejects empty, whitespace and malformed', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('   ')).toBe(false);
    expect(isValidEmail('notanemail')).toBe(false);
    expect(isValidEmail('foo@bar')).toBe(false);
    expect(isValidEmail('a b@c.com')).toBe(false);
    expect(isValidEmail(123)).toBe(false);
    expect(isValidEmail(null)).toBe(false);
  });
});

describe('clampInt', () => {
  it('returns fallback for missing / non-numeric', () => {
    expect(clampInt(undefined, 1, 100, 50)).toBe(50);
    expect(clampInt(null, 1, 100, 50)).toBe(50);
    expect(clampInt('abc', 1, 100, 50)).toBe(50);
    expect(clampInt('', 1, 100, 50)).toBe(50);
  });
  it('returns fallback for NaN / Infinity (typeof number but not finite)', () => {
    expect(clampInt(Number.NaN, 1, 100, 50)).toBe(50);
    expect(clampInt(Number.POSITIVE_INFINITY, 1, 100, 50)).toBe(50);
    expect(clampInt(Number.NEGATIVE_INFINITY, 1, 100, 50)).toBe(50);
  });
  it('clamps to [min, max] and floors floats', () => {
    expect(clampInt(0, 1, 100, 50)).toBe(1);
    expect(clampInt(9999, 1, 100, 50)).toBe(100);
    expect(clampInt(12.9, 1, 100, 50)).toBe(12);
    expect(clampInt('30', 1, 100, 50)).toBe(30);
  });
});

describe('coerceInt', () => {
  it('accepts real integers', () => {
    expect(coerceInt(0)).toBe(0);
    expect(coerceInt(42)).toBe(42);
    expect(coerceInt(-3)).toBe(-3);
  });
  it('accepts integer-valued numeric strings', () => {
    expect(coerceInt('7')).toBe(7);
    expect(coerceInt('  12  ')).toBe(12);
  });
  it('rejects floats, non-numeric strings, and non-numbers', () => {
    expect(coerceInt(2.5)).toBeNull();
    expect(coerceInt('2.5')).toBeNull();
    expect(coerceInt('abc')).toBeNull();
    expect(coerceInt('')).toBeNull();
    expect(coerceInt(null)).toBeNull();
    expect(coerceInt(undefined)).toBeNull();
    expect(coerceInt(Number.NaN)).toBeNull();
    expect(coerceInt({})).toBeNull();
  });
});

describe('validateEnum', () => {
  const allowed = ['classic', 'trigger'] as const;
  it('returns undefined for missing / empty', () => {
    expect(validateEnum(undefined, allowed, 'type')).toBeUndefined();
    expect(validateEnum('', allowed, 'type')).toBeUndefined();
    expect(validateEnum(null, allowed, 'type')).toBeUndefined();
  });
  it('returns the value when allowed', () => {
    expect(validateEnum('classic', allowed, 'type')).toBe('classic');
  });
  it('throws listing allowed values when not allowed', () => {
    expect(() => validateEnum('bogus', allowed, 'type')).toThrow(/classic, trigger/);
  });
});

// ============================================================================
// send-transactional-email (from validate.test.ts + send-email.test.ts)
// ============================================================================

describe('validateSendEmailArgs', () => {
  it('passes for valid args', () => {
    expect(() => validateSendEmailArgs(validSend)).not.toThrow();
  });

  it('accepts htmlContent alone (no textContent)', () => {
    expect(() =>
      validateSendEmailArgs({ ...validSend, textContent: undefined, htmlContent: '<p>Hi</p>' }),
    ).not.toThrow();
  });

  it('rejects missing / empty sender.email', () => {
    expect(() => validateSendEmailArgs({ ...validSend, sender: {} })).toThrow(/sender\.email/);
    expect(() => validateSendEmailArgs({ ...validSend, sender: { email: '  ' } })).toThrow(
      /sender\.email/,
    );
  });

  it('rejects malformed sender.email', () => {
    expect(() => validateSendEmailArgs({ ...validSend, sender: { email: 'nope' } })).toThrow(
      /not a valid email/,
    );
  });

  it('rejects empty to[]', () => {
    expect(() => validateSendEmailArgs({ ...validSend, to: [] })).toThrow(/to must be a non-empty/);
    expect(() => validateSendEmailArgs({ ...validSend, to: 'x' })).toThrow(
      /to must be a non-empty/,
    );
  });

  it('reports the offending recipient index', () => {
    expect(() =>
      validateSendEmailArgs({
        ...validSend,
        to: [{ email: 'ok@x.com' }, { email: 'broken' }],
      }),
    ).toThrow(/to\[1\]/);
  });

  it('rejects missing subject', () => {
    expect(() => validateSendEmailArgs({ ...validSend, subject: '   ' })).toThrow(/subject/);
  });

  it('rejects when neither htmlContent nor textContent is present', () => {
    expect(() =>
      validateSendEmailArgs({ ...validSend, textContent: undefined, htmlContent: undefined }),
    ).toThrow(/At least one of htmlContent or textContent/);
  });

  it('validates optional cc / bcc / replyTo emails', () => {
    expect(() => validateSendEmailArgs({ ...validSend, cc: [{ email: 'bad' }] })).toThrow(
      /cc\[0\]/,
    );
    expect(() => validateSendEmailArgs({ ...validSend, bcc: 'x' })).toThrow(/bcc must be an array/);
    expect(() => validateSendEmailArgs({ ...validSend, replyTo: { email: 'bad' } })).toThrow(
      /replyTo\.email/,
    );
  });
});

describe('buildSendEmailBody', () => {
  it('builds a minimal body with no undefined keys', () => {
    const body = buildSendEmailBody({
      sender: { email: 'ana@empresa.com' },
      to: [{ email: 'cliente@dominio.com' }],
      subject: 'Hola',
      textContent: 'Cuerpo',
    });
    expect(body).toEqual({
      sender: { email: 'ana@empresa.com' },
      to: [{ email: 'cliente@dominio.com' }],
      subject: 'Hola',
      textContent: 'Cuerpo',
    });
    expect('htmlContent' in body).toBe(false);
    expect('cc' in body).toBe(false);
  });

  it('builds the full body verbatim and keeps recipient names', () => {
    const body = buildSendEmailBody({
      sender: { email: 'ana@empresa.com', name: 'Ana' },
      to: [{ email: 'a@x.com', name: 'A' }, { email: 'b@x.com' }],
      subject: 'Promo',
      htmlContent: '<h1>Hi</h1>',
      textContent: 'Hi',
      cc: [{ email: 'cc@x.com', name: 'CC' }],
      bcc: [{ email: 'bcc@x.com' }],
      replyTo: { email: 'reply@x.com', name: 'Soporte' },
      params: { FNAME: 'Ana', CODE: 10 },
      tags: ['promo', 'q2'],
    });
    expect(body).toEqual({
      sender: { email: 'ana@empresa.com', name: 'Ana' },
      to: [{ email: 'a@x.com', name: 'A' }, { email: 'b@x.com' }],
      subject: 'Promo',
      htmlContent: '<h1>Hi</h1>',
      textContent: 'Hi',
      cc: [{ email: 'cc@x.com', name: 'CC' }],
      bcc: [{ email: 'bcc@x.com' }],
      replyTo: { email: 'reply@x.com', name: 'Soporte' },
      params: { FNAME: 'Ana', CODE: 10 },
      tags: ['promo', 'q2'],
    });
  });

  it('drops empty names and empty-string tags', () => {
    const body = buildSendEmailBody({
      sender: { email: 'ana@empresa.com', name: '   ' },
      to: [{ email: 'a@x.com', name: '' }],
      subject: 'S',
      textContent: 'T',
      tags: ['keep', '', '  '],
    });
    expect(body.sender).toEqual({ email: 'ana@empresa.com' });
    expect(body.to).toEqual([{ email: 'a@x.com' }]);
    expect(body.tags).toEqual(['keep']);
  });

  it('omits empty cc / bcc / tags arrays', () => {
    const body = buildSendEmailBody({
      sender: { email: 'ana@empresa.com' },
      to: [{ email: 'a@x.com' }],
      subject: 'S',
      htmlContent: '<p>x</p>',
      cc: [],
      bcc: [],
      tags: [],
    });
    expect('cc' in body).toBe(false);
    expect('bcc' in body).toBe(false);
    expect('tags' in body).toBe(false);
  });

  it('omits the tags key when every tag is blank', () => {
    const body = buildSendEmailBody({
      sender: { email: 'ana@empresa.com' },
      to: [{ email: 'a@x.com' }],
      subject: 'S',
      textContent: 'T',
      tags: ['', '  '],
    });
    expect('tags' in body).toBe(false);
  });
});

// ============================================================================
// create-contact (from validate.test.ts + send-email.test.ts)
// ============================================================================

describe('validateCreateContactArgs', () => {
  it('passes for a valid email', () => {
    expect(() => validateCreateContactArgs({ email: 'x@y.com' })).not.toThrow();
  });
  it('rejects missing / invalid email', () => {
    expect(() => validateCreateContactArgs({})).toThrow(/email is required/);
    expect(() => validateCreateContactArgs({ email: 'nope' })).toThrow(/not a valid email/);
  });
  it('rejects non-integer listIds', () => {
    expect(() => validateCreateContactArgs({ email: 'x@y.com', listIds: [1, 'a'] })).toThrow(
      /listIds/,
    );
    expect(() => validateCreateContactArgs({ email: 'x@y.com', listIds: 3 })).toThrow(/listIds/);
  });
  it('rejects non-object attributes', () => {
    expect(() => validateCreateContactArgs({ email: 'x@y.com', attributes: [1] })).toThrow(
      /attributes/,
    );
  });
});

describe('buildCreateContactBody', () => {
  it('builds a minimal body from email only', () => {
    expect(buildCreateContactBody({ email: 'x@y.com' })).toEqual({ email: 'x@y.com' });
  });

  it('builds the full body and keeps updateEnabled:false', () => {
    const body = buildCreateContactBody({
      email: 'x@y.com',
      attributes: { FIRSTNAME: 'X', LASTNAME: 'Y' },
      listIds: [3, 7],
      updateEnabled: false,
    });
    expect(body).toEqual({
      email: 'x@y.com',
      attributes: { FIRSTNAME: 'X', LASTNAME: 'Y' },
      listIds: [3, 7],
      updateEnabled: false,
    });
  });

  it('omits empty listIds and absent optionals', () => {
    const body = buildCreateContactBody({ email: 'x@y.com', listIds: [] });
    expect(body).toEqual({ email: 'x@y.com' });
    expect('listIds' in body).toBe(false);
    expect('updateEnabled' in body).toBe(false);
  });
});

// ============================================================================
// contact identifier (from contacts-crud.test.ts)
// ============================================================================

describe('validateContactIdentifier', () => {
  it('trims and returns a non-empty identifier', () => {
    expect(validateContactIdentifier('x@y.com')).toBe('x@y.com');
    expect(validateContactIdentifier('  123  ')).toBe('123');
  });
  it('rejects empty / non-string', () => {
    expect(() => validateContactIdentifier('')).toThrow(/identifier is required/);
    expect(() => validateContactIdentifier('   ')).toThrow(/identifier is required/);
    expect(() => validateContactIdentifier(123)).toThrow(/identifier is required/);
  });
});

// ============================================================================
// update-contact (from contacts-crud.test.ts)
// ============================================================================

describe('validateUpdateContactArgs', () => {
  it('passes with a mutable field present', () => {
    expect(() =>
      validateUpdateContactArgs({ identifier: 'x@y.com', attributes: { FIRSTNAME: 'X' } }),
    ).not.toThrow();
    expect(() => validateUpdateContactArgs({ identifier: 'x@y.com', listIds: [1] })).not.toThrow();
    expect(() =>
      validateUpdateContactArgs({ identifier: 'x@y.com', emailBlacklisted: true }),
    ).not.toThrow();
  });
  it('rejects a missing identifier', () => {
    expect(() => validateUpdateContactArgs({ attributes: { A: 1 } })).toThrow(
      /identifier is required/,
    );
  });
  it('rejects an update with no mutable field', () => {
    expect(() => validateUpdateContactArgs({ identifier: 'x@y.com' })).toThrow(
      /at least one field to update/,
    );
    expect(() => validateUpdateContactArgs({ identifier: 'x@y.com', listIds: [] })).toThrow(
      /at least one field to update/,
    );
  });
  it('rejects non-object attributes and non-integer list ids', () => {
    expect(() => validateUpdateContactArgs({ identifier: 'x@y.com', attributes: [1] })).toThrow(
      /attributes/,
    );
    expect(() =>
      validateUpdateContactArgs({ identifier: 'x@y.com', unlinkListIds: [1, 'z'] }),
    ).toThrow(/unlinkListIds/);
  });
});

describe('buildUpdateContactBody', () => {
  it('builds the exact body and omits absent fields', () => {
    const body = buildUpdateContactBody({
      identifier: 'x@y.com',
      attributes: { FIRSTNAME: 'Ana' },
      emailBlacklisted: false,
      listIds: [1, 2],
      unlinkListIds: [9],
    });
    expect(body).toEqual({
      attributes: { FIRSTNAME: 'Ana' },
      emailBlacklisted: false,
      listIds: [1, 2],
      unlinkListIds: [9],
    });
    expect('identifier' in body).toBe(false);
  });
  it('omits empty list arrays', () => {
    const body = buildUpdateContactBody({
      identifier: 'x@y.com',
      attributes: { A: 1 },
      listIds: [],
    });
    expect(body).toEqual({ attributes: { A: 1 } });
    expect('listIds' in body).toBe(false);
  });
});

// ============================================================================
// membership (from contacts-crud.test.ts)
// ============================================================================

describe('validateMembershipArgs', () => {
  it('passes with emails or ids', () => {
    expect(() => validateMembershipArgs({ listId: 3, emails: ['a@b.com'] })).not.toThrow();
    expect(() => validateMembershipArgs({ listId: 3, ids: [1, 2] })).not.toThrow();
  });
  it('rejects a missing listId', () => {
    expect(() => validateMembershipArgs({ emails: ['a@b.com'] })).toThrow(/listId is required/);
  });
  it('rejects when neither emails nor ids are provided', () => {
    expect(() => validateMembershipArgs({ listId: 3 })).toThrow(
      /at least one of emails\[\] or ids\[\]/,
    );
    expect(() => validateMembershipArgs({ listId: 3, emails: [], ids: [] })).toThrow(
      /at least one of emails\[\] or ids\[\]/,
    );
  });
  it('reports the offending email index and rejects non-integer ids', () => {
    expect(() => validateMembershipArgs({ listId: 3, emails: ['ok@x.com', 'bad'] })).toThrow(
      /emails\[1\]/,
    );
    expect(() => validateMembershipArgs({ listId: 3, ids: [1, 'x'] })).toThrow(/ids/);
  });
});

describe('buildMembershipBody', () => {
  it('trims emails and maps ids, omitting empty', () => {
    expect(buildMembershipBody({ listId: 3, emails: ['  a@b.com  '], ids: [1] })).toEqual({
      emails: ['a@b.com'],
      ids: [1],
    });
    expect(buildMembershipBody({ listId: 3, ids: [5] })).toEqual({ ids: [5] });
  });
});

describe('shapeMembershipResult', () => {
  it('flattens contacts.success/failure', () => {
    expect(
      shapeMembershipResult({ contacts: { success: ['a@b.com'], failure: ['c@d.com'] } }),
    ).toEqual({ success: ['a@b.com'], failure: ['c@d.com'] });
  });
  it('defaults to empty arrays when contacts is missing', () => {
    expect(shapeMembershipResult({})).toEqual({ success: [], failure: [] });
    expect(shapeMembershipResult(null)).toEqual({ success: [], failure: [] });
  });
});

// ============================================================================
// import-contacts (from contacts-import.test.ts)
// ============================================================================

describe('validateImportContactsArgs', () => {
  it('passes with jsonBody + listIds', () => {
    expect(() =>
      validateImportContactsArgs({ jsonBody: [{ email: 'a@b.com' }], listIds: [1] }),
    ).not.toThrow();
  });

  it('passes with fileUrl + listIds', () => {
    expect(() =>
      validateImportContactsArgs({ fileUrl: 'https://x.com/c.csv', listIds: [1, 2] }),
    ).not.toThrow();
  });

  it('rejects providing BOTH jsonBody and fileUrl', () => {
    expect(() =>
      validateImportContactsArgs({
        jsonBody: [{ email: 'a@b.com' }],
        fileUrl: 'https://x.com/c.csv',
        listIds: [1],
      }),
    ).toThrow(/exactly one of jsonBody or fileUrl/);
  });

  it('rejects providing NEITHER jsonBody nor fileUrl', () => {
    expect(() => validateImportContactsArgs({ listIds: [1] })).toThrow(
      /via jsonBody\[\] or fileUrl/,
    );
    expect(() => validateImportContactsArgs({ jsonBody: [], listIds: [1] })).toThrow(
      /via jsonBody\[\] or fileUrl/,
    );
  });

  it('rejects a missing / empty / non-integer listIds', () => {
    expect(() => validateImportContactsArgs({ jsonBody: [{ email: 'a@b.com' }] })).toThrow(
      /listIds is required/,
    );
    expect(() =>
      validateImportContactsArgs({ jsonBody: [{ email: 'a@b.com' }], listIds: [] }),
    ).toThrow(/listIds is required/);
    expect(() =>
      validateImportContactsArgs({ jsonBody: [{ email: 'a@b.com' }], listIds: [1, 'x'] }),
    ).toThrow(/listIds must contain only integers/);
  });

  it('reports the offending jsonBody index for a bad email', () => {
    expect(() =>
      validateImportContactsArgs({
        jsonBody: [{ email: 'ok@x.com' }, { email: 'nope' }],
        listIds: [1],
      }),
    ).toThrow(/jsonBody\[1\]\.email/);
  });

  it('rejects non-object attributes inside a jsonBody entry (with index)', () => {
    expect(() =>
      validateImportContactsArgs({
        jsonBody: [{ email: 'a@b.com', attributes: ['nope'] }],
        listIds: [1],
      }),
    ).toThrow(/jsonBody\[0\]\.attributes/);
  });

  it('rejects a non-http(s) fileUrl (SSRF / bad protocol)', () => {
    expect(() =>
      validateImportContactsArgs({ fileUrl: 'javascript:alert(1)', listIds: [1] }),
    ).toThrow(/fileUrl must be a valid http\(s\) URL/);
  });
});

describe('buildImportContactsBody', () => {
  it('builds the exact inline body, mapping attributes + updateExistingContacts', () => {
    const body = buildImportContactsBody({
      jsonBody: [{ email: '  a@b.com  ', attributes: { FIRSTNAME: 'Ana' } }],
      listIds: [1, 2],
      updateExistingContacts: true,
    });
    expect(body).toEqual({
      listIds: [1, 2],
      jsonBody: [{ email: 'a@b.com', attributes: { FIRSTNAME: 'Ana' } }],
      updateExistingContacts: true,
    });
  });

  it('omits attributes when absent and omits updateExistingContacts when not a boolean', () => {
    const body = buildImportContactsBody({
      jsonBody: [{ email: 'a@b.com' }],
      listIds: [3],
    });
    expect(body).toEqual({ listIds: [3], jsonBody: [{ email: 'a@b.com' }] });
    expect('updateExistingContacts' in body).toBe(false);
    expect('fileUrl' in body).toBe(false);
  });

  it('builds the exact file body (trimmed fileUrl, no jsonBody)', () => {
    const body = buildImportContactsBody({
      fileUrl: '  https://x.com/c.csv  ',
      listIds: [7],
      updateExistingContacts: false,
    });
    expect(body).toEqual({
      listIds: [7],
      fileUrl: 'https://x.com/c.csv',
      updateExistingContacts: false,
    });
    expect('jsonBody' in body).toBe(false);
  });
});

// ============================================================================
// list-attributes shaping (from contacts-import.test.ts)
// ============================================================================

describe('shapeAttribute', () => {
  it('maps name / category / type', () => {
    expect(shapeAttribute({ name: 'FIRSTNAME', category: 'normal', type: 'text' })).toEqual({
      name: 'FIRSTNAME',
      category: 'normal',
      type: 'text',
    });
  });

  it('keeps a missing type null (category-type attributes carry no type)', () => {
    expect(shapeAttribute({ name: 'PLAN', category: 'category' })).toEqual({
      name: 'PLAN',
      category: 'category',
      type: null,
    });
  });

  it('drops noise fields and defaults garbage to nulls', () => {
    expect(
      shapeAttribute({
        name: 'X',
        category: 'calculated',
        type: 'text',
        calculatedValue: 'x',
        enumeration: [],
      }),
    ).toEqual({ name: 'X', category: 'calculated', type: 'text' });
    expect(shapeAttribute(null)).toEqual({ name: null, category: null, type: null });
    expect(shapeAttribute({ name: 42 })).toEqual({ name: null, category: null, type: null });
  });
});

// ============================================================================
// list-segments shaping (from contacts-import.test.ts)
// ============================================================================

describe('shapeSegment', () => {
  it('maps id / segmentName / categoryName / updatedAt', () => {
    expect(
      shapeSegment({
        id: 5,
        segmentName: 'Active buyers',
        categoryName: 'Sales',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toEqual({
      id: 5,
      segmentName: 'Active buyers',
      categoryName: 'Sales',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('keeps a missing updatedAt null and defaults garbage to nulls', () => {
    expect(shapeSegment({ id: 1, segmentName: 'S', categoryName: 'C' })).toEqual({
      id: 1,
      segmentName: 'S',
      categoryName: 'C',
      updatedAt: null,
    });
    expect(shapeSegment(null)).toEqual({
      id: null,
      segmentName: null,
      categoryName: null,
      updatedAt: null,
    });
  });
});

// ============================================================================
// create-list (from lists-templates.test.ts)
// ============================================================================

describe('validateCreateListArgs', () => {
  it('passes with name + integer folderId', () => {
    expect(() => validateCreateListArgs({ name: 'VIP', folderId: 2 })).not.toThrow();
  });
  it('passes with a numeric-string folderId (LLM stringified id)', () => {
    expect(() => validateCreateListArgs({ name: 'VIP', folderId: '2' })).not.toThrow();
  });
  it('rejects missing / blank name', () => {
    expect(() => validateCreateListArgs({ folderId: 2 })).toThrow(/name is required/);
    expect(() => validateCreateListArgs({ name: '   ', folderId: 2 })).toThrow(/name is required/);
  });
  it('rejects missing folderId', () => {
    expect(() => validateCreateListArgs({ name: 'VIP' })).toThrow(/folderId is required/);
  });
  it('rejects a non-integer folderId', () => {
    expect(() => validateCreateListArgs({ name: 'VIP', folderId: 2.5 })).toThrow(/folderId/);
    expect(() => validateCreateListArgs({ name: 'VIP', folderId: 'abc' })).toThrow(/folderId/);
  });
});

describe('buildCreateListBody', () => {
  it('builds the exact body and trims the name', () => {
    expect(buildCreateListBody({ name: '  VIP Customers  ', folderId: 2 })).toEqual({
      name: 'VIP Customers',
      folderId: 2,
    });
  });
  it('coerces a numeric-string folderId to a number', () => {
    const body = buildCreateListBody({ name: 'X', folderId: '9' });
    expect(body).toEqual({ name: 'X', folderId: 9 });
    expect(typeof body.folderId).toBe('number');
  });
});

// ============================================================================
// create-email-template (from lists-templates.test.ts)
// ============================================================================

const validTemplate = {
  templateName: 'Welcome',
  subject: 'Welcome {{FNAME}}',
  sender: { email: 'noreply@empresa.com' },
  htmlContent: '<p>Hola {{FNAME}}</p>',
};

describe('validateCreateTemplateArgs', () => {
  it('passes for a valid email-sender template', () => {
    expect(() => validateCreateTemplateArgs(validTemplate)).not.toThrow();
  });
  it('passes with a sender id instead of email', () => {
    expect(() => validateCreateTemplateArgs({ ...validTemplate, sender: { id: 5 } })).not.toThrow();
  });
  it('passes with htmlUrl instead of htmlContent', () => {
    expect(() =>
      validateCreateTemplateArgs({
        ...validTemplate,
        htmlContent: undefined,
        htmlUrl: 'https://cdn.example.com/t.html',
      }),
    ).not.toThrow();
  });
  it('rejects missing templateName / subject', () => {
    expect(() => validateCreateTemplateArgs({ ...validTemplate, templateName: '  ' })).toThrow(
      /templateName is required/,
    );
    expect(() => validateCreateTemplateArgs({ ...validTemplate, subject: '' })).toThrow(
      /subject is required/,
    );
  });
  it('rejects a sender with neither email nor id', () => {
    expect(() => validateCreateTemplateArgs({ ...validTemplate, sender: {} })).toThrow(
      /sender requires either/,
    );
    expect(() => validateCreateTemplateArgs({ ...validTemplate, sender: 'x' })).toThrow(/sender/);
  });
  it('rejects a sender with BOTH email and id (mutex)', () => {
    expect(() =>
      validateCreateTemplateArgs({ ...validTemplate, sender: { email: 'a@b.com', id: 5 } }),
    ).toThrow(/not both/);
  });
  it('rejects a malformed sender.email', () => {
    expect(() =>
      validateCreateTemplateArgs({ ...validTemplate, sender: { email: 'nope' } }),
    ).toThrow(/not a valid email/);
  });
  it('rejects when neither htmlContent nor htmlUrl is present', () => {
    expect(() =>
      validateCreateTemplateArgs({ ...validTemplate, htmlContent: undefined, htmlUrl: undefined }),
    ).toThrow(/At least one of htmlContent or htmlUrl/);
  });
  it('rejects htmlContent shorter than 10 characters', () => {
    expect(() =>
      validateCreateTemplateArgs({ ...validTemplate, htmlContent: '<p>hi</p>' }),
    ).toThrow(/at least 10 characters/);
  });
  it('rejects a non-http htmlUrl (protocol whitelist)', () => {
    expect(() =>
      validateCreateTemplateArgs({
        ...validTemplate,
        htmlContent: undefined,
        htmlUrl: 'javascript:alert(1)',
      }),
    ).toThrow(/htmlUrl must be a valid http/);
  });
  it('rejects a non-http attachmentUrl and a malformed replyTo', () => {
    expect(() =>
      validateCreateTemplateArgs({ ...validTemplate, attachmentUrl: 'ftp://x/y.pdf' }),
    ).toThrow(/attachmentUrl/);
    expect(() => validateCreateTemplateArgs({ ...validTemplate, replyTo: 'bad' })).toThrow(
      /replyTo/,
    );
  });
});

describe('buildCreateTemplateBody', () => {
  it('builds a minimal body with no undefined keys', () => {
    const body = buildCreateTemplateBody(validTemplate);
    expect(body).toEqual({
      templateName: 'Welcome',
      subject: 'Welcome {{FNAME}}',
      sender: { email: 'noreply@empresa.com' },
      htmlContent: '<p>Hola {{FNAME}}</p>',
    });
    expect('isActive' in body).toBe(false);
    expect('replyTo' in body).toBe(false);
    expect('htmlUrl' in body).toBe(false);
  });

  it('builds the full body verbatim and keeps isActive:false', () => {
    const body = buildCreateTemplateBody({
      templateName: '  Order  ',
      subject: '  Thanks  ',
      sender: { id: 7, name: 'Store' },
      htmlUrl: 'https://cdn.example.com/o.html',
      isActive: false,
      replyTo: 'support@empresa.com',
      toField: '{{contact.FNAME}}',
      tag: '  orders  ',
      attachmentUrl: 'https://cdn.example.com/receipt.pdf',
    });
    expect(body).toEqual({
      templateName: 'Order',
      subject: 'Thanks',
      sender: { id: 7, name: 'Store' },
      htmlUrl: 'https://cdn.example.com/o.html',
      isActive: false,
      replyTo: 'support@empresa.com',
      toField: '{{contact.FNAME}}',
      tag: 'orders',
      attachmentUrl: 'https://cdn.example.com/receipt.pdf',
    });
  });

  it('coerces a numeric-string sender id and trims the email', () => {
    const body = buildCreateTemplateBody({
      ...validTemplate,
      sender: { email: '  a@b.com  ' },
    });
    expect(body.sender).toEqual({ email: 'a@b.com' });

    const idBody = buildCreateTemplateBody({ ...validTemplate, sender: { id: '9' } });
    expect(idBody.sender).toEqual({ id: 9 });
    expect(typeof (idBody.sender as { id: number }).id).toBe('number');
  });
});

// ============================================================================
// Response shaping — folders, lists, templates (from lists-templates.test.ts)
// ============================================================================

describe('shapeFolder', () => {
  it('whitelists the folder fields', () => {
    expect(
      shapeFolder({
        id: 1,
        name: 'My folder',
        totalSubscribers: 10,
        uniqueSubscribers: 9,
        totalBlacklisted: 1,
        internalToken: 'secret',
      }),
    ).toEqual({
      id: 1,
      name: 'My folder',
      totalSubscribers: 10,
      uniqueSubscribers: 9,
      totalBlacklisted: 1,
    });
  });
  it('nulls missing / wrong-typed fields', () => {
    expect(shapeFolder({})).toEqual({
      id: null,
      name: null,
      totalSubscribers: null,
      uniqueSubscribers: null,
      totalBlacklisted: null,
    });
    expect(shapeFolder(null).id).toBeNull();
  });
});

describe('shapeList', () => {
  it('whitelists the list fields including folderId', () => {
    expect(
      shapeList({
        id: 3,
        name: 'Newsletter',
        folderId: 1,
        totalSubscribers: 100,
        uniqueSubscribers: 98,
        totalBlacklisted: 2,
      }),
    ).toEqual({
      id: 3,
      name: 'Newsletter',
      folderId: 1,
      totalSubscribers: 100,
      uniqueSubscribers: 98,
      totalBlacklisted: 2,
    });
  });
  it('nulls missing fields', () => {
    expect(shapeList({ id: 3 }).folderId).toBeNull();
  });
});

describe('shapeTemplate', () => {
  it('whitelists the template fields and DROPS htmlContent (context bloat)', () => {
    const shaped = shapeTemplate({
      id: 5,
      name: 'Welcome',
      subject: 'Hi',
      isActive: true,
      testSent: false,
      sender: { email: 'a@b.com', name: 'Team', id: '9' },
      replyTo: 'r@b.com',
      toField: '{{contact.FNAME}}',
      tag: 'welcome',
      createdAt: '2026-01-01T00:00:00.000Z',
      modifiedAt: '2026-01-02T00:00:00.000Z',
      htmlContent: '<p>...huge body...</p>',
    });
    expect(shaped).toEqual({
      id: 5,
      name: 'Welcome',
      subject: 'Hi',
      isActive: true,
      testSent: false,
      sender: { email: 'a@b.com', name: 'Team', id: '9' },
      replyTo: 'r@b.com',
      toField: '{{contact.FNAME}}',
      tag: 'welcome',
      createdAt: '2026-01-01T00:00:00.000Z',
      modifiedAt: '2026-01-02T00:00:00.000Z',
    });
    expect('htmlContent' in shaped).toBe(false);
  });
  it('coerces a numeric sender id to string and nulls a missing sender', () => {
    expect(shapeTemplate({ sender: { id: 42 } }).sender).toEqual({
      email: null,
      name: null,
      id: '42',
    });
    expect(shapeTemplate({ id: 1 }).sender).toBeNull();
  });
});

// ============================================================================
// create-email-campaign (from campaigns.test.ts)
// ============================================================================

const validCampaign = {
  name: 'May Newsletter',
  subject: 'Spring deals',
  sender: { email: 'news@empresa.com' },
  htmlContent: '<h1>Hello</h1><p>Deals inside.</p>',
};

describe('validateCreateCampaignArgs', () => {
  it('passes with htmlContent, templateId or htmlUrl (exactly one)', () => {
    expect(() => validateCreateCampaignArgs(validCampaign)).not.toThrow();
    expect(() =>
      validateCreateCampaignArgs({ ...validCampaign, htmlContent: undefined, templateId: 12 }),
    ).not.toThrow();
    expect(() =>
      validateCreateCampaignArgs({
        ...validCampaign,
        htmlContent: undefined,
        htmlUrl: 'https://cdn.example.com/n.html',
      }),
    ).not.toThrow();
  });

  it('rejects missing name / subject / sender', () => {
    expect(() => validateCreateCampaignArgs({ ...validCampaign, name: '  ' })).toThrow(
      /name is required/,
    );
    expect(() => validateCreateCampaignArgs({ ...validCampaign, subject: '' })).toThrow(
      /subject is required/,
    );
    expect(() => validateCreateCampaignArgs({ ...validCampaign, sender: {} })).toThrow(
      /sender requires/,
    );
  });

  it('rejects zero content sources', () => {
    expect(() => validateCreateCampaignArgs({ ...validCampaign, htmlContent: undefined })).toThrow(
      /exactly one of htmlContent, htmlUrl or templateId/,
    );
  });

  it('rejects more than one content source (mutually exclusive)', () => {
    expect(() => validateCreateCampaignArgs({ ...validCampaign, templateId: 5 })).toThrow(
      /mutually exclusive/,
    );
  });

  it('rejects htmlContent shorter than 10 chars and non-http htmlUrl', () => {
    expect(() =>
      validateCreateCampaignArgs({ ...validCampaign, htmlContent: '<p>hi</p>' }),
    ).toThrow(/at least 10 characters/);
    expect(() =>
      validateCreateCampaignArgs({
        ...validCampaign,
        htmlContent: undefined,
        htmlUrl: 'javascript:alert(1)',
      }),
    ).toThrow(/htmlUrl must be a valid http/);
  });

  it('rejects non-integer recipient id arrays', () => {
    expect(() =>
      validateCreateCampaignArgs({ ...validCampaign, recipients: { listIds: [1, 'x'] } }),
    ).toThrow(/recipients\.listIds/);
    expect(() =>
      validateCreateCampaignArgs({ ...validCampaign, recipients: { segmentIds: 3 } }),
    ).toThrow(/recipients\.segmentIds/);
  });

  it('requires recipients.listIds when scheduledAt is set', () => {
    expect(() =>
      validateCreateCampaignArgs({ ...validCampaign, scheduledAt: '2026-06-01T10:00:00Z' }),
    ).toThrow(/recipients\.listIds is required when scheduledAt/);
    expect(() =>
      validateCreateCampaignArgs({
        ...validCampaign,
        scheduledAt: '2026-06-01T10:00:00Z',
        recipients: { listIds: [7] },
      }),
    ).not.toThrow();
  });

  it('rejects a malformed replyTo', () => {
    expect(() => validateCreateCampaignArgs({ ...validCampaign, replyTo: 'bad' })).toThrow(
      /replyTo/,
    );
  });
});

describe('buildCampaignBody', () => {
  it('builds a minimal body with no undefined keys', () => {
    const body = buildCampaignBody(validCampaign);
    expect(body).toEqual({
      name: 'May Newsletter',
      sender: { email: 'news@empresa.com' },
      subject: 'Spring deals',
      htmlContent: '<h1>Hello</h1><p>Deals inside.</p>',
    });
    expect('recipients' in body).toBe(false);
    expect('scheduledAt' in body).toBe(false);
  });

  it('builds the full body verbatim with recipients and schedule', () => {
    const body = buildCampaignBody({
      name: '  Promo  ',
      subject: '  Big sale  ',
      sender: { id: 3, name: 'Store' },
      templateId: 42,
      recipients: { listIds: [1, 2], exclusionListIds: [9], segmentIds: [5] },
      scheduledAt: '2026-06-01T10:00:00Z',
      replyTo: 'reply@empresa.com',
      toField: '{FNAME}',
      tag: '  promo  ',
      previewText: 'Peek inside',
    });
    expect(body).toEqual({
      name: 'Promo',
      subject: 'Big sale',
      sender: { id: 3, name: 'Store' },
      templateId: 42,
      recipients: { listIds: [1, 2], exclusionListIds: [9], segmentIds: [5] },
      scheduledAt: '2026-06-01T10:00:00Z',
      replyTo: 'reply@empresa.com',
      toField: '{FNAME}',
      tag: 'promo',
      previewText: 'Peek inside',
    });
  });

  it('omits empty recipient arrays (no empty recipients object)', () => {
    const body = buildCampaignBody({
      ...validCampaign,
      recipients: { listIds: [], exclusionListIds: [], segmentIds: [] },
    });
    expect('recipients' in body).toBe(false);
  });

  it('keeps only the populated recipient keys', () => {
    const body = buildCampaignBody({ ...validCampaign, recipients: { listIds: [4] } });
    expect(body.recipients).toEqual({ listIds: [4] });
  });
});

// ============================================================================
// send-test-email (from campaigns.test.ts)
// ============================================================================

describe('validateSendTestArgs', () => {
  it('passes for a valid campaignId + emailTo', () => {
    expect(() => validateSendTestArgs({ campaignId: 10, emailTo: ['a@b.com'] })).not.toThrow();
    expect(() => validateSendTestArgs({ campaignId: '10', emailTo: ['a@b.com'] })).not.toThrow();
  });
  it('rejects missing campaignId', () => {
    expect(() => validateSendTestArgs({ emailTo: ['a@b.com'] })).toThrow(/campaignId is required/);
  });
  it('rejects an empty or invalid emailTo', () => {
    expect(() => validateSendTestArgs({ campaignId: 1, emailTo: [] })).toThrow(
      /emailTo is required/,
    );
    expect(() => validateSendTestArgs({ campaignId: 1, emailTo: ['ok@x.com', 'bad'] })).toThrow(
      /emailTo\[1\]/,
    );
  });
  it('rejects more than 99 recipients', () => {
    const many = Array.from({ length: 100 }, (_, i) => `u${i}@x.com`);
    expect(() => validateSendTestArgs({ campaignId: 1, emailTo: many })).toThrow(/at most 99/);
  });
});

describe('buildSendTestBody', () => {
  it('trims the recipient addresses', () => {
    expect(buildSendTestBody({ campaignId: 1, emailTo: ['  a@b.com  ', 'c@d.com'] })).toEqual({
      emailTo: ['a@b.com', 'c@d.com'],
    });
  });
});

// ============================================================================
// Response shapers — contact, campaign (from client.test.ts)
// ============================================================================

describe('shapeContact', () => {
  it('fills [] / null defaults (never undefined, never throws)', () => {
    expect(shapeContact({})).toEqual({
      id: null,
      email: null,
      emailBlacklisted: null,
      smsBlacklisted: null,
      listIds: [],
      attributes: null,
      createdAt: null,
      modifiedAt: null,
    });
  });

  it('shapeContact({ listIds: null }) returns [] — null here would crash .map', () => {
    expect(shapeContact({ listIds: null }).listIds).toEqual([]);
  });

  it('tolerates a non-object raw (string / null)', () => {
    expect(shapeContact('garbage').listIds).toEqual([]);
    expect(shapeContact(null).id).toBeNull();
  });
});

describe('shapeCampaign', () => {
  it('returns all-null shape for empty input', () => {
    expect(shapeCampaign({})).toEqual({
      id: null,
      name: null,
      subject: null,
      type: null,
      status: null,
      scheduledAt: null,
      createdAt: null,
      modifiedAt: null,
    });
  });

  it('tolerates a non-object raw', () => {
    expect(shapeCampaign(null).id).toBeNull();
  });
});

// ============================================================================
// Reports — shared date-range validation (from reports.test.ts)
// ============================================================================

describe('report date-range validation (shared)', () => {
  it('accepts days alone, a full range alone, or nothing', () => {
    expect(() => validateEmailEventReportArgs({ days: 7 })).not.toThrow();
    expect(() =>
      validateEmailEventReportArgs({ startDate: '2026-01-01', endDate: '2026-01-31' }),
    ).not.toThrow();
    expect(() => validateEmailEventReportArgs({})).not.toThrow();
    expect(() => validateAggregatedReportArgs({ days: 30 })).not.toThrow();
  });

  it('rejects days combined with a date range', () => {
    expect(() =>
      validateEmailEventReportArgs({ days: 7, startDate: '2026-01-01', endDate: '2026-01-31' }),
    ).toThrow(/days is not compatible/);
    expect(() => validateAggregatedReportArgs({ days: 7, startDate: '2026-01-01' })).toThrow(
      /days is not compatible/,
    );
  });

  it('rejects a half-open range (start without end, or end without start)', () => {
    expect(() => validateEmailEventReportArgs({ startDate: '2026-01-01' })).toThrow(
      /must be provided together/,
    );
    expect(() => validateEmailEventReportArgs({ endDate: '2026-01-31' })).toThrow(
      /must be provided together/,
    );
  });

  it('rejects malformed dates and start > end', () => {
    expect(() =>
      validateEmailEventReportArgs({ startDate: '01/01/2026', endDate: '2026-01-31' }),
    ).toThrow(/startDate must be in YYYY-MM-DD/);
    expect(() =>
      validateEmailEventReportArgs({ startDate: '2026-01-01', endDate: '2026/01/31' }),
    ).toThrow(/endDate must be in YYYY-MM-DD/);
    expect(() =>
      validateEmailEventReportArgs({ startDate: '2026-02-01', endDate: '2026-01-31' }),
    ).toThrow(/startDate must be less than or equal to endDate/);
  });

  it('rejects days out of the 1-90 range or non-integer', () => {
    expect(() => validateEmailEventReportArgs({ days: 0 })).toThrow(/between 1 and 90/);
    expect(() => validateEmailEventReportArgs({ days: 91 })).toThrow(/between 1 and 90/);
    expect(() => validateEmailEventReportArgs({ days: 3.5 })).toThrow(/between 1 and 90/);
  });
});

// ============================================================================
// get-email-event-report (from reports.test.ts)
// ============================================================================

describe('validateEmailEventReportArgs', () => {
  it('passes with a full valid filter set', () => {
    expect(() =>
      validateEmailEventReportArgs({
        days: 14,
        email: 'a@b.com',
        event: 'opened',
        messageId: '<x@brevo>',
        templateId: 12,
        sort: 'asc',
      }),
    ).not.toThrow();
  });

  it('rejects an invalid email, event, sort, messageId and templateId', () => {
    expect(() => validateEmailEventReportArgs({ email: 'nope' })).toThrow(/email must be a valid/);
    expect(() => validateEmailEventReportArgs({ event: 'openedd' })).toThrow(
      /event must be one of/,
    );
    expect(() => validateEmailEventReportArgs({ sort: 'up' })).toThrow(/sort must be one of/);
    expect(() => validateEmailEventReportArgs({ messageId: '   ' })).toThrow(
      /messageId must be a non-empty/,
    );
    expect(() => validateEmailEventReportArgs({ templateId: 1.5 })).toThrow(
      /templateId must be an integer/,
    );
  });
});

describe('buildEmailEventQuery', () => {
  it('builds the exact query, mapping every present filter', () => {
    expect(
      buildEmailEventQuery({
        limit: 200,
        offset: 10,
        startDate: '  2026-01-01  ',
        endDate: '2026-01-31',
        email: '  a@b.com ',
        event: 'clicks',
        messageId: '  <m>  ',
        templateId: 7,
        sort: 'asc',
      }),
    ).toEqual({
      limit: 200,
      offset: 10,
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      email: 'a@b.com',
      event: 'clicks',
      messageId: '<m>',
      templateId: 7,
      sort: 'asc',
    });
  });

  it('applies defaults, clamps the limit and omits absent filters', () => {
    expect(buildEmailEventQuery({})).toEqual({ limit: 100, offset: 0 });
    expect(buildEmailEventQuery({ limit: 99999 }).limit).toBe(5000);
    expect(buildEmailEventQuery({ limit: 0 }).limit).toBe(1);
    const q = buildEmailEventQuery({ days: 5 });
    expect(q).toEqual({ limit: 100, offset: 0, days: 5 });
    expect('startDate' in q).toBe(false);
  });
});

describe('shapeEmailEvent', () => {
  it('maps the whitelisted fields and DROPS ip', () => {
    expect(
      shapeEmailEvent({
        date: '2026-01-01T10:00:00Z',
        email: 'a@b.com',
        event: 'delivered',
        messageId: '<m>',
        subject: 'Hi',
        tag: 'welcome',
        reason: null,
        link: null,
        from: 's@x.com',
        templateId: 4,
        ip: '1.2.3.4',
      }),
    ).toEqual({
      date: '2026-01-01T10:00:00Z',
      email: 'a@b.com',
      event: 'delivered',
      messageId: '<m>',
      subject: 'Hi',
      tag: 'welcome',
      reason: null,
      link: null,
      from: 's@x.com',
      templateId: 4,
    });
  });

  it('defaults missing / garbage fields to null', () => {
    expect(shapeEmailEvent(null)).toEqual({
      date: null,
      email: null,
      event: null,
      messageId: null,
      subject: null,
      tag: null,
      reason: null,
      link: null,
      from: null,
      templateId: null,
    });
  });
});

// ============================================================================
// get-aggregated-smtp-report (from reports.test.ts)
// ============================================================================

describe('validateAggregatedReportArgs', () => {
  it('passes with days + tag, rejects an empty tag', () => {
    expect(() => validateAggregatedReportArgs({ days: 30, tag: 'promo' })).not.toThrow();
    expect(() => validateAggregatedReportArgs({ tag: '   ' })).toThrow(/tag must be a non-empty/);
  });
});

describe('buildAggregatedReportQuery', () => {
  it('maps days + tag, or a full range, omitting absent', () => {
    expect(buildAggregatedReportQuery({ days: 30, tag: '  promo ' })).toEqual({
      days: 30,
      tag: 'promo',
    });
    expect(
      buildAggregatedReportQuery({ startDate: ' 2026-01-01 ', endDate: '2026-01-31' }),
    ).toEqual({ startDate: '2026-01-01', endDate: '2026-01-31' });
    expect(buildAggregatedReportQuery({})).toEqual({});
  });
});

describe('shapeAggregatedReport', () => {
  it('maps range + every numeric total', () => {
    expect(
      shapeAggregatedReport({
        range: '2026-01-01|2026-01-31',
        requests: 100,
        delivered: 95,
        opens: 60,
        uniqueOpens: 40,
        clicks: 20,
        uniqueClicks: 15,
        hardBounces: 2,
        softBounces: 3,
        blocked: 1,
        invalid: 0,
        spamReports: 1,
        unsubscribed: 4,
      }),
    ).toEqual({
      range: '2026-01-01|2026-01-31',
      requests: 100,
      delivered: 95,
      opens: 60,
      uniqueOpens: 40,
      clicks: 20,
      uniqueClicks: 15,
      hardBounces: 2,
      softBounces: 3,
      blocked: 1,
      invalid: 0,
      spamReports: 1,
      unsubscribed: 4,
    });
  });

  it('defaults missing / garbage numbers to null', () => {
    expect(shapeAggregatedReport({ requests: 'x' })).toEqual({
      range: null,
      requests: null,
      delivered: null,
      opens: null,
      uniqueOpens: null,
      clicks: null,
      uniqueClicks: null,
      hardBounces: null,
      softBounces: null,
      blocked: null,
      invalid: null,
      spamReports: null,
      unsubscribed: null,
    });
  });
});

// ============================================================================
// EMAIL_EVENT_TYPES constant (from tools-contract.test.ts)
// ============================================================================

describe('EMAIL_EVENT_TYPES constant', () => {
  it('contains exactly the 14 event types from the official Brevo SDK', () => {
    const actual: string[] = [...EMAIL_EVENT_TYPES].sort();
    expect(actual).toEqual([
      'blocked',
      'bounces',
      'clicks',
      'deferred',
      'delivered',
      'error',
      'hardBounces',
      'invalid',
      'loadedByProxy',
      'opened',
      'requests',
      'softBounces',
      'spam',
      'unsubscribed',
    ]);
  });
});
