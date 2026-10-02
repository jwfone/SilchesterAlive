// Harvest a per-persona topic graph via Gemini.
// Usage:
//   npm run bank:generate -- --persona matron --dry-run
//   npm run bank:generate -- --persona matron
//   npm run bank:generate -- --persona all --budget 5
//   npm run bank:generate -- --persona matron --regen food
//   npm run bank:generate -- --persona child --fill --dry-run
//   npm run bank:generate -- --persona child --fill
//
// GEMINI_API_KEY is read from the environment (npm script loads .env).
// Checkpoints live in tmp/dialogue-bank/<id>/ (gitignored).
// Drafts land in dialogue-bank/drafts/<id>.json with reviewed:false.

import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NPC_PERSONAS } from '../.domain-out/domain/npcPersonas.js';
import { GHOST_COSTUMES } from '../.domain-out/domain/ghosts.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
// Try 3.8 first, then step down. A 503 cools that model and the next call uses the next one.
const MODELS = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash'];
const INPUT_PER_M = 0.75;
const OUTPUT_PER_M = 1.5;
const TIMEOUT_MS = 120_000;
// A reservation of 4096+ was refused (503). 3072 was admitted, then the next
// call was refused. 2048 was admitted in the cap probe. Two topics finished
// in about 1700 tokens, so this cap still has room when thinking stays low.
const MAX_OUTPUT_TOKENS = 2048;
const STAGE_A_TOKENS = 8192;
const STAGE_B_TOPICS = 2;
const FILL_BATCH = 2;
const COOL_MS = 45_000;
const MAX_ATTEMPTS = 4;
const SCHEMA_VERSION = 1;
let preferred = MODELS[0];
const coolUntil = new Map();

function parseArgs(argv) {
  const out = { persona: '', dryRun: false, budget: 3, stage: 'all', force: false, regen: '', fill: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i] ?? '';
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--force') out.force = true;
    else if (a === '--persona') out.persona = next();
    else if (a === '--budget') out.budget = Number(next());
    else if (a === '--stage') out.stage = next();
    else if (a === '--regen') out.regen = next();
    else if (a === '--fill') out.fill = true;
    else {
      console.error(`Unknown argument: ${a}`);
      process.exit(1);
    }
  }
  return out;
}

function usage() {
  console.error('Usage: npm run bank:generate -- --persona <id|all> [--dry-run] [--budget 3] [--stage a|b|all] [--force] [--regen nodeId] [--fill]');
}

const DEEP_PER_TOPIC = 2;

const args = parseArgs(process.argv.slice(2));
if (!args.persona) { usage(); process.exit(1); }
if (!['a', 'b', 'all'].includes(args.stage)) { console.error('--stage must be a, b, or all'); process.exit(1); }
if (!Number.isFinite(args.budget) || args.budget <= 0) { console.error('--budget must be a positive number of USD'); process.exit(1); }

const personas = args.persona === 'all'
  ? GHOST_COSTUMES.slice()
  : (GHOST_COSTUMES.includes(args.persona) ? [args.persona] : null);
if (!personas) { console.error(`Unknown persona "${args.persona}". Known: ${GHOST_COSTUMES.join(', ')}`); process.exit(1); }
if (args.regen && personas.length !== 1) { console.error('--regen needs a single --persona'); process.exit(1); }
if (args.regen && args.fill) { console.error('Use either --regen or --fill, not both'); process.exit(1); }

if (!args.dryRun && !process.env.GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY is not set. Add it to .env or the environment. The key is never printed.');
  process.exit(1);
}

let spent = 0;
const modelCounts = new Map();

function noteModel(model) {
  if (!model) return;
  modelCounts.set(model, (modelCounts.get(model) ?? 0) + 1);
}

function dominantModel() {
  let best = MODELS[0];
  let n = -1;
  for (const [model, count] of modelCounts) {
    if (count > n) { best = model; n = count; }
  }
  return best;
}

function estTokens(text) {
  return Math.max(1, Math.ceil(String(text).length / 4));
}

