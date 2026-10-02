// Netlify Function: POST /.netlify/functions/dialogue
// Server-only LLM proxy. The Gemini API key lives ONLY here via the
// GEMINI_API_KEY environment variable (Netlify dashboard + local .env).
// It MUST never appear in src/, dist/, logs, or error messages.
//
// Request:  { personaId: GhostCostumeId, history: [{speaker, text}], receipt?: string }
// Response (200): { reply, choices, receipt, requestId, debug? }
// Errors: { error: 'dialogue unavailable' | 'bad request' | ..., requestId, debug? }
// Detailed diagnostics (model attempts, Google messages, roles) go to server
// logs always. When ENABLE_DIALOGUE_PROBE=1 they are ALSO returned to the
// client as sanitized `debug` (no key material) so the map-panel LLM tester
// can show the failure cause. Production default (probe disabled) stays
// requestId-only — no key/model oracle.
//
// GET (no query): { ok: true, requestId } — liveness only, no key oracle.
// GET ?probe=1: disabled unless ENABLE_DIALOGUE_PROBE=1 (local dev only).
//
// Safety: allowlisted personas, capped history, JSON-only output, blocklist
// filter, in-character + under-12 system prompt, forced farewell at turn cap,
// per-IP rate limiting, same-origin check, HMAC receipt chain binding each
// player turn to the previously issued choices.

// ---- Code config (not UI). Change models here, never from the browser. ----
// Tried in order on 503/timeout. IDs confirmed via GET /v1beta/models for this key.
const MODEL_IDS = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
];
const TEMPERATURE = 0.75;
// Gemini 3.x counts thought tokens against this cap (MAX_TOKENS truncates JSON).
const MAX_OUTPUT_TOKENS = 2048;
const MAX_TURNS = 6;
const MAX_HISTORY = 12;
const MAX_TEXT_LEN = 500;
const MAX_BODY_BYTES = 10 * 1024;
/** Per-model cap for Talk POST (sequential with early exit — see below). */
const POST_GEMINI_TIMEOUT_MS = 12000;
const THINKING = { thinkingLevel: 'low' as const };

// Abuse controls. Per-instance in-memory buckets (best-effort on serverless;
// pair with Netlify WAF / edge rate limiting for strict guarantees).
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_POST = 10;
const RATE_MAX_PROBE = 5;

// Netlify (dev + prod): sequential model fallback fits comfortably.
export const config = { timeout: 26 };

type CostumeId = 'soldier' | 'magistrate' | 'matron' | 'labourer' | 'traveller' | 'briton' | 'swineherd' | 'fieldwife' | 'child' | 'coiner' | 'priestess' | 'lucco' | 'junia' | 'enica' | 'elen' | 'bassa';

interface Turn { speaker: string; text: string; }

