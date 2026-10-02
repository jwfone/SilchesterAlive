// Pure topic-graph playback. No DOM. Shared by the game and the validator's walks.

import type { BankGreeting, BankNode, PersonaBank } from './dialogueBank.js';

export interface SelectCtx {
  /** 0 while the greeting is on screen. */
  turn: number;
  seenThisMeeting: Set<string>;
  /** Node ids shown in earlier meetings (localStorage). */
  seenEver: Set<string>;
}

export interface ChoiceOption {
  nodeId: string;
  text: string;
}

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

function eligible(bank: PersonaBank, id: string, ctx: SelectCtx): BankNode | null {
  const node = bank.nodes[id];
  if (!node || !node.reviewed) return null;
  if (ctx.seenThisMeeting.has(id)) return null;
  if (node.depth === 'deep' && ctx.turn < 2) return null;
  if (node.requires?.some((req) => !ctx.seenThisMeeting.has(req))) return null;
  return node;
}

/** Unseen-ever first, shuffled inside each group. */
function rank(ids: readonly string[], ctx: SelectCtx, rng: () => number): string[] {
  const fresh: string[] = [];
  const seen: string[] = [];
  for (const id of ids) (ctx.seenEver.has(id) ? seen : fresh).push(id);
  return [...shuffle(fresh, rng), ...shuffle(seen, rng)];
}

export function pickGreeting(bank: PersonaBank, returning: boolean, rng: () => number): BankGreeting {
  const preferred = returning ? bank.returnGreetings : bank.greetings;
  const pool = preferred.length ? preferred : (returning ? bank.greetings : bank.returnGreetings);
  if (!pool.length) return { reply: 'Hello.', next: [] };
  const i = Math.floor(rng() * pool.length);
  return pool[Math.min(i, pool.length - 1)];
}

export function pickReply(
  node: BankNode,
  avoidIndex: number | null,
  rng: () => number,
): { text: string; index: number } {
  const replies = node.replies ?? [];
  const n = replies.length;
  if (n === 0) return { text: '…', index: 0 };
  if (n === 1) return { text: replies[0], index: 0 };
  let i = Math.floor(rng() * n);
  if (i >= n) i = n - 1;
  if (avoidIndex !== null && i === avoidIndex) i = (i + 1) % n;
  return { text: replies[i], index: i };
}

export function pickFarewell(bank: PersonaBank, rng: () => number): string {
  const list = bank.farewells.filter((f) => f.trim());
  if (!list.length) return 'Farewell — I must walk on.';
  const i = Math.floor(rng() * list.length);
  return list[Math.min(i, list.length - 1)];
}

/**
 * Up to 3 follow-ups. Unseen-ever nodes come first. Same-topic pairs are
 * skipped while another topic can still fill a slot. Then, if still short:
 * same topics as `candidateIds`, intro, mid, then any reviewed node.
 */
export function pickChoices(
  bank: PersonaBank,
  candidateIds: readonly string[],
  ctx: SelectCtx,
  rng: () => number,
): ChoiceOption[] {
  const picked: string[] = [];
  const topics = new Set<string>();

  const take = (ranked: readonly string[]): void => {
    for (const id of ranked) {
      if (picked.length >= 3) return;
      if (picked.includes(id)) continue;
      const node = bank.nodes[id];
      if (!node || topics.has(node.topic)) continue;
      picked.push(id);
      topics.add(node.topic);
    }
    for (const id of ranked) {
      if (picked.length >= 3) return;
      if (picked.includes(id)) continue;
      picked.push(id);
      const node = bank.nodes[id];
      if (node) topics.add(node.topic);
    }
  };

  const pool = (pred: (node: BankNode) => boolean): string[] => {
    const ids: string[] = [];
    for (const id of Object.keys(bank.nodes)) {
      if (picked.includes(id)) continue;
      const node = eligible(bank, id, ctx);
      if (node && pred(node)) ids.push(id);
    }
    return rank(ids, ctx, rng);
  };

  take(rank(candidateIds.filter((id) => eligible(bank, id, ctx)), ctx, rng));

  if (picked.length < 3) {
    const wanted = new Set<string>();
    for (const id of candidateIds) {
      const topic = bank.nodes[id]?.topic;
      if (topic) wanted.add(topic);
    }
    take(pool((node) => wanted.has(node.topic)));
  }
  if (picked.length < 3) take(pool((node) => node.depth === 'intro'));
  if (picked.length < 3) take(pool((node) => node.depth === 'mid'));
  if (picked.length < 3) take(pool(() => true));

  const out: ChoiceOption[] = [];
  for (const id of picked) {
    const node = bank.nodes[id];
    if (!node?.ask?.length) continue;
    const i = Math.min(Math.floor(rng() * node.ask.length), node.ask.length - 1);
    out.push({ nodeId: id, text: node.ask[i] });
  }
  return out;
}