function costOf(input, output, thoughts) {
  return (input / 1e6) * INPUT_PER_M + ((output + thoughts) / 1e6) * OUTPUT_PER_M;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function googleMessage(raw) {
  try {
    const j = JSON.parse(raw);
    return String(j?.error?.message || raw).slice(0, 500);
  } catch {
    return String(raw).slice(0, 500);
  }
}

function extractText(data) {
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const visible = parts.filter((p) => p && !p.thought && typeof p.text === 'string').map((p) => p.text);
  if (visible.length) return visible.join('');
  return parts.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('');
}

function parseModelJson(text) {
  const cleaned = String(text).replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('model response had no JSON object');
  return JSON.parse(cleaned.slice(start, end + 1));
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
}

/** Topic ids stay dot-free. Deep node ids keep a single parent.child dot. */
function slugId(value) {
  const parts = String(value).trim().toLowerCase().split('.');
  const cleaned = parts.map((p) => p.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')).filter(Boolean);
  if (!cleaned.length) return '';
  return cleaned.slice(0, 2).join('.').slice(0, 64);
}

function systemPrompt(p) {
  return [
    `You are ${p.name}, a ${p.role} in Calleva (Silchester) in ${p.era}.`,
    `Home: ${p.home}.`,
    `Voice: ${p.voice}`,
    'Audience: all ages, but may include children 10 or over. Friendly, 40-60 words per reply. Never frightening, gory, romantic, or preachy.',
    'Scope: ONLY your daily life in Silchester and this town. If asked anything else (modern world, other places/times, magic powers, how to harm), refuse briefly in character and redirect to your life.',
    'Realism: speak as if living then, first person. NEVER say archaeologists, historians, museums, evidence, excavations, or that you are AI/a ghost construct. For unsure things use in-world hedging: I heard…, folk say…, as far as I know…',
    `True facts you may use: ${p.facts.join('; ')}.`,
    `You do NOT know: ${p.neverKnows.join('; ')}. Never mention these except to say you have never heard of them.`,
    "British English. Vary sentence openings; do not start replies with 'Ah' or the player's name.",
  ].join('\n');
}

function topicSchema() {
  return {
    type: 'object',
    properties: {
      topics: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            anchor: { type: 'string' },
            intro: { type: 'boolean' },
            leadsTo: { type: 'array', items: { type: 'string' } },
          },
          required: ['id', 'title', 'anchor', 'intro', 'leadsTo'],
        },
      },
    },
    required: ['topics'],
  };
}

function nodeSchema() {
  return {
    type: 'object',
    properties: {
      nodes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            topic: { type: 'string' },
            depth: { type: 'string' },
            ask: { type: 'array', items: { type: 'string' } },
            replies: { type: 'array', items: { type: 'string' } },
            next: { type: 'array', items: { type: 'string' } },
          },
          required: ['id', 'topic', 'depth', 'ask', 'replies', 'next'],
        },
      },
    },
    required: ['nodes'],
  };
}

function greetingSchema() {
  const item = {
    type: 'object',
    properties: {
      reply: { type: 'string' },
      next: { type: 'array', items: { type: 'string' } },
    },
    required: ['reply', 'next'],
  };
  return {
    type: 'object',
    properties: {
      greetings: { type: 'array', items: item },
      returnGreetings: { type: 'array', items: item },
      farewells: { type: 'array', items: { type: 'string' } },
    },
    required: ['greetings', 'returnGreetings', 'farewells'],
  };
}

const STAGE_A_USER = [
  'Plan a conversation map for this character. Return 18-22 topics a curious child might ask about:',
  'your name and work, home, food, family, a normal day, the place and its buildings as you know them,',
  'trade/money, festivals and gods (gently), clothes, animals, tools, weather/seasons, news of your time,',
  'plus 3-4 topics unique to your role.',
  'For each: id (kebab-case), title, one fact anchor drawn ONLY from your facts or plain everyday life of your era,',
  'and leadsTo (3-5 other topic ids that would naturally come up next).',
  'Mark 5-6 as intro (good first questions).',
].join(' ');

function stageBUser(topics, batch, openings) {
  const batchIdSet = new Set(batch.map((t) => t.id));
  const map = topics.map((t) => batchIdSet.has(t.id)
    ? `- ${t.id}: ${t.title}. Anchor: ${t.anchor}. intro=${t.intro}. leadsTo=${t.leadsTo.join(', ')}`
    : `- ${t.id}`).join('\n');
  const used = openings.length ? openings.slice(-80).join(' | ') : '(none yet)';
  const batchIds = batch.map((t) => t.id).join(', ');
  return [
    'Topic map:',
    map,
    '',
    `Openings already used (do not reuse these first four words): ${used}`,
    '',
    `Write dialogue nodes for these topics only: ${batchIds}.`,
    'For EACH topic write: one main node (id = topic id, depth intro if the topic is intro else mid)',
    "and 2 deep follow-up nodes (id = `<topic>.<kebab-slug>`, depth deep) that dig into a detail of the main answer.",
    'Every node has:',
    'ask = 3 different short player questions (under 15 words, plain child-friendly words, addressed to you, never a farewell) that this node answers;',
    'replies = 3 different answers of 40-60 words, each answering ALL of the ask phrasings, different wording and different detail each time, speaking as yourself;',
    "next = 3-5 ids chosen from the topic ids in the map or this topic's own deep nodes.",
    "Deep nodes' first next entry should be the parent topic's sibling deep node or a related topic.",
    'Do not mention anything you do not know.',
  ].join('\n');
}

