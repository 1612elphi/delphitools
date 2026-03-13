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
  isNamer: boolean;        // Whether to show namer dot
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
 * Convert ARPABET array to Phoneme array.
 */
function arpabetToPhonemes(arpabets: string[]): Phoneme[] {
  return arpabets.map((code) => {
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
  const lookup = dictionaryLookup(word);
  let phonemes: Phoneme[];
  let source: GlossWord["source"];

  if (lookup) {
    phonemes = arpabetToPhonemes(lookup.arpabets);
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

  const isNamer = false;
  const namerPrefix = "";

  return {
    latin: word,
    phonemes,
    shavian: namerPrefix + phonemes.map((p) => p.shavian).join(""),
    ipa: phonemes.map((p) => p.ipa).join(""),
    source,
    isNamer,
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

    const phonemes = arpabetToPhonemes(lookup.arpabets);
    const isNamer = token.gloss.isNamer;
    const namerPrefix = isNamer ? "·" : "";

    return {
      ...token,
      gloss: {
        ...token.gloss,
        phonemes,
        shavian: namerPrefix + phonemes.map((p) => p.shavian).join(""),
        ipa: phonemes.map((p) => p.ipa).join(""),
        source: lookup.source,
      },
    };
  });
}
