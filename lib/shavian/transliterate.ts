import { arpabetToShavian, arpabetToIpa, normalizeArpabet } from "./phoneme-map";
import { getAlternatives, type Alternative } from "./alternatives";
import { heuristicTransliterate } from "./heuristic";

export interface Phoneme {
  shavian: string;
  ipa: string;
  arpabet?: string;
  alternatives: Alternative[];
}

export interface GlossWord {
  latin: string;           // Original English text
  phonemes: Phoneme[];     // Per-letter breakdown
  shavian: string;         // Full Shavian rendering (concatenated)
  ipa: string;             // Full IPA rendering (concatenated)
  source: "core" | "full" | "heuristic";
  marker: "none" | "namer" | "acroring" | "acroarc"; // Word marker prefix
  userEdited: boolean;     // Whether user has manually changed any phoneme
}

export interface GlossToken {
  type: "word" | "punctuation" | "whitespace";
  value: string;
  gloss?: GlossWord;       // Only present for type "word"
}

// Dictionary type: word → ARPABET phoneme array
// e.g. "hello" → ["HH", "AH0", "L", "OW1"]
export type Dictionary = Map<string, string[]>;

/** Map marker type to its prefix character */
export function markerPrefix(marker: GlossWord["marker"]): string {
  switch (marker) {
    case "namer": return "·";
    case "acroring": return "⸰";
    case "acroarc": return "꤮";
    default: return "";
  }
}

/** Cycle to the next marker state */
export function nextMarker(marker: GlossWord["marker"]): GlossWord["marker"] {
  switch (marker) {
    case "none": return "namer";
    case "namer": return "acroring";
    case "acroring": return "acroarc";
    case "acroarc": return "none";
  }
}

// Active dictionaries — mutated as tiers load
let coreDictionary: Dictionary = new Map();
let fullDictionary: Dictionary = new Map();

export function setCoreDictionary(dict: Dictionary) {
  coreDictionary = dict;
}

export function setFullDictionary(dict: Dictionary) {
  fullDictionary = dict;
}

/**
 * Shavian shorthands: common words spelt as a single consonant letter.
 * Per shavian.info spelling guide, rule 2.
 */
const SHORTHANDS: Map<string, { shavian: string; ipa: string }> = new Map([
  ["the", { shavian: "𐑞", ipa: "ðə" }],
  ["of", { shavian: "𐑝", ipa: "əv" }],
  ["and", { shavian: "𐑯", ipa: "ənd" }],
  ["to", { shavian: "𐑑", ipa: "tuː" }],
  ["for", { shavian: "𐑓", ipa: "fɔːr" }],
]);

/**
 * ARPABET overrides for words where CMU doesn't match Shavian spelling conventions.
 *
 * - PALM words: CMU uses AA (LOT vowel 𐑪) but Shavian uses 𐑭 (PALM vowel).
 *   We remap their AA phoneme to synthetic AA_PALM.
 * - THOUGHT bugs: CMU incorrectly uses AA instead of AO for some words.
 *   We remap their AA phoneme to AO.
 */
const ARPABET_OVERRIDES: Map<string, { from: string; to: string }[]> = new Map();

// PALM words: AA → AA_PALM (𐑭, IPA ɑː)
for (const w of [
  "father", "rather", "lather",
  "calm", "palm", "psalm", "balm", "almond",
  "drama", "banana", "llama", "mama", "papa",
  "lava", "java", "guava",
  "rajah", "hurrah", "aha", "bah",
  "salami", "safari", "tsunami", "khaki",
  "spa", "bra",
  "pasta", "plaza", "taco",
  "cantata", "sonata", "aria",
]) {
  ARPABET_OVERRIDES.set(w, [{ from: "AA", to: "AA_PALM" }]);
}

// THOUGHT bugs: AA → AO (𐑷, IPA ɔː) — CMU incorrectly uses AA for these
for (const w of ["caught", "bought", "raw", "spawn", "cause"]) {
  ARPABET_OVERRIDES.set(w, [{ from: "AA", to: "AO" }]);
}

/**
 * Apply ARPABET overrides for a word, returning corrected phoneme array.
 */
function applyArpabetOverrides(word: string, arpabets: string[]): string[] {
  const overrides = ARPABET_OVERRIDES.get(word.toLowerCase());
  if (!overrides) return arpabets;
  return arpabets.map((code) => {
    const base = normalizeArpabet(code);
    const override = overrides.find((o) => o.from === base);
    return override ? override.to : code;
  });
}

/**
 * Look up a word in the dictionary tiers.
 * Returns [phonemes, source] or null if not found.
 */
