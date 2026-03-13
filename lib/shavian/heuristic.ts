import { getShavianLetter } from "./phoneme-map";

// Grapheme patterns sorted longest-first for greedy matching.
// Each maps an English spelling pattern to a Shavian character string.
const GRAPHEME_RULES: [string, string][] = [
  // Multi-character patterns (longest first)
  ["tion", "𐑖𐑩𐑯"],
  ["sion", "𐑠𐑩𐑯"],
  ["ture", "𐑗𐑼"],
  ["ough", "𐑴"],   // most common: "though" — user can fix others
  ["ight", "𐑲𐑑"],
  ["ould", "𐑫𐑛"],
  ["ious", "𐑾𐑕"],
  ["eous", "𐑾𐑕"],
  ["tch", "𐑗"],
  ["dge", "𐑡"],
  ["sch", "𐑕𐑒"],
  ["scr", "𐑕𐑒𐑮"],
  ["shr", "𐑖𐑮"],
  ["thr", "𐑔𐑮"],
  ["str", "𐑕𐑑𐑮"],
  ["spl", "𐑕𐑐𐑤"],
  ["spr", "𐑕𐑐𐑮"],
  ["kn", "𐑯"],
  ["wr", "𐑮"],
  ["gn", "𐑯"],
  ["ph", "𐑓"],
  ["wh", "𐑢"],
  ["gh", ""],      // silent in most positions
  ["th", "𐑔"],    // default to unvoiced; user can swap
  ["sh", "𐑖"],
  ["ch", "𐑗"],
  ["ng", "𐑙"],
  ["nk", "𐑙𐑒"],
  ["qu", "𐑒𐑢"],
  ["ck", "𐑒"],
  ["ee", "𐑰"],
  ["ea", "𐑰"],
  ["oo", "𐑵"],
  ["ou", "𐑬"],
  ["ow", "𐑬"],
  ["oi", "𐑶"],
  ["oy", "𐑶"],
  ["ai", "𐑱"],
  ["ay", "𐑱"],
  ["ei", "𐑱"],
  ["ey", "𐑱"],
  ["ie", "𐑰"],
  ["aw", "𐑷"],
  ["au", "𐑷"],
  ["er", "𐑼"],
  ["ir", "𐑻"],
  ["ur", "𐑻"],
  ["or", "𐑹"],
  ["ar", "𐑸"],
  ["ew", "𐑿"],
  // Single-letter fallbacks
  ["a", "𐑨"],
  ["b", "𐑚"],
  ["c", "𐑒"],
  ["d", "𐑛"],
  ["e", "𐑧"],    // short e default; often silent at word end (handled separately)
  ["f", "𐑓"],
  ["g", "𐑜"],
  ["h", "𐑣"],
  ["i", "𐑦"],
  ["j", "𐑡"],
  ["k", "𐑒"],
  ["l", "𐑤"],
  ["m", "𐑥"],
  ["n", "𐑯"],
  ["o", "𐑪"],
  ["p", "𐑐"],
  ["r", "𐑮"],
  ["s", "𐑕"],
  ["t", "𐑑"],
  ["u", "𐑳"],
  ["v", "𐑝"],
  ["w", "𐑢"],
  ["x", "𐑒𐑕"],
  ["y", "𐑘"],
  ["z", "𐑟"],
];

interface HeuristicPhoneme {
  shavian: string;
  ipa: string;
}

/**
 * Convert an English word to Shavian using grapheme rules.
 * Returns an array of phonemes (one per matched pattern).
 * This is a rough heuristic — results should be flagged for user review.
 */
export function heuristicTransliterate(word: string): HeuristicPhoneme[] {
  const lower = word.toLowerCase();
  const result: HeuristicPhoneme[] = [];
  let i = 0;

  // Strip silent trailing 'e' (very rough heuristic)
  const effective =
    lower.length > 2 && lower.endsWith("e") && !/[aeiouy]/.test(lower[lower.length - 2])
      ? lower.slice(0, -1)
      : lower;

  while (i < effective.length) {
    let matched = false;

    for (const [grapheme, shavianStr] of GRAPHEME_RULES) {
      if (effective.startsWith(grapheme, i)) {
        if (shavianStr.length > 0) {
          // Each Shavian character in the output is a separate phoneme
          // Shavian chars are in the supplementary plane, so use spread for surrogate pairs
          for (const char of [...shavianStr]) {
            const letter = getShavianLetter(char);
            if (letter) {
              result.push({ shavian: letter.shavian, ipa: letter.ipa });
            }
          }
        }
        i += grapheme.length;
        matched = true;
        break;
      }
    }

    if (!matched) {
      // Skip unknown characters (numbers, hyphens, etc.)
      i++;
    }
  }

  return result;
}
