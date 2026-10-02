// Lazy loader for pre-generated per-ghost dialogue banks.
// A missing file is not an error: the caller keeps the curated/live path.

import type { GhostCostumeId } from '../domain/ghosts.js';
import { BANK_SCHEMA_VERSION, type PersonaBank } from '../domain/dialogueBank.js';

const SEEN_KEY = 'calleva.dialogueSeen.v1';
const SEEN_CAP = 300;

const resolved = new Map<string, PersonaBank | null>();
const inflight = new Map<string, Promise<PersonaBank | null>>();
const warned = new Set<string>();

function isBank(value: unknown, id: GhostCostumeId): value is PersonaBank {
  if (!value || typeof value !== 'object') return false;
  const bank = value as PersonaBank;
  return bank.schemaVersion === BANK_SCHEMA_VERSION
    && bank.personaId === id
    && !!bank.nodes && typeof bank.nodes === 'object' && !Array.isArray(bank.nodes)
    && Array.isArray(bank.greetings) && bank.greetings.length >= 1
    && Array.isArray(bank.returnGreetings)
    && Array.isArray(bank.farewells);
}

function warnOnce(id: string, err: unknown): void {
  if (warned.has(id)) return;
  warned.add(id);
  console.warn(`[dialogue-bank] ${id} unavailable`, err);
}

/** Already-fetched bank, or null if it has not loaded or failed. */
export function cachedBank(id: GhostCostumeId): PersonaBank | null {
  return resolved.get(id) ?? null;
}

export function loadBank(id: GhostCostumeId): Promise<PersonaBank | null> {
  const pending = inflight.get(id);
  if (pending) return pending;
  const job = (async () => {
    try {
      const res = await fetch(`./dialogue-bank/${id}.json`);
      if (!res.ok) throw new Error(String(res.status));
      const data: unknown = await res.json();
      if (!isBank(data, id)) throw new Error('shape');
      resolved.set(id, data);
      return data;
    } catch (err) {
      warnOnce(id, err);
      resolved.set(id, null);
      return null;
    }
  })();
  inflight.set(id, job);
  return job;
}

/** Fetch each ghost's bank after the game is up, without blocking the first frame. */
export function prefetchBanks(ids: readonly GhostCostumeId[]): void {
  const run = (): void => {
    for (const id of ids) void loadBank(id);
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => run());
  else window.setTimeout(run, 2000);
}

function readSeen(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!Array.isArray(value)) continue;
      const ids = value.filter((item): item is string => typeof item === 'string').slice(-SEEN_CAP);
      if (ids.length) out[key] = ids;
    }
    return out;
  } catch {
    return {};
  }
}

export function loadSeenEver(id: string): Set<string> {
  return new Set(readSeen()[id] ?? []);
}

/** Persist node ids this persona has already spoken. Newest 300 are kept. */
export function saveSeenEver(id: string, seen: Set<string>): void {
  try {
    const all = readSeen();
    const ordered: string[] = [];
    for (const item of all[id] ?? []) {
      if (seen.has(item)) ordered.push(item);
    }
    for (const item of seen) {
      const at = ordered.indexOf(item);
      if (at >= 0) ordered.splice(at, 1);
      ordered.push(item);
    }
    all[id] = ordered.slice(-SEEN_CAP);
    localStorage.setItem(SEEN_KEY, JSON.stringify(all));
  } catch { /* private-mode storage may throw */ }
}

export function clearSeenEver(): void {
  try { localStorage.removeItem(SEEN_KEY); } catch { /* private-mode */ }
}
