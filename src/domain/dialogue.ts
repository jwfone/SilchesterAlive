// Shared dialogue types for NPC talks.
// Player has no free text: they only pick 1 of 4 curated choices
// (3 conversation options + 1 gentle farewell).

import type { GhostCostumeId } from './ghosts.js';

/** One exchange turn. Speaker is the NPC ('ghost') or the player choice. */
export interface DialogueTurn {
  speaker: 'ghost' | 'player';
  text: string;
}

/** Client-side conversation state for one meeting. */
export interface DialogueState {
  personaId: GhostCostumeId;
  history: DialogueTurn[];
  turn: number;
}

/** NPC line + exactly 4 follow-up player options (3 + farewell). */
export interface DialogueReply {
  reply: string;
  choices: [string, string, string, string];
}

/** Transcript kept in memory for one meeting only (cleared on close). */
export function appendTurn(history: DialogueTurn[], turn: DialogueTurn): DialogueTurn[] {
  return [...history.slice(-11), turn];
}

/** Max turns before a forced gentle farewell (bank and curated lines). */
export const DIALOGUE_MAX_TURNS = 6;

/** Proximity trigger radius (metres) and re-talk cooldown (ms). */
export const DIALOGUE_RADIUS = 3.5;
export const DIALOGUE_COOLDOWN_MS = 30000;

/** Farewell choice label base — always offered as one of the 4 options. */
export const FAREWELL_CHOICE = 'Farewell — I must walk on.';