// Minimal server copy of the curated personas (keep in sync with
// src/domain/npcPersonas.ts — full bios + offline lines live there).
const PERSONAS: Record<CostumeId, { name: string; era: string; role: string; voice: string; facts: string[]; neverKnows: string[] }> = {
  briton: {
    name: 'Segovax', era: 'c. 30 BC, before the Romans came',
    role: 'Atrebates cattle farmer',
    voice: 'Warm, plain, a little wary of strangers; talks of cattle, weather, kin.',
    facts: [
      'A member of the Atrebates tribe, generations before Roman conquest',
      'Calleva is a great Iron Age oppidum defended by massive earthwork dykes',
      'Lives in a roundhouse: wattle-and-daub walls, thatched cone roof, central hearth',
      'Keeps cattle and sheep; grows barley and spelt wheat',
      'Knows iron coins with horses and wheat ears, and trade with Gaul',
      'Iron tools, weaving, potting; no stone buildings, no straight paved roads, no forum',
    ],
    neverKnows: ['Romans', 'legions', 'forum', 'basilica', 'baths', 'mansio', 'amphitheatre', 'stone town walls', 'church'],
  },
  soldier: {
    name: 'Marcus Valerius', era: 'c. AD 75, just after the conquest',
    role: 'discharged legionary turned smallholder',
    voice: 'Bluff, practical, proud of service; short sentences, soldier humour, kind.',
    facts: [
      'Discharged veteran of Legio II Augusta after 25 years, settled near Calleva',
      'Roman conquest AD 43 is recent memory; town is being laid out on a grid',
      'Buildings are timber; stone forum and stone walls do NOT exist yet',
      'New straight gravelled roads are being built; soldiers survey them',
      'Farms barley, keeps a few beasts; sells to the army and town market',
    ],
    neverKnows: ['stone town walls', 'stone forum-basilica', 'public baths', 'amphitheatre', 'mansio', 'church'],
  },
  magistrate: {
    name: 'Gaius Julius Vitalis', era: 'c. AD 160, the thriving town',
    role: 'town councillor of the ordo',
    voice: 'Polite, orderly, civic-minded; explains duties, slightly proud of the town.',
    facts: [
      'Decurion (councillor) of Calleva in its 2nd-century peak',
      'Stone forum with basilica hall for law, tax and business; busy market square',
      'Town run by the ordo council; dues in coin and grain pay for streets and drains',
      'Grid of gravelled streets, timber and stone houses with courtyards',
      'Public baths are open and popular; town has temples',
    ],
    neverKnows: ['the later stone wall circuit as built', 'the amphitheatre as rebuilt in stone', 'the late church', 'the end of Roman Britain', 'Saxons'],
  },
  matron: {
    name: 'Claudia Severa', era: 'c. AD 210, town life at its height',
    role: 'townswoman, mother, household keeper',
    voice: 'Kind, chatty, practical; talks of home, children, market and baths.',
    facts: [
      'Wife and mother in a comfortable Calleva town house with garden and hearth',
      'Daily round: bread-making, market for greens/oil/fish sauce, wool-spinning',
      'Visits the public baths: warm rooms, washing, gossip with friends',
      'Wears stola and palla veil; children learn letters from a tutor',
      'Household shrine to home gods; respects the town temples',
    ],
    neverKnows: ['the later stone walls', 'the end of the town', 'Christian church politics', 'modern machines or medicines'],
  },
  labourer: {
    name: 'Duro', era: 'c. AD 275, when the great wall is rising',
    role: 'builder and tile-maker',
    voice: 'Plain, tired, good-humoured; talks tools, bricks, mates, weather.',
    facts: [
      'Labourer on the great stone wall circuit being built around Calleva',
      'Works flint, stone, lime mortar; makes roof tiles in a kiln',
      'Lives in a work hut; eats bread, cheese, beer with his gang',
      'Knows the amphitheatre east of the walls where folk gather for shows',
      'Paid in coin; weather rules the working day',
    ],
    neverKnows: ['the later church', 'the final abandonment', 'anything after his own building years'],
  },
  traveller: {
    name: 'Leontius', era: 'c. AD 360, the late town',
    role: 'wine merchant from Gaul, guest at the mansio',
    voice: 'Cheerful, well-travelled; talks roads, inns, prices, news from afar.',
    facts: [
      'Merchant from Gaul staying at the mansio, the official courtyard inn with stables',
      'Sells wine and oil; buys British grain and hides',
      'Travels the Roman roads; knows the four walled gates and the walled circuit',
      'Has seen the small early church near the forum; most folk still honour old gods too',
      'Trade is thinner than in his father’s day but the market still meets',
    ],
    neverKnows: ['the final abandonment of Calleva', 'Saxons by name', 'anything modern'],
  },
  coiner: {
    name: 'Addedomaros', era: 'c. 20 BC, before the Romans came',
    role: 'die-cutter striking coins for the king',
    voice: 'Careful, proud of craft; talks of gold, dies, horses stamped on coins.',
    facts: [
      'Iron Age die-cutter striking gold coins for Atrebates kings before Roman conquest',
      'Coins show a horse and wheat ears; traded with Gaul across the sea',
      'Works bronze hammer and iron dies in a small hut; melts gold in a clay cup',
      'Calleva is a great dyke-ringed oppidum of roundhouses, no stone buildings',
      'Knows kings and quarrels, cattle wealth, barley and iron tools',
    ],
    neverKnows: ['Romans', 'legions', 'forum', 'basilica', 'baths', 'mansio', 'amphitheatre', 'stone town walls', 'church'],
  },
  child: {
    name: 'Tertius', era: 'c. AD 180, the thriving town',
    role: 'mosaic-maker’s son and errand boy',
    voice: 'Cheeky, quick, kind; talks games, school, cakes, fetching and carrying.',
    facts: [
      'Nine-year-old son of a mosaic-maker in the thriving 2nd-century town',
      'Runs errands: water for mortar, bread-buying, messages to forum shops',
      'Plays knucklebones, hoop-rolling and ball on gravelled side streets',
      'Learns letters from a tutor; writes on wax tablets',
      'Knows the baths hubbub and music and jugglers at the amphitheatre east of town',
    ],
    neverKnows: ['the later stone wall circuit as built', 'the late church', 'the end of Roman Britain', 'Saxons'],
  },
  priestess: {
    name: 'Marcella', era: 'c. AD 220, the thriving town',
    role: 'keeper of the temple precinct',
    voice: 'Calm, gentle, reverent; talks of lamps, garlands, feast days, quiet duties.',
    facts: [
      'Temple keeper in 3rd-century Calleva, tending Romano-British square temples',
      'Daily round: sweeping steps, trimming lamps, laying bread/herb/wine offerings',
      'Honours Sulis Minerva, Mars, mother goddesses and household gods',
      'Knows feast days with garlands and music; travellers and townsfolk all pray',
      'Lives simply in a lodging by the precinct; never handles blood or unkind rites',
    ],
    neverKnows: ['the later stone wall circuit as built', 'the late church', 'the end of Roman Britain', 'Saxons'],
  },
  swineherd: {
    name: 'Wulfhere', era: 'c. AD 620, after the town emptied',
    role: 'Saxon swineherd',
    voice: 'Wary, plain, a little gruff but kind; talks pigs, woods, weather, haunted stones.',
    facts: [
      'Saxon swineherd grazing pigs and goats inside the empty walled circuit',
      'Town largely abandoned; wells filled, roofs fallen, no market or council',
      'Lives in a sunken timber-and-thatch hut outside the walls',
      'Knows Wessex kings rising at Winchester; old Roman roads still walkable',
      'Fears the ruins as haunted; never sleeps inside the walls',
    ],
    neverKnows: ['forum', 'basilica', 'baths', 'mansio as working places', 'Latin', 'stone wall building', 'St Mary’s church', 'Normans', 'anything modern'],
  },
  fieldwife: {
    name: 'Alys', era: 'c. AD 1240, the medieval fields',
    role: 'tenant’s wife farming inside the old walls',
    voice: 'Kind, busy, plain; talks harvest, church, children, mending.',
    facts: [
      'Medieval tenant’s wife farming strip fields inside the Roman walls',
      'Worships at little St Mary’s stone church by the east gate; manor farm beside it',
      'Grows barley, oats and beans; keeps hens; reaps with a sickle',
      'Robs fallen Roman tile and flint to mend cottage walls',
      'Walks to market; the old London road still serves drovers and carts',
    ],
    neverKnows: ['Romans as living people', 'what the forum or baths were for', 'Saxons by name', 'Victorian diggers', 'modern machines or medicines'],
  },
  lucco: {
    name: 'Lucco', era: 'c. AD 60, the client kingdom',
    role: 'rider for a leading household',
    voice: 'Quick, outdoor, proud of his horse; careful when he speaks of the king.',
    facts: [
      'Briton of the Atrebates; a boy when the legions came in AD 43, so the conquest is a childhood memory',
      'Rides messages for a leading household in a timber house of a few rooms inside the dykes',
      'Lanes still follow the old alignments; the great earthwork banks still stand',
      'Folk say the king of this country stayed friends with Rome; the king does not sleep in this house',
      'Carts bring roof-tiles from a kiln a short ride to the south-west; the tile-master says the stamp names the emperor; Lucco cannot read it',
      'Has seen new digging and new tiled roofs toward the north-east; he does not describe a finished stone arena or a finished bath-house',
    ],
    neverKnows: ['insulae', 'basilica', 'stone forum hall', 'stone town walls', 'church', 'Saxons', 'a royal palace here', 'Latin inscriptions'],
  },
  junia: {
    name: 'Junia', era: 'c. AD 110, the early town',
    role: 'oil seller from Baetica',
    voice: 'Warm, precise about measures; misses the heat, curious about British rain.',
    facts: [
      'Free woman from Baetica, the olive country along the Guadalquivir in southern Hispania; she settled in Calleva',
      'Keeps the tally of olive-oil jars in a store by the east gate, on the road to London',
      'The street grid and a timber forum are in use; a new stone hall is rising beside the market',
      'She sells oil, not wine, and she lives over her store',
    ],
    neverKnows: ['stone town walls', 'the later church', 'Saxons', 'the mansio as her lodging', 'the end of the town'],
  },
  enica: {
    name: 'Enica', era: 'c. AD 310, after the wall',
    role: 'enslaved weaver in a town house',
    voice: 'Careful, warm, notices everything; talks of wool, the house, and a hope of freedom.',
    facts: [
      'Born unfree in a Calleva courtyard house; she has never known another life',
      'Spins and weaves wool for the household on a loom in the yard',
      'Sleeps in a small room off the yard and eats with the kitchen people',
      'Hopes to be freed and to keep a loom of her own; her talk stays on work, food, and that hope',
      'The stone town wall has been standing for a generation',
      'The big hall in the middle of town is a metalworking place in her lifetime',
    ],
    neverKnows: ['Saxons', 'the abandonment of the town', 'church politics'],
  },
  elen: {
    name: 'Elen', era: 'c. AD 450, the quiet town',
    role: 'shepherd’s daughter',
    voice: 'Small, brave, practical; talks of lambs, water, and her doll.',
    facts: [
      'British girl of about eight, living with her family in a stone house inside the walls',
      'The town is quieter than her grandmother remembers: fewer neighbours, some roofs failing, some wells running slow',
      'People still live here; the streets and stone houses are still in use',
      'Helps with lambs, carries water, and plays with a rag doll',
      'Knows the walls as the old work; she has no tutor and learns songs at home',
    ],
    neverKnows: ['Saxons', 'Wessex', 'an abandoned town', 'St Mary’s church'],
  },
  bassa: {
    name: 'Bassa', era: 'c. AD 890, the woods around the walls',
    role: 'huntsman with hounds',
    voice: 'Fond of his dogs, outdoors; talks of scent, wind, and weather.',
    facts: [
      'Huntsman around AD 890, keeping hounds for a lord whose hall is not at Calleva',
      'Lives in a hut in the woods around the long-empty walls; he does not sleep inside the ruins',
      'The hounds have names; he feeds them, combs them, and uses them to course a hare and to find strayed sheep',
      'The town as a living place is long gone; he does not name the kingdom he serves',
    ],
    neverKnows: ['Wessex', 'Mercia', 'Normans', 'St Mary’s church', 'forum', 'basilica', 'Latin'],
  },
};