function greetingUser(persona, introIds) {
  return [
    `Write greetings, return greetings, and farewells for ${persona.name}.`,
    'greetings: 3 lines of 25-45 words that introduce you. The first should echo this curated greeting in spirit:',
    persona.greeting.reply,
    'returnGreetings: 3 lines of 25-45 words that recognise the player coming back.',
    'farewells: 3 lines under 25 words, gentle.',
    `Each greeting and return greeting "next" is 3-4 of these intro topic ids: ${introIds.join(', ')}.`,
  ].join('\n');
}

function cleanAsk(text) {
  let t = String(text).replace(/\s+/g, ' ').trim();
  if (!t || /farewell/i.test(t)) return '';
  const words = t.split(' ');
  if (words.length >= 15) t = words.slice(0, 14).join(' ');
  if (t.length > 120) t = t.slice(0, 120).trim();
  return t;
}

function cleanReply(text) {
  let t = String(text).replace(/\s+/g, ' ').trim();
  if (t.length > 450) {
    const cut = t.slice(0, 450);
    const sp = cut.lastIndexOf(' ');
    t = (sp > 300 ? cut.slice(0, sp) : cut).trim();
  }
  return t;
}

function normaliseTopics(raw) {
  const list = Array.isArray(raw?.topics) ? raw.topics : [];
  const topics = [];
  const seen = new Set();
  for (const item of list) {
    const id = slug(item?.id || item?.title || '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    topics.push({
      id,
      title: String(item?.title || id).trim().slice(0, 80),
      anchor: String(item?.anchor || '').trim().slice(0, 240),
      intro: Boolean(item?.intro),
      leadsTo: Array.isArray(item?.leadsTo) ? item.leadsTo.map((x) => slug(x)).filter(Boolean) : [],
    });
  }
  const ids = new Set(topics.map((t) => t.id));
  for (const t of topics) t.leadsTo = [...new Set(t.leadsTo.filter((id) => ids.has(id) && id !== t.id))].slice(0, 5);
  let intros = topics.filter((t) => t.intro).length;
  for (const t of topics) {
    if (intros >= 5) break;
    if (!t.intro) { t.intro = true; intros++; }
  }
  return topics;
}

function normaliseNodes(raw, topics) {
  const topicIds = new Set(topics.map((t) => t.id));
  const intro = new Set(topics.filter((t) => t.intro).map((t) => t.id));
  const nodes = {};
  const list = Array.isArray(raw?.nodes) ? raw.nodes : [];
  for (const item of list) {
    let id = slugId(item?.id || '');
    let topic = slug(item?.topic || '');
    if (!topic && id.includes('-') === false && topicIds.has(id)) topic = id;
    if (id.includes('.')) {
      const parent = slug(id.split('.')[0]);
      if (!topic) topic = parent;
    }
    if (!topicIds.has(topic)) {
      if (topicIds.has(id)) topic = id;
      else continue;
    }
    if (!id) id = topic;
    if (id === topic) {
      /* main node */
    } else if (!id.startsWith(`${topic}.`)) {
      id = `${topic}.${slug(id)}`;
    }
    const depth = id === topic ? (intro.has(topic) ? 'intro' : 'mid') : 'deep';
    const ask = (Array.isArray(item?.ask) ? item.ask : []).map(cleanAsk).filter(Boolean).slice(0, 3);
    const replies = (Array.isArray(item?.replies) ? item.replies : []).map(cleanReply).filter(Boolean).slice(0, 3);
    if (ask.length === 0 || replies.length === 0) continue;
    const next = (Array.isArray(item?.next) ? item.next : []).map((x) => slugId(x)).filter(Boolean);
    nodes[id] = { id, topic, depth, ask, replies, next, reviewed: false };
  }
  return nodes;
}

function linkFill(nodes, topics) {
  const ids = new Set(Object.keys(nodes));
  const leads = new Map(topics.map((t) => [t.id, (t.leadsTo || []).filter((id) => ids.has(id))]));
  const deepByTopic = new Map();
  for (const n of Object.values(nodes)) {
    if (n.depth !== 'deep') continue;
    const list = deepByTopic.get(n.topic) ?? [];
    list.push(n.id);
    deepByTopic.set(n.topic, list);
  }
  for (const n of Object.values(nodes)) {
    const existing = n.next.filter((id) => ids.has(id) && id !== n.id);
    const extra = [];
    if (n.depth === 'deep') {
      if (ids.has(n.topic)) extra.push(n.topic);
      extra.push(...(deepByTopic.get(n.topic) ?? []));
      extra.push(...(leads.get(n.topic) ?? []));
    } else {
      extra.push(...(deepByTopic.get(n.topic) ?? []));
      extra.push(...(leads.get(n.topic) ?? []));
    }
    const merged = [];
    const seen = new Set();
    for (const id of [...extra, ...existing]) {
      if (!ids.has(id) || id === n.id || seen.has(id)) continue;
      seen.add(id);
      merged.push(id);
      if (merged.length >= 6) break;
    }
    n.next = merged;
  }
  const all = Object.keys(nodes);
  for (const n of Object.values(nodes)) {
    for (const id of all) {
      if (n.next.length >= 3) break;
      if (id !== n.id && !n.next.includes(id)) n.next.push(id);
    }
  }
}

