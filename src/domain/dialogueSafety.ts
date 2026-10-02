// Shared child-safety + immersion checks for harvested dialogue.
// `BLOCKED` matches the live proxy list in netlify/functions/dialogue.ts.

export const BLOCKED = new RegExp(
  [
    'archaeolog', 'historian', 'museum', 'evidence', 'excavat', 'monograph',
    'you are an ai', 'as an ai', 'language model',
    'kill(ing|ed)? you', 'torture', '\\brape\\b', 'sexy', 'naked',
    'suicide', 'self-?harm', 'how to make (a )?(bomb|weapon|poison)',
    'damn you', 'whore', 'bastard',
  ].join('|'),
  'i',
);

const META = /\bghost construct\b|\bchatbot\b|\bAI\b/;

/** Too common to ban on their own. Multi-word entries then match as a phrase. */
const NEEDLE_STOP = new Set([
  'town', 'later', 'stone', 'walls', 'wall', 'years', 'after', 'built',
  'name', 'final', 'anything', 'modern', 'other', 'end', 'building',
  'working', 'people', 'living', 'places',
]);

/**
 * Longest word of 4+ letters in a neverKnows entry (last wins a tie).
 * "stone town walls" -> "walls". Short function words are skipped so a
 * multi-word ban does not flag ordinary speech.
 */
export function neverKnowsNeedle(entry: string): string | null {
  const words = entry.toLowerCase().match(/[a-z]{4,}/g);
  if (!words || words.length === 0) return null;
  let best = words[0];
  for (const w of words) {
    if (w.length >= best.length) best = w;
  }
  return best;
}

/** Problems found in one line. `blocked` / `meta` are hard failures; `neverKnows:` is a warning. */
export function checkBankText(text: string, neverKnows: string[]): string[] {
  const problems: string[] = [];
  if (BLOCKED.test(text)) problems.push('blocked');
  if (META.test(text)) problems.push('meta');
  const seen = new Set<string>();
  for (const entry of neverKnows) {
    const needle = neverKnowsNeedle(entry);
    if (!needle || seen.has(entry)) continue;
    seen.add(entry);
    const phrase = entry.trim().replace(/\s+/g, ' ');
    const re = NEEDLE_STOP.has(needle) && phrase.includes(' ')
      ? new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      : new RegExp(`\\b${needle}\\b`, 'i');
    if (re.test(text)) problems.push(`neverKnows:${entry}`);
  }
  return problems;
}
