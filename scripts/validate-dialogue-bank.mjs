// Check harvested dialogue drafts, write review files and walk transcripts.
// Usage:
//   npm run bank:validate -- --persona matron --walks 20
//   npm run bank:validate -- --persona all
//   npm run bank:validate -- --persona matron --promote --approve-all
//
// Ticks in dialogue-bank/review/<id>.md are kept when the node's content hash
// is unchanged. --promote ships only ticked nodes to public/dialogue-bank/.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NPC_PERSONAS } from '../.domain-out/domain/npcPersonas.js';
import { GHOST_COSTUMES } from '../.domain-out/domain/ghosts.js';
import { DIALOGUE_MAX_TURNS } from '../.domain-out/domain/dialogue.js';
import { checkBankText } from '../.domain-out/domain/dialogueSafety.js';
import { mulberry32 } from '../.domain-out/domain/rng.js';
import { pickChoices, pickFarewell, pickGreeting, pickReply } from '../.domain-out/domain/dialogueBankSelect.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

function parseArgs(argv) {
  const out = { persona: '', walks: 20, promote: false, approveAll: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i] ?? '';
    if (a === '--promote') out.promote = true;
    else if (a === '--approve-all') out.approveAll = true;
    else if (a === '--persona') out.persona = next();
    else if (a === '--walks') out.walks = Number(next());
    else {
      console.error(`Unknown argument: ${a}`);
      process.exit(1);
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.persona) {
  console.error('Usage: npm run bank:validate -- --persona <id|all> [--walks 20] [--promote] [--approve-all]');
  process.exit(1);
}
if (!Number.isFinite(args.walks) || args.walks < 0) {
  console.error('--walks must be a non-negative number');
  process.exit(1);
}

if (args.approveAll) {
  console.warn('WARNING: --approve-all marks every node reviewed without a teacher tick. Pilot/dev only. Do not ship this to children without reading the review file.');
}

function draftPath(id) {
  return join(ROOT, 'dialogue-bank', 'drafts', `${id}.json`);
}

function wordCount(text) {
  return String(text).trim().split(/\s+/).filter(Boolean).length;
}

function normWords(text) {
  return new Set(String(text).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean));
}