function reachable(nodes, roots) {
  const seen = new Set();
  const stack = roots.filter((id) => nodes[id]);
  while (stack.length) {
    const id = stack.pop();
    if (!id || seen.has(id) || !nodes[id]) continue;
    seen.add(id);
    for (const nxt of nodes[id].next) stack.push(nxt);
  }
  return seen;
}

function repairGreetings(bank) {
  const introIds = Object.values(bank.nodes).filter((n) => n.depth === 'intro').map((n) => n.id);
  const fallback = Object.keys(bank.nodes);
  for (const list of [bank.greetings, bank.returnGreetings]) {
    for (const g of list) {
      g.reply = cleanReply(g.reply);
      g.next = (g.next || []).map((id) => slugId(id)).filter((id) => bank.nodes[id]);
      for (const id of introIds.length ? introIds : fallback) {
        if (g.next.length >= 4) break;
        if (!g.next.includes(id)) g.next.push(id);
      }
      for (const id of fallback) {
        if (g.next.length >= 3) break;
        if (!g.next.includes(id)) g.next.push(id);
      }
    }
  }
  const roots = [];
  for (const g of [...bank.greetings, ...bank.returnGreetings]) roots.push(...g.next);
  let guard = 0;
  while (guard++ < 200) {
    const seen = reachable(bank.nodes, roots);
    const missing = Object.keys(bank.nodes).filter((id) => !seen.has(id));
    if (!missing.length) break;
    const hubs = [...seen].filter((id) => bank.nodes[id]);
    const hub = hubs[0] || roots.find((rid) => bank.nodes[rid]);
    if (!hub) break;
    if (bank.nodes[hub].next.includes(missing[0])) break;
    bank.nodes[hub].next.push(missing[0]);
  }
}

function openingsOf(nodes) {
  const out = [];
  for (const n of Object.values(nodes)) {
    for (const reply of n.replies) {
      const words = reply.split(/\s+/).slice(0, 4).join(' ');
      if (words) out.push(words);
    }
  }
  return out;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function draftPath(id) {
  return join(ROOT, 'dialogue-bank', 'drafts', `${id}.json`);
}

function tmpDir(id) {
  return join(ROOT, 'tmp', 'dialogue-bank', id);
}

function nextBankVersion(id) {
  const path = draftPath(id);
  if (!existsSync(path)) return 1;
  try {
    const prev = readJson(path);
    return (Number(prev.bankVersion) || 0) + 1;
  } catch {
    return 1;
  }
}

async function geminiCall({ apiKey, model, system, user, schema, temperature, maxOutputTokens }) {
  const payload = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      temperature,
      maxOutputTokens: maxOutputTokens ?? MAX_OUTPUT_TOKENS,
      responseMimeType: 'application/json',
      responseSchema: schema,
      thinkingConfig: { thinkingLevel: 'low' },
    },
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: payload,
        signal: ctrl.signal,
      },
    );
    const raw = await res.text();
    return { res, raw, ms: Date.now() - t0, aborted: false };
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    return { res: null, raw: '', ms: Date.now() - t0, aborted };
  } finally {
    clearTimeout(timer);
  }
}

