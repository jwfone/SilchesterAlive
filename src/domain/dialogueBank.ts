// Offline dialogue bank: a topic graph per persona.
// Choice text lives on the node it leads INTO (`ask`), so an answer stays
// tied to the question whatever path the player took to get there.

import type { GhostCostumeId } from './ghosts.js';

export const BANK_SCHEMA_VERSION = 1;

export interface BankNode {
  id: string;
  /** Topic id this node belongs to. */
  topic: string;
  depth: 'intro' | 'mid' | 'deep';
  /** 2-3 player phrasings that lead INTO this node. */
  ask: string[];
  /** 2-3 ghost answers, each of which answers every `ask`. */
  replies: string[];
  /** 4-6 follow-up node ids. Runtime shows 3 of them. */
  next: string[];
  /** Only offer after all of these node ids were seen this meeting. */
  requires?: string[];
  reviewed: boolean;
}

export interface BankGreeting {
  reply: string;
  next: string[];
}

export interface PersonaBank {
  schemaVersion: number;
  personaId: GhostCostumeId;
  bankVersion: number;
  generatedAt: string;
  model: string;
  /** First meeting. */
  greetings: BankGreeting[];
  /** Persona spoken to before. */
  returnGreetings: BankGreeting[];
  /** Used when the turn cap forces a goodbye. */
  farewells: string[];
  nodes: Record<string, BankNode>;
}
