import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { safeAttachmentName } from '../src/lib/helpers.js';

describe('safeAttachmentName', () => {
  it('keeps an ordinary name', () => {
    expect(safeAttachmentName('report Q3.pdf')).toBe('report Q3.pdf');
  });

  it('never lets a sender-chosen name leave the folder', () => {
    const dir = resolve('/tmp/attachments');
    for (const name of [
      '../../.ssh/authorized_keys',
      '..\\..\\evil.bat',
      '/etc/passwd',
      'a/../../b.txt',
      '..',
      '.',
      '',
      undefined,
    ]) {
      const saved = resolve(join(dir, safeAttachmentName(name)));
      expect(saved.startsWith(`${dir}/`), String(name)).toBe(true);
    }
    expect(safeAttachmentName('../../.ssh/authorized_keys')).toBe('authorized_keys');
    expect(safeAttachmentName('..')).toBe('attachment');
  });
});
