/**
 * Email construction and parsing helpers.
 *
 * Pure functions for building RFC 2822 email messages, encoding headers,
 * parsing MIME parts, and converting Markdown to HTML for email bodies.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { marked } from 'marked';

export function containsMarkdown(text: string): boolean {
  const markdownPatterns = [
    /^#{1,6}\s/m,
    /\*\*[^*]+\*\*/,
    /\*[^*]+\*/,
    /__[^_]+__/,
    /_[^_]+_/,
    /\[.+\]\(.+\)/,
    /^[-*+]\s/m,
    /^\d+\.\s/m,
    /^>\s/m,
    /`[^`]+`/,
    /```[\s\S]*?```/,
    /^\|.+\|$/m,
    /^---+$/m,
  ];

  return markdownPatterns.some((pattern) => pattern.test(text));
}

export async function markdownToHtmlEmail(markdown: string): Promise<string> {
  marked.setOptions({
    gfm: true,
    breaks: true,
  });

  const htmlContent = await marked.parse(markdown);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <style>
    h1 { font-size: 24px; font-weight: 600; margin: 24px 0 16px 0; color: #1a1a1a; }
    h2 { font-size: 20px; font-weight: 600; margin: 20px 0 12px 0; color: #1a1a1a; }
    h3 { font-size: 16px; font-weight: 600; margin: 16px 0 8px 0; color: #1a1a1a; }
    p { margin: 0 0 16px 0; }
    ul, ol { margin: 0 0 16px 0; padding-left: 24px; }
    li { margin: 4px 0; }
    a { color: #0066cc; text-decoration: none; }
    a:hover { text-decoration: underline; }
    code { background-color: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-family: 'SF Mono', Monaco, 'Courier New', monospace; font-size: 13px; }
    pre { background-color: #f4f4f4; padding: 12px; border-radius: 6px; overflow-x: auto; margin: 0 0 16px 0; }
    pre code { background: none; padding: 0; }
    blockquote { border-left: 4px solid #ddd; margin: 0 0 16px 0; padding: 8px 16px; color: #666; }
    table { border-collapse: collapse; width: 100%; margin: 0 0 16px 0; }
    th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
    th { background-color: #f4f4f4; font-weight: 600; }
    hr { border: none; border-top: 1px solid #ddd; margin: 24px 0; }
    strong { font-weight: 600; }
  </style>
  ${htmlContent}
</body>
</html>`;
}

export function resolveBodyFromFile(filePath: string): { body: string; isHtml?: boolean } {
  const absolutePath = filePath.startsWith('/') ? filePath : join(process.cwd(), filePath);

  if (!existsSync(absolutePath)) {
    throw new Error(`bodyFile not found: ${absolutePath}`);
  }

  const content = readFileSync(absolutePath, 'utf-8');
  const ext = absolutePath.split('.').pop()?.toLowerCase();

  if (ext === 'html' || ext === 'htm') {
    return { body: content, isHtml: true };
  } else if (ext === 'md' || ext === 'markdown') {
    return { body: content, isHtml: undefined };
  } else {
    return { body: content, isHtml: false };
  }
}

export async function processEmailBody(
  body: string,
  explicitIsHtml?: boolean,
): Promise<{ body: string; isHtml: boolean }> {
  if (explicitIsHtml === true) {
    return { body, isHtml: true };
  }

  if (explicitIsHtml === false && !containsMarkdown(body)) {
    return { body, isHtml: false };
  }

  if (containsMarkdown(body)) {
    const htmlBody = await markdownToHtmlEmail(body);
    return { body: htmlBody, isHtml: true };
  }

  return { body, isHtml: false };
}

export function encodeSubject(subject: string): string {
  const needsEncoding = /[^\p{ASCII}]/u.test(subject);
  if (!needsEncoding) return subject;
  const encoded = Buffer.from(subject, 'utf-8').toString('base64');
  return `=?UTF-8?B?${encoded}?=`;
}

export function encodeAddressDisplayName(address: string): string {
  const match = address.match(/^"?([^"<]+?)"?\s*<([^>]+)>$/);
  if (!match) return address;
  const [, name, email] = match;
  const needsEncoding = /[^\p{ASCII}]/u.test(name);
  if (!needsEncoding) return address;
  const encoded = Buffer.from(name.trim(), 'utf-8').toString('base64');
  return `=?UTF-8?B?${encoded}?= <${email}>`;
}