async function generate(label, { system, user, schema, temperature, checkpoint, maxOutputTokens }) {
  if (!args.force && existsSync(checkpoint)) {
    const saved = readJson(checkpoint);
    noteModel(saved.model);
    console.log(`[bank] ${label}: checkpoint`);
    return saved.parsed;
  }
  if (args.dryRun) {
    const input = estTokens(system) + estTokens(user) + 200;
    const output = 5000;
    const est = costOf(input, output, 0);
    spent += est;
    console.log(`[bank] ${label}: dry-run ~${input} in / ~${output} out ~$${est.toFixed(4)}`);
    return null;
  }
  if (spent >= args.budget) {
    throw new Error(`budget $${args.budget.toFixed(2)} reached (spent $${spent.toFixed(4)}) before ${label}`);
  }
  const apiKey = process.env.GEMINI_API_KEY;
  let lastErr = 'no attempt';
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const ranked = () => [preferred, ...MODELS.filter((m) => m !== preferred)]
      .filter((m) => (coolUntil.get(m) ?? 0) <= Date.now());
    let ready = ranked();
    if (!ready.length) {
      const now = Date.now();
      const soonest = Math.min(...MODELS.map((m) => coolUntil.get(m) ?? now));
      const wait = Math.max(1000, Math.min(soonest - now, COOL_MS));
      console.warn(`[bank] ${label}: models cooling, waiting ${wait}ms`);
      await sleep(wait);
      ready = ranked();
    }
    const model = ready[0] ?? preferred;
    const got = await geminiCall({ apiKey, model, system, user, schema, temperature, maxOutputTokens });
    const status = got.res?.status ?? 0;
    if (got.aborted || !got.res) {
      lastErr = got.aborted ? `timeout after ${TIMEOUT_MS}ms` : 'network error';
      console.warn(`[bank] ${label}: ${model} ${lastErr}`);
      coolUntil.set(model, Date.now() + COOL_MS);
      continue;
    }
    if (status === 400) {
      console.error(`[bank] ${label}: ${model} HTTP 400: ${googleMessage(got.raw)}`);
      throw new Error(`${label} rejected (HTTP 400)`);
    }
    if (status === 429 || status === 503 || status >= 500) {
      lastErr = `HTTP ${status}: ${googleMessage(got.raw)}`;
      console.warn(`[bank] ${label}: ${model} ${lastErr}`);
      coolUntil.set(model, Date.now() + COOL_MS);
      if (model === preferred) {
        preferred = MODELS.find((m) => m !== model && (coolUntil.get(m) ?? 0) <= Date.now()) ?? MODELS.find((m) => m !== model) ?? preferred;
      }
      await sleep(10_000);
      continue;
    }
    if (!got.res.ok) {
      lastErr = `HTTP ${status}: ${googleMessage(got.raw)}`;
      console.warn(`[bank] ${label}: ${model} ${lastErr}`);
      coolUntil.set(model, Date.now() + COOL_MS);
      continue;
    }
    let data;
    try { data = JSON.parse(got.raw); } catch { data = {}; }
    const usage = data.usageMetadata ?? {};
    const input = Number(usage.promptTokenCount) || 0;
    const output = Number(usage.candidatesTokenCount) || 0;
    const thoughts = Number(usage.thoughtsTokenCount) || 0;
    const callCost = costOf(input, output, thoughts);
    spent += callCost;
    const finish = data?.candidates?.[0]?.finishReason ?? '';
    console.log(`[bank] ${label}: ${model} ${got.ms}ms in=${input} out=${output} think=${thoughts} finish=${finish} $${callCost.toFixed(4)} total=$${spent.toFixed(4)}`);
    if (finish === 'MAX_TOKENS') {
      lastErr = 'truncated at maxOutputTokens';
      console.warn(`[bank] ${label}: ${model} ${lastErr}`);
      continue;
    }
    let parsed;
    try {
      parsed = parseModelJson(extractText(data));
    } catch (err) {
      lastErr = `bad json: ${err.message}`;
      console.warn(`[bank] ${label}: ${lastErr}`);
      continue;
    }
    preferred = model;
    mkdirSync(dirname(checkpoint), { recursive: true });
    writeFileSync(checkpoint, JSON.stringify({ model, parsed, usage: { input, output, thoughts }, cost: callCost }, null, 2));
    noteModel(model);
    return parsed;
  }
  throw new Error(`${label} failed: ${lastErr}`);
}

function estimateDry(persona) {
  const sys = systemPrompt(persona);
  const calls = [
    ['stage A', sys.length + STAGE_A_USER.length],
    ...Array.from({ length: 5 }, () => ['stage B', sys.length + 2500]),
    ['greetings', sys.length + 800],
  ];
  let total = 0;
  for (const [label, chars] of calls) {
    const input = estTokens('x'.repeat(chars));
    const est = costOf(input, 5000, 0);
    total += est;
    console.log(`[bank] ${persona.id} ${label}: dry-run ~${input} in / ~5000 out ~$${est.toFixed(4)}`);
  }
  return total;
}

function topicsFromDraft(nodes) {
  const topics = new Map();
  for (const n of Object.values(nodes)) {
    if (!topics.has(n.topic)) {
      topics.set(n.topic, { id: n.topic, title: n.topic, anchor: '', intro: n.depth === 'intro', leadsTo: [] });
    }
    if (n.depth === 'intro') topics.get(n.topic).intro = true;
  }
  for (const n of Object.values(nodes)) {
    if (n.depth === 'deep') continue;
    const t = topics.get(n.topic);
    if (!t) continue;
    t.leadsTo = n.next.filter((id) => topics.has(id) && id !== n.topic).slice(0, 5);
  }
  return [...topics.values()];
}