function dictionaryLookup(word: string): { arpabets: string[]; source: "core" | "full" } | null {
  const lower = word.toLowerCase();
  const core = coreDictionary.get(lower);
  if (core) return { arpabets: core, source: "core" };
  const full = fullDictionary.get(lower);
  if (full) return { arpabets: full, source: "full" };
  return null;
}

/**
 * Merge ARPABET sequences that map to single Shavian letters.
 * e.g. Y + UW → 𐑿 (yew, /juː/)
 */
function mergeArpabetSequences(arpabets: string[]): string[] {
  const result: string[] = [];
  let i = 0;
  while (i < arpabets.length) {
    // Y + UW (any stress) → YUW (yew ligature)
    if (
      arpabets[i] === "Y" &&
      i + 1 < arpabets.length &&
      normalizeArpabet(arpabets[i + 1]) === "UW"
    ) {
      result.push("YUW");
      i += 2;
    } else {
      result.push(arpabets[i]);
      i++;
    }
  }
  return result;
}

/**
 * Convert ARPABET array to Phoneme array.
 */
function arpabetToPhonemes(arpabets: string[]): Phoneme[] {
  const merged = mergeArpabetSequences(arpabets);
  return merged.map((code) => {
    const normalized = normalizeArpabet(code);
    const shavian = arpabetToShavian(code) ?? "?";
    const ipa = arpabetToIpa(code) ?? "?";
    return {
      shavian,
      ipa,
      arpabet: normalized,
      alternatives: getAlternatives(shavian),
    };
  });
}

/**
 * Transliterate a single word.
 * Namer dots are never auto-detected — they are toggled manually by the user.
 */
export function transliterateWord(word: string): GlossWord {
  // Check shorthands first (the, of, and, to, for)
  const shorthand = SHORTHANDS.get(word.toLowerCase());
  if (shorthand) {
    const phoneme: Phoneme = {
      shavian: shorthand.shavian,
      ipa: shorthand.ipa,
      alternatives: getAlternatives(shorthand.shavian),
    };
    return {
      latin: word,
      phonemes: [phoneme],
      shavian: shorthand.shavian,
      ipa: shorthand.ipa,
      source: "core",
      marker: "none",
      userEdited: false,
    };
  }

  const lookup = dictionaryLookup(word);
  let phonemes: Phoneme[];
  let source: GlossWord["source"];

  if (lookup) {
    const corrected = applyArpabetOverrides(word, lookup.arpabets);
    phonemes = arpabetToPhonemes(corrected);
    source = lookup.source;
  } else {
    // Heuristic fallback
    const heuristic = heuristicTransliterate(word);
    phonemes = heuristic.map((h) => ({
      shavian: h.shavian,
      ipa: h.ipa,
      alternatives: getAlternatives(h.shavian),
    }));
    source = "heuristic";
  }

  return {
    latin: word,
    phonemes,
    shavian: phonemes.map((p) => p.shavian).join(""),
    ipa: phonemes.map((p) => p.ipa).join(""),
    source,
    marker: "none" as const,
    userEdited: false,
  };
}

/**
 * Tokenise input text into words, punctuation, and whitespace.
 */
export function tokenise(text: string): GlossToken[] {
  const tokens: GlossToken[] = [];
  // Match: words (letters/apostrophes), whitespace runs, or punctuation
  const regex = /([a-zA-Z']+)|(\s+)|([^\sa-zA-Z']+)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match[1]) {
      const gloss = transliterateWord(match[1]);
      tokens.push({ type: "word", value: match[1], gloss });
    } else if (match[2]) {
      tokens.push({ type: "whitespace", value: match[2] });
    } else if (match[3]) {
      tokens.push({ type: "punctuation", value: match[3] });
    }
  }

  return tokens;
}

/**
 * Re-resolve heuristic words against the full dictionary.
 * Called after Tier 2 loads. Preserves user-edited words.
 */
export function reResolveTokens(tokens: GlossToken[]): GlossToken[] {
  return tokens.map((token) => {
    if (token.type !== "word" || !token.gloss) return token;
    if (token.gloss.userEdited) return token; // Preserve user edits
    if (token.gloss.source !== "heuristic") return token;

    // Try full dictionary now
    const lookup = dictionaryLookup(token.gloss.latin);
    if (!lookup) return token; // Still no match

    const corrected = applyArpabetOverrides(token.gloss.latin, lookup.arpabets);
    const phonemes = arpabetToPhonemes(corrected);
    const prefix = markerPrefix(token.gloss.marker);

    return {
      ...token,
      gloss: {
        ...token.gloss,
        phonemes,
        shavian: prefix + phonemes.map((p) => p.shavian).join(""),
        ipa: phonemes.map((p) => p.ipa).join(""),
        source: lookup.source,
      },
    };
  });
}