export function createRawEmail(
  to: string,
  subject: string,
  body: string,
  from: string,
  options: {
    cc?: string;
    bcc?: string;
    isHtml?: boolean;
    inReplyTo?: string;
    references?: string;
    fromName?: string;
  } = {},
): string {
  const fromHeader = options.fromName
    ? encodeAddressDisplayName(`"${options.fromName}" <${from}>`)
    : from;
  const lines = [
    `From: ${fromHeader}`,
    `To: ${encodeAddressDisplayName(to)}`,
    `Subject: ${encodeSubject(subject)}`,
  ];

  if (options.cc) lines.push(`Cc: ${encodeAddressDisplayName(options.cc)}`);
  if (options.bcc) lines.push(`Bcc: ${encodeAddressDisplayName(options.bcc)}`);
  if (options.inReplyTo) lines.push(`In-Reply-To: ${options.inReplyTo}`);
  if (options.references) lines.push(`References: ${options.references}`);

  lines.push(`Content-Type: text/${options.isHtml ? 'html' : 'plain'}; charset=utf-8`);
  lines.push(`MIME-Version: 1.0`);
  lines.push('');
  lines.push(body);

  const email = lines.join('\r\n');
  return Buffer.from(email)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function createRawEmailWithAttachments(
  to: string,
  subject: string,
  body: string,
  from: string,
  attachments: Array<{ path: string; filename?: string }>,
  options: {
    cc?: string;
    bcc?: string;
    isHtml?: boolean;
    inReplyTo?: string;
    references?: string;
    fromName?: string;
  } = {},
): string {
  const fromHeader = options.fromName
    ? encodeAddressDisplayName(`"${options.fromName}" <${from}>`)
    : from;
  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).substring(2)}`;

  const lines = [
    `From: ${fromHeader}`,
    `To: ${encodeAddressDisplayName(to)}`,
    `Subject: ${encodeSubject(subject)}`,
  ];

  if (options.cc) lines.push(`Cc: ${encodeAddressDisplayName(options.cc)}`);
  if (options.bcc) lines.push(`Bcc: ${encodeAddressDisplayName(options.bcc)}`);
  if (options.inReplyTo) lines.push(`In-Reply-To: ${options.inReplyTo}`);
  if (options.references) lines.push(`References: ${options.references}`);

  lines.push(`MIME-Version: 1.0`);
  lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  lines.push('');

  // Body part
  lines.push(`--${boundary}`);
  lines.push(`Content-Type: text/${options.isHtml ? 'html' : 'plain'}; charset=utf-8`);
  lines.push('');
  lines.push(body);
  lines.push('');

  // Attachment parts
  for (const attachment of attachments) {
    const filePath = attachment.path.startsWith('/')
      ? attachment.path
      : join(process.cwd(), attachment.path);

    if (!existsSync(filePath)) {
      throw new Error(`Attachment file not found: ${filePath}`);
    }

    const fileContent = readFileSync(filePath);
    const base64Content = fileContent.toString('base64');
    const filename = attachment.filename || filePath.split('/').pop() || 'attachment';

    const ext = filename.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      pdf: 'application/pdf',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      txt: 'text/plain',
      zip: 'application/zip',
    };
    const mimeType = mimeTypes[ext || ''] || 'application/octet-stream';

    lines.push(`--${boundary}`);
    lines.push(`Content-Type: ${mimeType}; name="${filename}"`);
    lines.push(`Content-Disposition: attachment; filename="${filename}"`);
    lines.push(`Content-Transfer-Encoding: base64`);
    lines.push('');

    const base64Lines = base64Content.match(/.{1,76}/g) || [];
    lines.push(...base64Lines);
    lines.push('');
  }

  lines.push(`--${boundary}--`);

  const email = lines.join('\r\n');
  return Buffer.from(email)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function findTextPart(part: any): string {
  if (part.body?.data) {
    return Buffer.from(part.body.data, 'base64').toString();
  }

  if (part.parts) {
    const plainPart = part.parts.find((p: any) => p.mimeType === 'text/plain');
    if (plainPart?.body?.data) {
      return Buffer.from(plainPart.body.data, 'base64').toString();
    }

    const htmlPart = part.parts.find((p: any) => p.mimeType === 'text/html');
    if (htmlPart?.body?.data) {
      return Buffer.from(htmlPart.body.data, 'base64').toString();
    }

    for (const subPart of part.parts) {
      const result = findTextPart(subPart);
      if (result) return result;
    }
  }

  return '';
}

export function findAttachments(part: any): any[] {
  const attachments: any[] = [];

  if (part.filename && part.body?.attachmentId) {
    attachments.push({
      filename: part.filename,
      mimeType: part.mimeType,
      attachmentId: part.body.attachmentId,
      size: part.body.size,
    });
  }

  if (part.parts) {
    for (const subPart of part.parts) {
      attachments.push(...findAttachments(subPart));
    }
  }

  return attachments;
}