function jaccard(a, b) {
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function opening(text) {
  return String(text).trim().split(/\s+/).slice(0, 3).join(' ').toLowerCase();
}

function nodeHash(node) {
  const body = JSON.stringify({ ask: node.ask, replies: node.replies });
  return createHash('sha256').update(body).digest('hex').slice(0, 12);
}

function readTicks(md) {
  const map = new Map();
  const re = /^- \[([ xX])\] `([^`]+)` <!-- h:([a-f0-9]+) -->$/gm;
  let m;
  while ((m = re.exec(md))) map.set(m[2], { ticked: m[1].toLowerCase() === 'x', hash: m[3] });
  return map;
}

function reachable(nodes, roots) {
  const seen = new Set();
  const stack = [...roots];
  while (stack.length) {
    const id = stack.pop();
    if (!id || seen.has(id) || !nodes[id]) continue;
    seen.add(id);
    for (const nxt of nodes[id].next || []) stack.push(nxt);
  }
  return seen;
}

function checkStructure(bank, errors) {
  const nodes = bank.nodes || {};
  const greetings = [...(bank.greetings || []), ...(bank.returnGreetings || [])];
  for (const g of greetings) {
    for (const id of g.next || []) {
      if (!nodes[id]) errors.push(`greeting next "${id}" does not resolve`);
    }
  }
  for (const node of Object.values(nodes)) {
    for (const id of node.next || []) {
      if (!nodes[id]) errors.push(`${node.id} next "${id}" does not resolve`);
    }
    if ((node.next || []).length < 3) errors.push(`${node.id} has fewer than 3 next links`);
    if (!Array.isArray(node.ask) || node.ask.length < 2 || node.ask.length > 3) {
      errors.push(`${node.id} ask must have 2 or 3 phrasings`);
    }
    if (!Array.isArray(node.replies) || node.replies.length < 2 || node.replies.length > 3) {
      errors.push(`${node.id} replies must have 2 or 3 variants`);
    }
    for (const ask of node.ask || []) {
      if (ask.length > 120) errors.push(`${node.id} ask over 120 characters`);
      if (wordCount(ask) >= 15) errors.push(`${node.id} ask has 15 or more words`);
      if (/farewell/i.test(ask)) errors.push(`${node.id} ask contains farewell`);
    }
    for (const reply of node.replies || []) {
      if (reply.length > 450) errors.push(`${node.id} reply over 450 characters`);
    }
  }
  const roots = [];
  for (const g of greetings) roots.push(...(g.next || []));
  const seen = reachable(nodes, roots);
  for (const id of Object.keys(nodes)) {
    if (!seen.has(id)) errors.push(`${id} is not reachable from the greetings`);
  }
}

function checkText(bank, persona, errors, warnings) {
  const neverKnows = persona?.neverKnows || [];
  const lines = [];
  for (const g of [...(bank.greetings || []), ...(bank.returnGreetings || [])]) lines.push(['greeting', g.reply]);
  for (const f of bank.farewells || []) lines.push(['farewell', f]);
  for (const node of Object.values(bank.nodes || {})) {
    for (const ask of node.ask || []) lines.push([node.id, ask]);
    for (const reply of node.replies || []) lines.push([node.id, reply]);
  }
  for (const [where, text] of lines) {
    for (const problem of checkBankText(String(text || ''), neverKnows)) {
      if (problem === 'blocked' || problem === 'meta') errors.push(`${where} failed safety (${problem})`);
      else warnings.push(`${where} ${problem}: ${String(text).slice(0, 80)}`);
    }
  }
  for (const node of Object.values(bank.nodes || {})) {
    for (const reply of node.replies || []) {
      const words = wordCount(reply);
      if (words < 25 || words > 70) warnings.push(`${node.id} reply is ${words} words`);
    }
  }
  const replies = [];
  for (const node of Object.values(bank.nodes || {})) {
    for (const reply of node.replies || []) replies.push({ id: node.id, reply, words: normWords(reply) });
  }
  let dupes = 0;
  for (let i = 0; i < replies.length; i++) {
    for (let j = i + 1; j < replies.length; j++) {
      const score = jaccard(replies[i].words, replies[j].words);
      if (score > 0.7) {
        dupes++;
        if (dupes <= 20) warnings.push(`near-duplicate ${replies[i].id} / ${replies[j].id} (${score.toFixed(2)})`);
      }
    }
  }
  if (dupes > 20) warnings.push(`${dupes} near-duplicate reply pairs (showing 20)`);
  const counts = new Map();
  for (const item of replies) {
    const key = opening(item.reply);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let top = 0;
  let topKey = '';
  for (const [key, n] of counts) {
    if (n > top) { top = n; topKey = key; }
  }
  if (replies.length && top / replies.length > 0.15) {
    warnings.push(`${Math.round(100 * top / replies.length)}% of replies open with "${topKey}"`);
  }
}

function walkTranscripts(bank) {
  const walkBank = {
    ...bank,
    nodes: Object.fromEntries(Object.entries(bank.nodes || {}).map(([id, node]) => [id, { ...node, reviewed: true }])),
  };
  const seenEver = new Set();
  const walks = [];
  for (let w = 0; w < args.walks; w++) {
    const rng = mulberry32(1000 + w);
    const greeting = pickGreeting(walkBank, w > 0, rng);
    const lines = [`### Walk ${w + 1}`, '', `**Ghost:** ${greeting.reply}`];
    const seenThis = new Set();
    let nextIds = greeting.next || [];
    for (let turn = 0; turn < DIALOGUE_MAX_TURNS; turn++) {
      const choices = pickChoices(walkBank, nextIds, { turn, seenThisMeeting: seenThis, seenEver }, rng);
      if (!choices.length) break;
      const choice = choices[Math.floor(rng() * choices.length)];
      lines.push(`**You:** ${choice.text}`);
      if (turn + 1 >= DIALOGUE_MAX_TURNS) {
        lines.push(`**Ghost:** ${pickFarewell(walkBank, rng)}`);
        break;
      }
      const node = walkBank.nodes[choice.nodeId];
      if (!node) break;
      seenThis.add(choice.nodeId);
      seenEver.add(choice.nodeId);
      lines.push(`**Ghost:** ${pickReply(node, null, rng).text}`);
      nextIds = node.next || [];
    }
    lines.push('');
    walks.push(lines.join('\n'));
  }
  return walks.join('\n');
}

function writeReview(id, bank, ticks) {
  const lines = [
    `# ${id} dialogue review`,
    '',
    'Tick the box to approve a node. Ticks are kept when the content hash still matches.',
    '',
  ];
  const ids = Object.keys(bank.nodes || {}).sort();
  for (const nodeId of ids) {
    const node = bank.nodes[nodeId];
    const hash = nodeHash(node);
    const prev = ticks.get(nodeId);
    const mark = prev && prev.ticked && prev.hash === hash ? 'x' : ' ';
    lines.push(`- [${mark}] \`${nodeId}\` <!-- h:${hash} -->`);
    for (const ask of node.ask || []) lines.push(`  - Ask: ${ask}`);
    for (const reply of node.replies || []) lines.push(`  - Reply: ${reply}`);
    lines.push('');
  }
  const dest = join(ROOT, 'dialogue-bank', 'review', `${id}.md`);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, lines.join('\n'));
  return dest;
}

