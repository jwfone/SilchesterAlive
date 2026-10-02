// CSV -> generated collectibles importer.
// Usage:
//   npm run import:collectibles -- assets/collectibles.csv
//   npm run import:collectibles   (defaults to assets/collectibles.csv)
//
// Required columns (case-insensitive): ID, title, embedSrc, kind
// Optional columns: caption, attributionUrl, author, authorUrl, x, z
// - embedSrc accepts either a bare https://sketchfab.com/.../embed URL or the
//   full Sketchfab embed HTML (<div class="sketchfab-embed-wrapper">...); the
//   iframe src, model page link and author link are extracted from the HTML,
//   filling in any missing attributionUrl/author/authorUrl columns.
// - kind: "site" or "artefact" (anything else -> "artefact").
// - x,z: town-local metres; empty = random placement at runtime (seeded).
// Output: src/domain/collectibles.generated.ts (GENERATED_COLLECTIBLES).

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = join(ROOT, 'src', 'domain', 'collectibles.generated.ts');

const target = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'assets/collectibles.csv';
const src = join(ROOT, target);

function parseCsv(text) {
  // Minimal RFC-4180 reader: quoted fields, doubled quotes, commas + newlines in quotes.
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* skip */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  row.push(field);
  rows.push(row);
  return rows.filter((r) => r.some((f) => String(f).trim() !== ''));
}

/** Pull the iframe src + attribution/author links out of Sketchfab embed HTML. */
function extractEmbed(html) {
  const clean = (u) => String(u ?? '').replace(/&amp;/g, '&').trim();
  const embedSrc = clean(/<iframe[^>]*\ssrc="([^"]+)"/i.exec(html)?.[1]);
  const links = [...html.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/gi)]
    .map((m) => ({ href: clean(m[1]), text: m[2].trim() }));
  const attributionUrl = clean(links.find((l) => /sketchfab\.com\/3d-models\//.test(l.href))?.href);
  const author = links.find((l) => /^https:\/\/sketchfab\.com\/[^/]+\/?$/.test(l.href) && !/3d-models/.test(l.href));
  return { embedSrc, attributionUrl, author: author?.text ?? '', authorUrl: clean(author?.href) };
}

let text;
try {
  text = readFileSync(src, 'utf8');
} catch {
  console.error(`[import:collectibles] not found: ${src}`);
  process.exit(1);
}

const rows = parseCsv(text);
// Strip BOM; match headers case-insensitively but keep the canonical names.
const header = rows.shift().map((h) => String(h).replace(/^\uFEFF/, '').trim().toLowerCase());
const col = (o, ...names) => {
  for (const n of names) {
    const i = header.indexOf(n);
    if (i >= 0) return o[i] ?? '';
  }
  return '';
};
for (const need of ['id', 'title', 'embedsrc', 'kind']) {
  if (!header.includes(need)) {
    console.error(`[import:collectibles] missing column "${need}" (got: ${header.join(',')})`);
    process.exit(1);
  }
}

const items = rows.map((r) => {
  const get = (...names) => String(col(r, ...names) ?? '').trim();
  const id = get('id');
  const title = get('title') || id;
  const caption = get('caption');
  const kind = get('kind').toLowerCase() === 'site' ? 'site' : 'artefact';
  const num = (v) => (v === '' ? undefined : Number(v));
  const x = num(get('x'));
  const z = num(get('z'));
  let embedSrc = get('embedsrc');
  let attributionUrl = get('attributionurl');
  let author = get('author');
  let authorUrl = get('authorurl');
  if (/<iframe/i.test(embedSrc)) {
    const ex = extractEmbed(embedSrc);
    if (ex.embedSrc) embedSrc = ex.embedSrc;
    if (!attributionUrl && ex.attributionUrl) attributionUrl = ex.attributionUrl;
    if (!author && ex.author) author = ex.author;
    if (!authorUrl && ex.authorUrl) authorUrl = ex.authorUrl;
  }
  return {
    id,
    title,
    caption,
    embedSrc,
    attributionUrl: attributionUrl || embedSrc,
    author: author || 'Sketchfab',
    authorUrl: authorUrl || 'https://sketchfab.com',
    kind,
    ...(Number.isFinite(x) && Number.isFinite(z) ? { x, z } : {}),
  };
}).filter((o) => o.id && o.embedSrc);

const seen = new Set();
for (const o of items) {
  if (seen.has(o.id)) {
    console.error(`[import:collectibles] duplicate id: ${o.id}`);
    process.exit(1);
  }
  seen.add(o.id);
  try {
    const u = new URL(o.embedSrc);
    if (u.protocol !== 'https:' || !/(^|\.)sketchfab\.com$/.test(u.hostname)) throw new Error();
  } catch {
    console.error(`[import:collectibles] ${o.id}: embedSrc must be an https://sketchfab.com URL`);
    process.exit(1);
  }
}

const out =
  `// AUTO-GENERATED by scripts/import-collectibles.mjs — do not hand-edit.\n` +
  `// Source: ${target} (${items.length} models). Rerun: npm run import:collectibles\n` +
  `export interface GeneratedCollectible { id: string; title: string; caption: string; embedSrc: string; attributionUrl: string; author: string; authorUrl: string; kind: 'site' | 'artefact'; x?: number; z?: number }\n` +
  `export const GENERATED_COLLECTIBLES: GeneratedCollectible[] = ${JSON.stringify(items)};\n`;

writeFileSync(OUT, out);
console.log(`[import:collectibles] ${items.length} models -> src/domain/collectibles.generated.ts`);