function loadTopics(id, nodes) {
  const path = join(tmpDir(id), 'stage-a.json');
  if (existsSync(path)) {
    try { return normaliseTopics(readJson(path).parsed); } catch { /* fall through */ }
  }
  return topicsFromDraft(nodes || {});
}

/** Stage-A topics plus any topic that already has a node in the draft. */
function topicsForFill(id, nodes) {
  const byId = new Map(loadTopics(id, nodes).map((t) => [t.id, t]));
  for (const t of topicsFromDraft(nodes)) {
    if (!byId.has(t.id)) byId.set(t.id, t);
  }
  return [...byId.values()];
}

/** Topics that already have a main line but fewer than DEEP_PER_TOPIC follow-ups. */
function thinTopics(topics, nodes) {
  const thin = [];
  for (const topic of topics) {
    if (!nodes[topic.id]) continue;
    const existing = Object.values(nodes).filter((n) => n.topic === topic.id && n.id !== topic.id);
    const need = DEEP_PER_TOPIC - existing.length;
    if (need > 0) thin.push({ topic, need, existing, parent: nodes[topic.id] });
  }
  thin.sort((a, b) => a.topic.id.localeCompare(b.topic.id));
  return thin;
}

function fillUser(topics, batch, openings) {
  const map = topics.map((t) => `- ${t.id}: ${t.title}. Anchor: ${t.anchor}.`).join('\n');
  const used = openings.length ? openings.slice(-80).join(' | ') : '(none yet)';
  const jobs = batch.map(({ topic, need, existing, parent }) => {
    const lines = [
      `Topic ${topic.id}: write exactly ${need} NEW deep follow-up node(s).`,
      'Do not write the main node again.',
      `Main answer to dig into: ${(parent?.replies || []).join(' / ') || '(none)'}`,
      existing.length
        ? `Already written (do not reuse these ids or questions): ${existing.map((n) => `${n.id}: ${(n.ask || []).join(' | ')}`).join('; ')}`
        : 'No follow-ups exist yet.',
    ];
    return lines.join('\n');
  }).join('\n\n');
  return [
    'Topic map:',
    map,
    '',
    `Openings already used (do not reuse these first four words): ${used}`,
    '',
    'The main answer for each topic below already exists. Add only the missing closer questions.',
    'Each new node must dig into one concrete detail of that topic, not repeat the main answer.',
    'id = `<topic>.<new-kebab-slug>`, depth deep. The slug must not match an existing id.',
    'ask = 3 different short player questions (under 15 words, plain child-friendly words, never a farewell).',
    'replies = 3 different answers of 40-60 words, each answering ALL of the ask phrasings.',
    "next = 3-5 ids: the parent topic id, any sibling deep ids you are writing, and related topic ids from the map.",
    jobs,
  ].join('\n');
}

function acceptFilledNodes(parsed, topics, nodes, needByTopic) {
  const fresh = normaliseNodes(parsed, topics);
  const added = [];
  for (const node of Object.values(fresh)) {
    if (node.depth !== 'deep') continue;
    const need = needByTopic.get(node.topic);
    if (!need || need <= 0) continue;
    if (nodes[node.id]) continue;
    if (node.ask.length < 2 || node.replies.length < 2) continue;
    nodes[node.id] = node;
    needByTopic.set(node.topic, need - 1);
    added.push(node.id);
  }
  return added;
}

async function writeDraft(id, persona, topics, nodes, greetingsRaw) {
  const introIds = topics.filter((t) => t.intro).map((t) => t.id);
  linkFill(nodes, topics);
  const greetings = (greetingsRaw?.greetings || []).slice(0, 3).map((g) => ({
    reply: String(g.reply || '').trim(),
    next: Array.isArray(g.next) ? g.next.map((x) => slugId(x)) : introIds.slice(0, 4),
  })).filter((g) => g.reply);
  const returnGreetings = (greetingsRaw?.returnGreetings || []).slice(0, 3).map((g) => ({
    reply: String(g.reply || '').trim(),
    next: Array.isArray(g.next) ? g.next.map((x) => slugId(x)) : introIds.slice(0, 4),
  })).filter((g) => g.reply);
  const farewells = (greetingsRaw?.farewells || []).map((f) => String(f).trim()).filter(Boolean).slice(0, 3);
  const bank = {
    schemaVersion: SCHEMA_VERSION,
    personaId: id,
    bankVersion: nextBankVersion(id),
    generatedAt: new Date().toISOString(),
    model: dominantModel(),
    greetings,
    returnGreetings,
    farewells,
    nodes,
  };
  repairGreetings(bank);
  const dest = draftPath(id);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, JSON.stringify(bank, null, 2));
  console.log(`[bank] ${id}: wrote ${dest} (${Object.keys(nodes).length} nodes, v${bank.bankVersion})`);
  return bank;
}