function approvedIds(bank, ticks) {
  const ids = new Set();
  for (const [id, node] of Object.entries(bank.nodes || {})) {
    if (args.approveAll) { ids.add(id); continue; }
    const prev = ticks.get(id);
    if (prev && prev.ticked && prev.hash === nodeHash(node)) ids.add(id);
  }
  return ids;
}

function promote(id, bank, approved) {
  const nodes = {};
  for (const [nodeId, node] of Object.entries(bank.nodes || {})) {
    if (!approved.has(nodeId)) continue;
    nodes[nodeId] = {
      ...node,
      reviewed: true,
      next: (node.next || []).filter((nxt) => approved.has(nxt)),
    };
  }
  const filterNext = (list) => (list || []).map((g) => ({
    reply: g.reply,
    next: (g.next || []).filter((nxt) => approved.has(nxt)),
  }));
  const shipped = {
    ...bank,
    greetings: filterNext(bank.greetings),
    returnGreetings: filterNext(bank.returnGreetings),
    nodes,
  };
  const errors = [];
  checkStructure(shipped, errors);
  for (const g of [...shipped.greetings, ...shipped.returnGreetings]) {
    if ((g.next || []).length < 3) errors.push('a greeting has fewer than 3 reachable choices');
  }
  if (errors.length) {
    for (const err of errors) console.error(`[validate] ${id} promote: ${err}`);
    return false;
  }
  const destDir = join(ROOT, 'public', 'dialogue-bank');
  mkdirSync(destDir, { recursive: true });
  writeFileSync(join(destDir, `${id}.json`), JSON.stringify(shipped));
  const manifestPath = join(destDir, 'manifest.json');
  let manifest = [];
  if (existsSync(manifestPath)) {
    try {
      const parsed = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if (Array.isArray(parsed)) manifest = parsed;
    } catch { /* replace */ }
  }
  const entry = {
    personaId: id,
    bankVersion: bank.bankVersion,
    nodeCount: Object.keys(nodes).length,
    reviewedCount: Object.keys(nodes).length,
    generatedAt: bank.generatedAt,
  };
  manifest = [...manifest.filter((row) => row.personaId !== id), entry].sort((a, b) => String(a.personaId).localeCompare(String(b.personaId)));
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`[validate] ${id}: promoted ${entry.nodeCount} nodes`);
  return true;
}

function personaList() {
  if (args.persona !== 'all') {
    if (!GHOST_COSTUMES.includes(args.persona)) {
      console.error(`Unknown persona "${args.persona}"`);
      process.exit(1);
    }
    return [args.persona];
  }
  return GHOST_COSTUMES.slice();
}

let failed = false;
for (const id of personaList()) {
  const path = draftPath(id);
  if (!existsSync(path)) {
    console.log(`[validate] ${id}: no draft, skipped`);
    continue;
  }
  let bank;
  try {
    bank = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    console.error(`[validate] ${id}: invalid JSON (${err.message})`);
    failed = true;
    continue;
  }
  if (bank.schemaVersion !== 1 || bank.personaId !== id || !bank.nodes || typeof bank.nodes !== 'object') {
    console.error(`[validate] ${id}: schema mismatch`);
    failed = true;
    continue;
  }
  const errors = [];
  const warnings = [];
  checkStructure(bank, errors);
  checkText(bank, NPC_PERSONAS[id], errors, warnings);
  const reviewPath = join(ROOT, 'dialogue-bank', 'review', `${id}.md`);
  const ticks = existsSync(reviewPath) ? readTicks(readFileSync(reviewPath, 'utf8')) : new Map();
  const approved = approvedIds(bank, ticks);
  writeReview(id, bank, ticks);
  if (args.walks > 0) {
    const walksPath = join(ROOT, 'dialogue-bank', 'review', `${id}.walks.md`);
    mkdirSync(dirname(walksPath), { recursive: true });
    writeFileSync(walksPath, `# ${id} walks\n\n${walkTranscripts(bank)}`);
  }
  console.log(`[validate] ${id}: ${Object.keys(bank.nodes).length} nodes, ${errors.length} errors, ${warnings.length} warnings, ${approved.size} approved`);
  for (const err of errors) console.error(`  error: ${err}`);
  for (const warn of warnings) console.warn(`  warn: ${warn}`);
  if (errors.length) failed = true;
  else if (args.promote && !promote(id, bank, approved)) failed = true;
}

if (args.persona === 'all') {
  const dir = join(ROOT, 'dialogue-bank', 'drafts');
  if (existsSync(dir)) {
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.json')) continue;
      const id = file.slice(0, -5);
      if (!GHOST_COSTUMES.includes(id)) console.warn(`[validate] draft for unknown persona ${id}`);
    }
  }
}

process.exit(failed ? 1 : 0);