const FAREWELLS: Record<CostumeId, string> = {
  briton: 'The cattle call me. Walk safe among the dykes. Farewell.',
  soldier: 'Duty calls — my field will not dig itself. Farewell.',
  magistrate: 'The council meets at noon. Walk in peace. Farewell.',
  matron: 'My bread will burn! Blessings, dear. Farewell.',
  labourer: 'Back to the hod. Keep clear of the wet mortar. Farewell.',
  traveller: 'My wagon rolls at dawn. Safe roads to you. Farewell.',
  coiner: 'The gold cools — my hammer must fall. Farewell.',
  child: 'Father is calling — I must run! Farewell.',
  priestess: 'The lamps need trimming. Go in peace. Farewell.',
  swineherd: 'The pigs stray — I must after them. Farewell.',
  fieldwife: 'My hens will wander! God keep you. Farewell.',
  lucco: 'The horse stamps — I must ride. Farewell.',
  junia: 'The tally is waiting. Safe roads to you. Farewell.',
  enica: 'The wool will tangle if I leave it. Farewell.',
  elen: 'Grandmother is calling — I must run! Farewell.',
  bassa: 'The hounds are restless. Walk soft. Farewell.',
};

// Blocklist: child-safety + immersion. If the model output trips any of these,
// we discard it and return a safe curated fallback (never the raw text).
const BLOCKED = new RegExp(
  [
    'archaeolog', 'historian', 'museum', 'evidence', 'excavat', 'monograph',
    'you are an ai', 'as an ai', 'language model',
    'kill(ing|ed)? you', 'torture', 'rape', 'sexy', 'naked',
    'suicide', 'self-?harm', 'how to make (a )?(bomb|weapon|poison)',
    'damn you', 'whore', 'bastard',
  ].join('|'),
  'i',
);