async function fillPersona(id, persona, system, dir) {
  const path = draftPath(id);
  if (!existsSync(path)) throw new Error(`no draft to fill: ${path}`);
  const draft = readJson(path);
  if (!draft.nodes || typeof draft.nodes !== 'object') throw new Error(`${id} draft has no nodes`);
  const topics = topicsForFill(id, draft.nodes);
  const thin = thinTopics(topics, draft.nodes);
  const missing = thin.reduce((sum, item) => sum + item.need, 0);
  console.log(`[bank] ${id} fill: ${thin.length} topics need ${missing} follow-ups`);
  if (!thin.length) return;

  if (args.dryRun) {
    for (let i = 0; i < thin.length; i += FILL_BATCH) {
      const batch = thin.slice(i, i + FILL_BATCH);
      const user = fillUser(topics, batch, openingsOf(draft.nodes));
      const input = estTokens(system) + estTokens(user) + 200;
      const est = costOf(input, 4000, 0);
      spent += est;
      console.log(`[bank] ${id} fill ${batch.map((b) => b.topic.id).join(',')}: dry-run ~${input} in / ~4000 out ~$${est.toFixed(4)}`);
    }
    return;
  }

  const needByTopic = new Map(thin.map((item) => [item.topic.id, item.need]));
  const added = [];
  for (let i = 0; i < thin.length; i += FILL_BATCH) {
    const batch = thin.slice(i, i + FILL_BATCH);
    const key = batch.map((b) => b.topic.id).join('_').slice(0, 80);
    const checkpoint = join(dir, `fill-${key}.json`);
    const call = () => generate(`${id} fill ${key}`, {
      system,
      user: fillUser(topics, batch, openingsOf(draft.nodes)),
      schema: nodeSchema(),
      temperature: 0.9,
      checkpoint,
    });
    let ids = acceptFilledNodes(await call(), topics, draft.nodes, needByTopic);
    if (ids.length) saveFilled(id, path, draft);
    const short = batch.some((item) => (needByTopic.get(item.topic.id) ?? 0) > 0);
    if (short) {
      // A saved reply that did not yield enough lines must not be replayed forever.
      try { unlinkSync(checkpoint); } catch { /* already gone */ }
      const more = acceptFilledNodes(await call(), topics, draft.nodes, needByTopic);
      ids = ids.concat(more);
      if (more.length) saveFilled(id, path, draft);
    }
    added.push(...ids);
    for (const item of batch) {
      const left = needByTopic.get(item.topic.id) ?? 0;
      if (left > 0) console.warn(`[bank] ${id} ${item.topic.id}: still missing ${left} follow-up(s)`);
    }
  }
  if (!added.length) {
    console.log(`[bank] ${id} fill: no new nodes accepted`);
    return;
  }
  console.log(`[bank] ${id} fill: added ${added.length} nodes (${Object.keys(draft.nodes).length} total, v${draft.bankVersion})`);
}

function saveFilled(id, path, draft) {
  const topics = topicsForFill(id, draft.nodes);
  linkFill(draft.nodes, topics);
  repairGreetings(draft);
  draft.bankVersion = nextBankVersion(id);
  draft.generatedAt = new Date().toISOString();
  draft.model = dominantModel();
  writeFileSync(path, JSON.stringify(draft, null, 2));
  console.log(`[bank] ${id} fill: saved ${Object.keys(draft.nodes).length} nodes, v${draft.bankVersion}`);
}

