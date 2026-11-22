/**
 * Generates the Word test fixtures, deterministically.
 *
 * Run from the app directory:  node scripts/make-fixtures.mjs
 *
 * The archive is small but structurally real: styles, relationships, and both
 * docProps parts are present so fidelity tests have something to preserve. The
 * timestamps are pinned so regenerating produces the same bytes.
 */

import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`;

const CORE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Quarterly Report</dc:title><dc:creator>Agent Apps</dc:creator></cp:coreProperties>`;

const APP = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Microsoft Office Word</Application></Properties>`;

// Paragraph 3 deliberately splits "Hello world" across three runs, the first of
// them bold: the exact shape a naive regex over document.xml fails to find,
// and the fidelity case for preserving per-run formatting (spec §7.3, §9.2).
// Paragraph 4 is an empty self-closing <w:p/>, which the paragraph scanner must
// still count so indices stay stable.
const DOCUMENT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Quarterly Report</w:t></w:r></w:p><w:p><w:r><w:t>Revenue grew by 12 percent.</w:t></w:r></w:p><w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Hel</w:t></w:r><w:r><w:t xml:space="preserve">lo wo</w:t></w:r><w:r><w:t>rld</w:t></w:r></w:p><w:p/><w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:body></w:document>`;

const PARTS = [
  ['[Content_Types].xml', CONTENT_TYPES],
  ['_rels/.rels', RELS],
  ['word/document.xml', DOCUMENT],
  ['word/_rels/document.xml.rels', DOC_RELS],
  ['word/styles.xml', STYLES],
  ['docProps/core.xml', CORE],
  ['docProps/app.xml', APP],
];

// OLE2 compound-file signature. A legacy binary .doc starts with these bytes and
// is not a zip at all, which is why the guard checks magic bytes and not just
// the file extension (spec §8.4).
const OLE2_HEADER = Buffer.from([
  0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00, 0x00, 0x00,
]);

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures');
mkdirSync(outDir, { recursive: true });

const archive = new JSZip();
// Pinned timestamp: regenerating must produce the same archive.
const date = new Date(Date.UTC(2026, 0, 1));
for (const [name, body] of PARTS) archive.file(name, body, { date, createFolders: false });
const docxPath = join(outDir, 'sample.docx');
writeFileSync(
  docxPath,
  await archive.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', platform: 'UNIX' }),
);

const docPath = join(outDir, 'legacy.doc');
writeFileSync(docPath, OLE2_HEADER);

console.log(`${docxPath}: ${statSync(docxPath).size} bytes, ${PARTS.length} parts`);
console.log(`${docPath}: ${statSync(docPath).size} bytes`);