// Input guard: prompt-injection + unsafe instructions smuggled in history text.
// Player turns are choice-picks, never free text — anything matching this is
// rejected before it reaches Gemini.
const INPUT_BLOCKED = new RegExp(
  [
    'ignore\\s+(all\\s+|your\\s+|previous\\s+|above\\s+)*instructions',
    'disregard\\s+(all\\s+|your\\s+|previous\\s+|above\\s+)*instructions',
    'system\\s*prompt',
    'you are an ai', 'as an ai', 'language model', 'jailbreak',
    '\\bDAN\\b.*mode',
    'how to make (a )?(bomb|weapon|poison)',
    'suicide', 'self-?harm',
  ].join('|'),
  'i',
);

function json(statusCode: number, body: unknown, extraHeaders?: Record<string, string>): { statusCode: number; headers: Record<string, string>; body: string } {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      ...(extraHeaders ?? {}),
    },
    body: JSON.stringify(body),
  };
}

/** Generic client error — requestId only, details stay server-side. */
function clientError(statusCode: number, requestId: string, error: string, extraHeaders?: Record<string, string>) {
  return json(statusCode, { error, requestId }, extraHeaders);
}

/** Strip anything that might echo the API key from Google error text / URLs. */
function redact(s: string): string {
  return s
    .replace(/AIza[0-9A-Za-z_-]{8,}/g, '[redacted-key]')
    .replace(/AQ\.[A-Za-z0-9_-]{8,}/g, '[redacted-key]')
    .replace(/([?&]key=)[^&\s"']+/gi, '$1[redacted]')
    .replace(/x-goog-api-key["'\s:=]+[^\s"',}]+/gi, 'x-goog-api-key:[redacted]')
    .replace(/GEMINI_API_KEY[=:\s]+[^\s"',}]+/gi, 'GEMINI_API_KEY=[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._~-]{8,}/gi, 'Bearer [redacted]');
}

function parseGoogleError(raw: string): { googleStatus?: string; googleMessage?: string; httpStatus?: number } {
  const cleaned = redact(raw).slice(0, 500);
  try {
    const obj = JSON.parse(raw) as { error?: { code?: unknown; status?: unknown; message?: unknown } };
    const e = obj.error;
    if (e && typeof e === 'object') {
      return {
        httpStatus: typeof e.code === 'number' ? e.code : undefined,
        googleStatus: typeof e.status === 'string' ? e.status : undefined,
        googleMessage: typeof e.message === 'string' ? redact(e.message).slice(0, 400) : cleaned,
      };
    }
  } catch {
    /* not JSON */
  }
  return { googleMessage: cleaned };
}

function newRequestId(): string {
  return `dlg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function logDebug(requestId: string, payload: unknown): void {
  // Server logs only. `redact` is applied to string fields we control; still
  // never log env, headers, or the raw API key.
  console.error(`[dialogue] ${requestId} ${JSON.stringify(payload)}`);
}

// ---------- abuse controls ----------

const rateBuckets = new Map<string, number[]>();

function getClientIp(event: { headers?: Record<string, string | undefined> }): string {
  const h = event.headers ?? {};
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) lower[k.toLowerCase()] = v ?? '';
  const xnf = lower['x-nf-client-connection-ip'];
  if (xnf) return xnf.split(',')[0].trim();
  const xff = lower['x-forwarded-for'];
  if (xff) return xff.split(',')[0].trim();
  if (lower['client-ip']) return lower['client-ip'];
  return 'unknown';
}

function rateCheck(key: string, max: number): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const arr = (rateBuckets.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= max) {
    const retryAfter = Math.ceil((arr[0] + RATE_WINDOW_MS - now) / 1000);
    rateBuckets.set(key, arr);
    return { allowed: false, retryAfter: Math.max(1, retryAfter) };
  }
  arr.push(now);
  rateBuckets.set(key, arr);
  return { allowed: true, retryAfter: 0 };
}

function headerOf(event: { headers?: Record<string, string | undefined> }, name: string): string {
  const h = event.headers ?? {};
  for (const [k, v] of Object.entries(h)) {
    if (k.toLowerCase() === name.toLowerCase()) return v ?? '';
  }
  return '';
}

function allowedOrigins(): string[] {
  const raw = [process.env.ALLOWED_ORIGINS ?? '', process.env.SITE_URL ?? '', process.env.URL ?? '', process.env.DEPLOY_PRIME_URL ?? '']
    .join(',')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const origins: string[] = [];
  for (const s of raw) {
    try {
      origins.push(new URL(s).origin);
    } catch {
      /* ignore malformed env entries */
    }
  }
  return [...new Set(origins)];
}

function requestOrigin(event: { headers?: Record<string, string | undefined> }): string {
  const origin = headerOf(event, 'origin');
  if (origin) {
    try {
      return new URL(origin).origin;
    } catch {
      return '';
    }
  }
  const referer = headerOf(event, 'referer') || headerOf(event, 'referrer');
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      return '';
    }
  }
  return '';
}

/**
 * Same-origin / allowlist check for browser POSTs. Requests carrying an
 * Origin/Referer from another site are rejected (CSRF + hotlinking). Requests
 * without either (curl, some same-origin navigations) pass through to rate
 * limiting — spoofable headers are friction, not authentication.
 */
function originCheck(event: { headers?: Record<string, string | undefined> }): { ok: boolean; origin: string } {
  const origin = requestOrigin(event);
  if (!origin) return { ok: true, origin: '' };
  const allow = allowedOrigins();
  if (allow.includes(origin)) return { ok: true, origin };
  const host = headerOf(event, 'host') || headerOf(event, 'x-forwarded-host');
  if (host) {
    try {
      const hostOrigin = `https://${host.split(',')[0].trim().split(':')[0]}`;
      if (new URL(origin).hostname === new URL(hostOrigin).hostname) return { ok: true, origin };
    } catch {
      /* fall through to reject */
    }
  } else if (!allow.length) {
    // No host + no configured allowlist (local dev): allow, rate limiting applies.
    return { ok: true, origin };
  }
  return { ok: false, origin };
}

function corsHeaders(origin: string): Record<string, string> {
  if (!origin) return {};
  return { 'access-control-allow-origin': origin, vary: 'Origin' };
}

function probeEnabled(): boolean {
  return process.env.ENABLE_DIALOGUE_PROBE === '1';
}

/**
 * Debug probe payload for the client. Probe endpoint callers already passed
 * the ENABLE_DIALOGUE_PROBE=1 gate, so they always get sanitized details.
 * Talk POST callers only get verbose details when the probe is enabled —
 * production default stays requestId-only (no key/model oracle).
 * Everything here is redacted/truncated; never put key material in it.
 */
function clientDebug(details: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!probeEnabled()) return undefined;
  return details;
}

function errorWithDebug(
  statusCode: number,
  requestId: string,
  error: string,
  debugDetails: Record<string, unknown> | undefined,
  extraHeaders?: Record<string, string>,
) {
  const debug = debugDetails ? clientDebug({ requestId, ...debugDetails }) : undefined;
  return json(statusCode, debug ? { error, requestId, debug } : { error, requestId }, extraHeaders);
}

// ---------- HMAC receipt chain ----------

function hmacSecret(): string {
  return process.env.DIALOGUE_HMAC_SECRET ?? '';
}

function b64urlEncode(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64, 'base64').toString('utf8');
}

// Lazy crypto import keeps cold starts cheap when only GET health is hit.
let cryptoMod: typeof import('node:crypto') | null = null;
async function crypto(): Promise<typeof import('node:crypto')> {
  if (!cryptoMod) cryptoMod = await import('node:crypto');
  return cryptoMod;
}

interface ReceiptPayload { v: 1; p: CostumeId; t: number; c: [string, string, string, string]; }

async function signReceipt(personaId: CostumeId, turn: number, choices: [string, string, string, string]): Promise<string | null> {
  const secret = hmacSecret();
  if (!secret) return null;
  const payload: ReceiptPayload = { v: 1, p: personaId, t: turn, c: choices };
  const body = b64urlEncode(JSON.stringify(payload));
  const { createHmac } = await crypto();
  const sig = createHmac('sha256', secret).update(body).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${body}.${sig}`;
}

async function verifyReceipt(receipt: string, personaId: CostumeId, turn: number, playerText: string): Promise<{ ok: boolean; reason?: string }> {
  const secret = hmacSecret();
  if (!secret) return { ok: true };
  const dot = receipt.lastIndexOf('.');
  if (dot <= 0) return { ok: false, reason: 'malformed' };
  const body = receipt.slice(0, dot);
  const sig = receipt.slice(dot + 1);
  const { createHmac, timingSafeEqual } = await crypto();
  const expect = createHmac('sha256', secret).update(body).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expect);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'bad-signature' };
  } catch {
    return { ok: false, reason: 'bad-signature' };
  }
  let payload: ReceiptPayload;
  try {
    payload = JSON.parse(b64urlDecode(body)) as ReceiptPayload;
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (payload.v !== 1 || payload.p !== personaId) return { ok: false, reason: 'persona-mismatch' };
  if (payload.t !== turn - 1) return { ok: false, reason: 'turn-mismatch' };
  if (!payload.c.map((c) => c.trim()).includes(playerText.trim())) return { ok: false, reason: 'choice-mismatch' };
  return { ok: true };
}

// ---------- Gemini ----------

type GeminiData = {
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string }> };
  }>;
  promptFeedback?: { blockReason?: string };
};

async function fetchGemini(
  modelId: string,
  apiKey: string,
  payload: string,
  timeoutMs = POST_GEMINI_TIMEOUT_MS,
): Promise<{ res: Response | null; raw: string; aborted: boolean; ms: number }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`;
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: payload,
      signal: ctrl.signal,
    });
    const raw = await res.text();
    return { res, raw, aborted: false, ms: Date.now() - t0 };
  } catch (err) {
    const aborted = typeof err === 'object' && err !== null && 'name' in err && (err as { name: string }).name === 'AbortError';
    return { res: null, raw: '', aborted, ms: Date.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sequential model fallback with early exit (cheapest success wins). Only
 * 429/503/timeout/network errors try the next model — a 400 means our request
 * shape is wrong and retrying would just burn budget.
 */
async function callGeminiSequential(
  apiKey: string,
  payload: string,
  requestId: string,
): Promise<{ ok: boolean; model: string; raw: string; status: number | null; attempts: Array<{ model: string; httpStatus: number | null; ms: number }> }> {
  const attempts: Array<{ model: string; httpStatus: number | null; ms: number }> = [];
  for (const modelId of MODEL_IDS) {
    const got = await fetchGemini(modelId, apiKey, payload, POST_GEMINI_TIMEOUT_MS);
    const status = got.res?.status ?? null;
    attempts.push({ model: modelId, httpStatus: status, ms: got.ms });
    if (got.aborted) {
      logDebug(requestId, { stage: 'model-timeout', model: modelId, ms: got.ms });
      continue;
    }
    if (!got.res) {
      logDebug(requestId, { stage: 'model-network', model: modelId, ms: got.ms });
      continue;
    }
    if (got.res.ok) return { ok: true, model: modelId, raw: got.raw, status, attempts };
    const parsed = parseGoogleError(got.raw);
    logDebug(requestId, { stage: 'model-http', model: modelId, httpStatus: status, googleStatus: parsed.googleStatus, ms: got.ms });
    if (status === 429 || status === 503) continue;
    if (status === 400) return { ok: false, model: modelId, raw: got.raw, status, attempts };
    continue;
  }
  return { ok: false, model: MODEL_IDS[0], raw: '', status: attempts[attempts.length - 1]?.httpStatus ?? null, attempts };
}

function safeFallback(personaId: CostumeId, turn: number): { reply: string; choices: [string, string, string, string] } {
  return {
    reply: FAREWELLS[personaId],
    choices: ['Farewell — I must walk on.', 'Farewell.', 'Farewell.', 'Farewell.'],
  };
}

function buildSystemPrompt(p: (typeof PERSONAS)[CostumeId]): string {
  return [
    `You are ${p.name}, a ${p.role} in Calleva (Silchester) in ${p.era}.`,
    `Voice: ${p.voice}`,
    'Audience: all ages, but may include children 10 or over. Friendly, 40-60 words per reply. Never frightening, gory, romantic, or preachy.',
    'Scope: ONLY your daily life in Silchester and this town. If asked anything else (modern world, other places/times, magic powers, how to harm), refuse briefly in character and redirect to your life.',
    'Realism: speak as if living then, first person. NEVER say archaeologists, historians, museums, evidence, excavations, or that you are AI/a ghost construct. For unsure things use in-world hedging: I heard…, folk say…, as far as I know…',
    `True facts you may use: ${p.facts.join('; ')}.`,
    `You do NOT know: ${p.neverKnows.join('; ')}. Never mention these except to say you have never heard of them.`,
    'Output JSON ONLY: {"reply": "<your line>", "choices": ["<player option 1>", "<player option 2>", "<player option 3>", "<player option 4>"]}.',
    'Player options: short (under 15 words), in plain child-friendly words, each a question or remark TO you. One of the four must be a gentle farewell (e.g. Farewell — I must walk on). Never offer harmful, romantic, or off-topic options.',
  ].join('\n');
}

/** Strip code fences and parse the model's JSON; returns null on failure. */
function parseModelJson(text: string): { reply: string; choices: string[] } | null {
  try {
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    const obj = JSON.parse(cleaned.slice(start, end + 1)) as { reply?: unknown; choices?: unknown };
    if (typeof obj.reply !== 'string' || !Array.isArray(obj.choices)) return null;
    return { reply: obj.reply, choices: obj.choices as string[] };
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const handler = async (event: any): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> => {
  const requestId = newRequestId();
  const qs = (event.queryStringParameters ?? {}) as Record<string, string | undefined>;
  const headers = (event.headers ?? {}) as Record<string, string | undefined>;
  void headers;

  if (event.httpMethod === 'OPTIONS') {
    const { origin } = originCheck(event);
    return {
      statusCode: 204,
      headers: {
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '600',
        ...corsHeaders(origin),
      },
      body: '',
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;

  // GET: liveness only (no key/model oracle). Probe is dev-only.
  if (event.httpMethod === 'GET') {
    const wantProbe = qs.probe === '1' || qs.probe === 'true';
    if (!wantProbe) return json(200, { ok: true, requestId });
    if (!probeEnabled()) {
      logDebug(requestId, { stage: 'probe-disabled' });
      return clientError(404, requestId, 'not found');
    }
    const ip = getClientIp(event);
    const rl = rateCheck(`probe:${ip}`, RATE_MAX_PROBE);
    if (!rl.allowed) {
      logDebug(requestId, { stage: 'rate-limited', scope: 'probe', ipHash: ip.slice(0, 8) });
      return json(429, { error: 'dialogue unavailable', requestId }, { 'retry-after': String(rl.retryAfter) });
    }
    if (!apiKey) {
      logDebug(requestId, { stage: 'no-key' });
      return errorWithDebug(503, requestId, 'dialogue unavailable', {
        stage: 'no-key',
        hint: 'GEMINI_API_KEY is not set in this environment.',
      });
    }
    // Minimal single-model probe (no model-list enumeration).
    const body = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: 'Reply with exactly {"ok":true} and nothing else.' }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 256, responseMimeType: 'application/json' },
    });
    const got = await fetchGemini(MODEL_IDS[0], apiKey, body, 8000);
    const ok = Boolean(got.res?.ok && /"ok"\s*:\s*true/.test(got.raw));
    const httpStatus = got.res?.status ?? null;
    logDebug(requestId, { stage: 'probe', model: MODEL_IDS[0], httpStatus, ok, ms: got.ms });
    if (!ok) {
      const parsed = got.raw ? parseGoogleError(got.raw) : {};
      return errorWithDebug(502, requestId, 'dialogue unavailable', {
        stage: 'probe',
        model: MODEL_IDS[0],
        httpStatus,
        ms: got.ms,
        ok: false,
        ...(parsed.googleStatus ? { googleStatus: parsed.googleStatus } : {}),
        ...(parsed.googleMessage ? { googleMessage: parsed.googleMessage.slice(0, 300) } : {}),
        ...(got.aborted ? { hint: 'Probe request timed out after 8s.' } : {}),
        ...(!got.res && !got.aborted ? { hint: 'Probe network failed before a response.' } : {}),
      });
    }
    return json(200, {
      ok: true,
      requestId,
      debug: { stage: 'probe', model: MODEL_IDS[0], httpStatus, ms: got.ms, ok: true, requestId },
    });
  }

  if (event.httpMethod !== 'POST') return clientError(405, requestId, 'POST only');

  // Same-origin check + per-IP rate limit before spending any LLM budget.
  const oc = originCheck(event);
  if (!oc.ok) {
    logDebug(requestId, { stage: 'origin-rejected' });
    return clientError(403, requestId, 'dialogue unavailable', corsHeaders(oc.origin));
  }
  const cors = corsHeaders(oc.origin);
  const ip = getClientIp(event);
  const rl = rateCheck(`post:${ip}`, RATE_MAX_POST);
  if (!rl.allowed) {
    logDebug(requestId, { stage: 'rate-limited', scope: 'post' });
    return json(429, { error: 'dialogue unavailable', requestId }, { ...cors, 'retry-after': String(rl.retryAfter) });
  }

  if (!apiKey) {
    logDebug(requestId, { stage: 'no-key' });
    return json(503, { error: 'dialogue unavailable', requestId }, cors);
  }

  const rawBody = typeof event.body === 'string' ? event.body : '';
  if (rawBody.length > MAX_BODY_BYTES) {
    logDebug(requestId, { stage: 'body-too-large', bytes: rawBody.length });
    return json(413, { error: 'bad request', requestId }, cors);
  }

  let personaId: string = '';
  let history: Turn[] = [];
  let receipt: string | null = null;
  try {
    const body = JSON.parse(rawBody || '{}') as { personaId?: unknown; history?: unknown; receipt?: unknown };
    personaId = typeof body.personaId === 'string' ? body.personaId : '';
    receipt = typeof body.receipt === 'string' && body.receipt ? body.receipt.slice(0, 2000) : null;
    if (Array.isArray(body.history)) {
      const raw = body.history as unknown[];
      if (raw.length > MAX_HISTORY) {
        logDebug(requestId, { stage: 'history-too-long', n: raw.length });
        return json(400, { error: 'bad request', requestId }, cors);
      }
      for (const t of raw) {
        if (typeof t !== 'object' || t === null) {
          logDebug(requestId, { stage: 'bad-turn-shape' });
          return json(400, { error: 'bad request', requestId }, cors);
        }
        const o = t as Record<string, unknown>;
        if ((o.speaker !== 'ghost' && o.speaker !== 'player') || typeof o.text !== 'string') {
          logDebug(requestId, { stage: 'bad-turn-shape' });
          return json(400, { error: 'bad request', requestId }, cors);
        }
        if (!o.text.trim() || o.text.length > MAX_TEXT_LEN) {
          logDebug(requestId, { stage: 'bad-turn-length', speaker: o.speaker });
          return json(400, { error: 'bad request', requestId }, cors);
        }
        history.push({ speaker: o.speaker, text: o.text });
      }
    }
  } catch {
    logDebug(requestId, { stage: 'bad-json' });
    return json(400, { error: 'bad request', requestId }, cors);
  }
  if (!(personaId in PERSONAS)) {
    logDebug(requestId, { stage: 'unknown-persona' });
    return json(400, { error: 'bad request', requestId }, cors);
  }
  // Strict alternation: history is a real transcript, not stacked injections.
  for (let i = 1; i < history.length; i += 1) {
    if (history[i].speaker === history[i - 1].speaker) {
      logDebug(requestId, { stage: 'non-alternating-history' });
      return json(400, { error: 'bad request', requestId }, cors);
    }
  }
  // Player text is a choice-pick, never free text: reject prompt-injection.
  for (const t of history) {
    if (t.speaker === 'player' && INPUT_BLOCKED.test(t.text)) {
      logDebug(requestId, { stage: 'input-blocklist' });
      return json(400, { error: 'bad request', requestId }, cors);
    }
  }
  const pid = personaId as CostumeId;
  const persona = PERSONAS[pid];
  const turn = Math.floor(history.filter((t) => t.speaker === 'ghost').length);

  // HMAC receipt chain (turn >= 2 must present the previous receipt and pick
  // one of its choices). Skipped only when no secret is configured.
  if (hmacSecret() && turn >= 2) {
    const players = history.filter((t) => t.speaker === 'player');
    const lastPlayer = players[players.length - 1];
    if (!receipt || !lastPlayer) {
      logDebug(requestId, { stage: 'receipt-missing', turn });
      return json(400, { error: 'bad request', requestId }, cors);
    }
    const v = await verifyReceipt(receipt, pid, turn, lastPlayer.text);
    if (!v.ok) {
      logDebug(requestId, { stage: 'receipt-rejected', reason: v.reason, turn });
      return json(400, { error: 'bad request', requestId }, cors);
    }
  }

  // Turn cap: force a gentle in-character farewell without spending LLM budget.
  if (turn >= MAX_TURNS) {
    const fb = safeFallback(pid, turn);
    const fbReceipt = await signReceipt(pid, turn, fb.choices);
    return json(200, { ...fb, receipt: fbReceipt, requestId }, cors);
  }

  const instruct = 'Reply in character with your next line and four short follow-up options for me, JSON only.';
  const contents = history.map((t) => ({
    role: t.speaker === 'ghost' ? 'model' : 'user',
    parts: [{ text: t.text }],
  }));
  // Gemini requires contents to start with user and strictly alternate. The
  // opening NPC greeting is already on screen — dropping a leading model turn
  // keeps the array user-led. Merge the JSON instruction into the last user
  // turn so we never send two user messages in a row.
  if (contents[0]?.role === 'model') contents.shift();
  if (!contents.length) {
    contents.push({ role: 'user', parts: [{ text: instruct }] });
  } else if (contents[contents.length - 1].role === 'user') {
    contents[contents.length - 1].parts[0].text += `\n\n${instruct}`;
  } else {
    contents.push({ role: 'user', parts: [{ text: instruct }] });
  }

  const payload = JSON.stringify({
    systemInstruction: { parts: [{ text: buildSystemPrompt(persona) }] },
    contents,
    generationConfig: {
      temperature: TEMPERATURE,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      responseMimeType: 'application/json',
      thinkingConfig: THINKING,
      responseSchema: {
        type: 'object',
        properties: {
          reply: { type: 'string' },
          choices: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 },
        },
        required: ['reply', 'choices'],
      },
    },
  });

  try {
    const call = await callGeminiSequential(apiKey, payload, requestId);
    logDebug(requestId, { stage: 'gemini-attempts', attempts: call.attempts });
    if (!call.ok) {
      logDebug(requestId, { stage: 'gemini-unavailable', attempts: call.attempts });
      return errorWithDebug(502, requestId, 'dialogue unavailable', {
        stage: 'gemini-unavailable',
        model: call.model,
        attempts: call.attempts,
      }, cors);
    }

    let data: GeminiData;
    try {
      data = JSON.parse(call.raw) as GeminiData;
    } catch {
      logDebug(requestId, { stage: 'parse', model: call.model });
      return errorWithDebug(502, requestId, 'dialogue unavailable', {
        stage: 'parse',
        model: call.model,
        attempts: call.attempts,
        hint: 'Gemini returned non-JSON.',
      }, cors);
    }
    const cand = data.candidates?.[0];
    const text = cand?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    const parsed = parseModelJson(text);
    if (!parsed) {
      logDebug(requestId, {
        stage: 'parse',
        model: call.model,
        finishReason: cand?.finishReason,
        blockReason: data.promptFeedback?.blockReason,
        rawPreview: redact(text).slice(0, 120),
      });
      return errorWithDebug(502, requestId, 'dialogue unavailable', {
        stage: 'parse',
        model: call.model,
        attempts: call.attempts,
        ...(cand?.finishReason ? { googleStatus: cand.finishReason } : {}),
        ...(data.promptFeedback?.blockReason ? { googleMessage: data.promptFeedback.blockReason } : {}),
        hint: 'Model output was not usable JSON.',
      }, cors);
    }
    const reply = parsed.reply.trim().slice(0, 450);
    const choices = parsed.choices.filter((c) => typeof c === 'string').map((c) => c.trim()).filter(Boolean).slice(0, 4);
    if (!reply || choices.length !== 4 || choices.some((c) => c.length > 120)) {
      logDebug(requestId, { stage: 'shape', model: call.model, replyLength: reply.length, choiceCount: choices.length });
      return errorWithDebug(502, requestId, 'dialogue unavailable', {
        stage: 'shape',
        model: call.model,
        replyLength: reply.length,
        choiceCount: choices.length,
      }, cors);
    }
    // Guardrails: block meta/AI talk + anything unsafe; fail closed to farewell.
    if (BLOCKED.test(reply) || choices.some((c) => BLOCKED.test(c))) {
      logDebug(requestId, { stage: 'blocklist', model: call.model });
      const fb = safeFallback(pid, turn);
      const fbReceipt = await signReceipt(pid, turn, fb.choices);
      return json(200, { ...fb, receipt: fbReceipt, requestId }, cors);
    }
    const outChoices = [choices[0], choices[1], choices[2], choices[3]] as [string, string, string, string];
    const outReceipt = await signReceipt(pid, turn, outChoices);
    const okDebug = clientDebug({ stage: 'ok', model: call.model, requestId });
    return json(200, okDebug
      ? { reply, choices: outChoices, receipt: outReceipt, requestId, debug: okDebug }
      : { reply, choices: outChoices, receipt: outReceipt, requestId }, cors);
  } catch (err) {
    logDebug(requestId, { stage: 'exception', hint: err instanceof Error ? redact(err.message).slice(0, 120) : 'unhandled exception' });
    return errorWithDebug(502, requestId, 'dialogue unavailable', { stage: 'exception' }, cors);
  }
};