async function runPersona(id) {
  const persona = NPC_PERSONAS[id];
  if (!persona) throw new Error(`no persona ${id}`);
  const dir = tmpDir(id);
  mkdirSync(dir, { recursive: true });
  const system = systemPrompt(persona);
  modelCounts.clear();

  if (args.fill) {
    await fillPersona(id, persona, system, dir);
    return;
  }

  if (args.dryRun && !args.regen) {
    const est = estimateDry(persona);
    spent += est;
    console.log(`[bank] ${id} dry-run total ~$${est.toFixed(4)}`);
    return;
  }

  if (args.regen) {
    const path = draftPath(id);
    if (!existsSync(path)) throw new Error(`no draft to regen: ${path}`);
    const draft = readJson(path);
    const current = draft.nodes?.[args.regen];
    if (!current) throw new Error(`node ${args.regen} not in draft`);
    const topics = loadTopics(id, draft.nodes);
    const user = [
      stageBUser(topics, topics.filter((t) => t.id === current.topic).slice(0, 1).length
        ? topics.filter((t) => t.id === current.topic)
        : [{ id: current.topic, title: current.topic, anchor: '', intro: current.depth === 'intro', leadsTo: [] }],
      openingsOf(draft.nodes)),
      '',
      `Rewrite ONLY the node id "${args.regen}" (topic ${current.topic}, depth ${current.depth}).`,
      'Write a fresher version; avoid these current replies:',
      ...(current.replies || []).map((r) => `- ${r}`),
    ].join('\n');
    const parsed = await generate(`${id} regen ${args.regen}`, {
      system, user, schema: nodeSchema(), temperature: 0.9,
      checkpoint: join(dir, `regen-${slug(args.regen)}-${Date.now()}.json`),
    });
    const fresh = normaliseNodes(parsed, topics.length ? topics : [{ id: current.topic, title: current.topic, intro: false, leadsTo: [], anchor: '' }]);
    const replacement = fresh[args.regen] || Object.values(fresh)[0];
    if (!replacement) throw new Error('regen returned no node');
    replacement.id = args.regen;
    replacement.topic = current.topic;
    replacement.depth = current.depth;
    replacement.reviewed = false;
    draft.nodes[args.regen] = replacement;
    draft.model = dominantModel();
    draft.generatedAt = new Date().toISOString();
    linkFill(draft.nodes, topics);
    repairGreetings(draft);
    writeFileSync(path, JSON.stringify(draft, null, 2));
    console.log(`[bank] ${id}: regenerated ${args.regen}`);
    return;
  }

  let topics = [];
  if (args.stage === 'a' || args.stage === 'all') {
    const parsed = await generate(`${id} stage A`, {
      system, user: STAGE_A_USER, schema: topicSchema(), temperature: 0.7,
      maxOutputTokens: STAGE_A_TOKENS,
      checkpoint: join(dir, 'stage-a.json'),
    });
    if (!args.dryRun) {
      topics = normaliseTopics(parsed);
      console.log(`[bank] ${id}: ${topics.length} topics (${topics.filter((t) => t.intro).length} intro)`);
    }
  } else {
    topics = loadTopics(id, {});
    if (!topics.length) throw new Error(`${id}: no stage A checkpoint. Run --stage a first.`);
  }
  if (args.stage === 'a') return;

  const nodes = {};
  if (!args.dryRun) {
    let covered = 0;
    for (let b = 0; ; b++) {
      const legacyPath = join(dir, `stage-b-${b}.json`);
      if (!existsSync(legacyPath)) break;
      const start = b * 4;
      if (start >= topics.length) break;
      Object.assign(nodes, normaliseNodes(readJson(legacyPath).parsed, topics));
      covered = Math.min(topics.length, start + 4);
      console.log(`[bank] ${id} stage B ${b + 1}: checkpoint`);
    }
    for (let i = covered; i < topics.length; i += STAGE_B_TOPICS) {
      const batch = topics.slice(i, i + STAGE_B_TOPICS);
      const parsed = await generate(`${id} stage B ${i}`, {
        system,
        user: stageBUser(topics, batch, openingsOf(nodes)),
        schema: nodeSchema(),
        temperature: 0.9,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        checkpoint: join(dir, `stage-b-s${i}.json`),
      });
      Object.assign(nodes, normaliseNodes(parsed, topics));
    }
    console.log(`[bank] ${id}: ${Object.keys(nodes).length} nodes before link fill`);
  } else {
    for (let i = 0; i < 5; i++) {
      await generate(`${id} stage B ${i + 1}`, {
        system, user: stageBUser([{ id: 'food', title: 'Food', anchor: 'bread', intro: true, leadsTo: [] }], [{ id: 'food', title: 'Food', anchor: 'bread', intro: true, leadsTo: [] }], []),
        schema: nodeSchema(), temperature: 0.9, checkpoint: join(dir, `stage-b-${i}.json`),
      });
    }
  }

  const introIds = (topics.filter((t) => t.intro).map((t) => t.id)).slice(0, 8);
  const greetings = await generate(`${id} greetings`, {
    system,
    user: greetingUser(persona, introIds.length ? introIds : ['home']),
    schema: greetingSchema(),
    temperature: 0.9,
    checkpoint: join(dir, 'stage-greet.json'),
  });
  if (args.dryRun) return;
  await writeDraft(id, persona, topics, nodes, greetings);
}

let grand = 0;
try {
  for (const id of personas) {
    const before = spent;
    await runPersona(id);
    const delta = spent - before;
    grand += delta;
    console.log(`[bank] ${id} persona cost $${delta.toFixed(4)}`);
  }
  console.log(`[bank] grand total $${grand.toFixed(4)} (budget $${args.budget.toFixed(2)})`);
} catch (err) {
  console.error(`[bank] stopped: ${err.message}`);
  console.error(`[bank] spent so far $${spent.toFixed(4)}. Re-run to resume from checkpoints.`);
  process.exit(1);
}
