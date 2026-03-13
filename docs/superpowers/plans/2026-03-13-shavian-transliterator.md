# Shavian Transliterator Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Shavian alphabet transliterator tool with interactive interlinear gloss display, per-letter editing, and hybrid dictionary architecture.

**Architecture:** Three-tier dictionary (bundled core → lazy-loaded full → heuristic fallback) feeds a transliteration pipeline that tokenises English text into phoneme arrays. A React gloss grid renders three aligned rows (Latin, clickable Shavian, derived IPA) per word. Individual Shavian letters are clickable to swap phonemes via a popover.

**Tech Stack:** Next.js 16 + React 19, Tailwind CSS 4, shadcn/ui, Noto Sans Shavian (WOFF2), Canvas API for PNG export.

**Spec:** `docs/superpowers/specs/2026-03-13-shavian-transliterator-design.md`

**No test framework:** This project has no automated tests. Steps use manual browser verification instead of TDD.

---

## Chunk 1: Phoneme Mapping & Transliteration Engine

### Task 1: ARPABET ↔ IPA ↔ Shavian Mapping Module

**Files:**
- Create: `lib/shavian/phoneme-map.ts`

This module is the Rosetta Stone of the tool — every other module depends on it. It defines the complete mapping between ARPABET codes (from CMU dict), IPA symbols, and Shavian Unicode characters, plus metadata for the UI (letter names, categories).

- [ ] **Step 1: Create the phoneme mapping module**

```typescript
// lib/shavian/phoneme-map.ts

// Shavian letter metadata
export interface ShavianLetter {
  shavian: string;    // Unicode character
  name: string;       // Keyword name (peep, bib, etc.)
  ipa: string;        // IPA representation
  category: "consonant" | "vowel" | "ligature";
}

// Complete Shavian alphabet — 48 letters + ligatures
export const SHAVIAN_LETTERS: ShavianLetter[] = [
  // Tall consonants (unvoiced)
  { shavian: "𐑐", name: "peep", ipa: "p", category: "consonant" },
  { shavian: "𐑑", name: "tot", ipa: "t", category: "consonant" },
  { shavian: "𐑒", name: "kick", ipa: "k", category: "consonant" },
  { shavian: "𐑓", name: "fee", ipa: "f", category: "consonant" },
  { shavian: "𐑔", name: "thigh", ipa: "θ", category: "consonant" },
  { shavian: "𐑕", name: "so", ipa: "s", category: "consonant" },
  { shavian: "𐑖", name: "sure", ipa: "ʃ", category: "consonant" },
  { shavian: "𐑗", name: "church", ipa: "tʃ", category: "consonant" },
  // Deep consonants (voiced)
  { shavian: "𐑚", name: "bib", ipa: "b", category: "consonant" },
  { shavian: "𐑛", name: "dead", ipa: "d", category: "consonant" },
  { shavian: "𐑜", name: "gag", ipa: "ɡ", category: "consonant" },
  { shavian: "𐑝", name: "vow", ipa: "v", category: "consonant" },
  { shavian: "𐑞", name: "they", ipa: "ð", category: "consonant" },
  { shavian: "𐑟", name: "zoo", ipa: "z", category: "consonant" },
  { shavian: "𐑠", name: "measure", ipa: "ʒ", category: "consonant" },
  { shavian: "𐑡", name: "judge", ipa: "dʒ", category: "consonant" },
  // Tall sonorants
  { shavian: "𐑘", name: "yea", ipa: "j", category: "consonant" },
  { shavian: "𐑢", name: "woe", ipa: "w", category: "consonant" },
  // Deep sonorants
  { shavian: "𐑙", name: "hung", ipa: "ŋ", category: "consonant" },
  { shavian: "𐑣", name: "ha-ha", ipa: "h", category: "consonant" },
  // Nasals and liquids
  { shavian: "𐑥", name: "mime", ipa: "m", category: "consonant" },
  { shavian: "𐑯", name: "nun", ipa: "n", category: "consonant" },
  { shavian: "𐑤", name: "loll", ipa: "l", category: "consonant" },
  { shavian: "𐑮", name: "roar", ipa: "r", category: "consonant" },
  // Short vowels
  { shavian: "𐑨", name: "ash", ipa: "æ", category: "vowel" },
  { shavian: "𐑩", name: "ado", ipa: "ə", category: "vowel" },
  { shavian: "𐑪", name: "on", ipa: "ɒ", category: "vowel" },
  { shavian: "𐑫", name: "wool", ipa: "ʊ", category: "vowel" },
  { shavian: "𐑦", name: "if", ipa: "ɪ", category: "vowel" },
  { shavian: "𐑧", name: "egg", ipa: "ɛ", category: "vowel" },
  { shavian: "𐑳", name: "up", ipa: "ʌ", category: "vowel" },
  // Long vowels
  { shavian: "𐑱", name: "ate", ipa: "eɪ", category: "vowel" },
  { shavian: "𐑰", name: "eat", ipa: "iː", category: "vowel" },
  { shavian: "𐑲", name: "ice", ipa: "aɪ", category: "vowel" },
  { shavian: "𐑴", name: "oak", ipa: "oʊ", category: "vowel" },
  { shavian: "𐑵", name: "ooze", ipa: "uː", category: "vowel" },
  { shavian: "𐑶", name: "oil", ipa: "ɔɪ", category: "vowel" },
  { shavian: "𐑬", name: "out", ipa: "aʊ", category: "vowel" },
  { shavian: "𐑷", name: "awe", ipa: "ɔː", category: "vowel" },
  { shavian: "𐑸", name: "are", ipa: "ɑːr", category: "vowel" },
  { shavian: "𐑹", name: "or", ipa: "ɔːr", category: "vowel" },
  { shavian: "𐑺", name: "air", ipa: "ɛər", category: "vowel" },
  { shavian: "𐑻", name: "err", ipa: "ɜːr", category: "vowel" },
  { shavian: "𐑼", name: "array", ipa: "ɚ", category: "vowel" },
  { shavian: "𐑽", name: "ear", ipa: "ɪər", category: "vowel" },
  { shavian: "𐑾", name: "ian", ipa: "ɪə", category: "vowel" },
  { shavian: "𐑿", name: "yew", ipa: "juː", category: "vowel" },
];

// ARPABET to Shavian mapping
// CMU dict uses ARPABET with stress markers (0, 1, 2) on vowels — strip stress before lookup
const ARPABET_TO_SHAVIAN: Record<string, string> = {
  // Consonants
  P: "𐑐", T: "𐑑", K: "𐑒", F: "𐑓",
  TH: "𐑔", S: "𐑕", SH: "𐑖", CH: "𐑗",
  B: "𐑚", D: "𐑛", G: "𐑜", V: "𐑝",
  DH: "𐑞", Z: "𐑟", ZH: "𐑠", JH: "𐑡",
  Y: "𐑘", W: "𐑢", NG: "𐑙", HH: "𐑣",
  M: "𐑥", N: "𐑯", L: "𐑤", R: "𐑮",
  // Vowels
  AE: "𐑨", AH0: "𐑩", AH: "𐑳", AA: "𐑪",
  UH: "𐑫", IH: "𐑦", EH: "𐑧",
  EY: "𐑱", IY: "𐑰", AY: "𐑲",
  OW: "𐑴", UW: "𐑵", OY: "𐑶",
  AW: "𐑬", AO: "𐑷",
  ER: "𐑼",
};

// ARPABET to IPA mapping
const ARPABET_TO_IPA: Record<string, string> = {
  P: "p", T: "t", K: "k", F: "f",
  TH: "θ", S: "s", SH: "ʃ", CH: "tʃ",
  B: "b", D: "d", G: "ɡ", V: "v",
  DH: "ð", Z: "z", ZH: "ʒ", JH: "dʒ",
  Y: "j", W: "w", NG: "ŋ", HH: "h",
  M: "m", N: "n", L: "l", R: "r",
  AE: "æ", AH0: "ə", AH: "ʌ", AA: "ɒ",
  UH: "ʊ", IH: "ɪ", EH: "ɛ",
  EY: "eɪ", IY: "iː", AY: "aɪ",
  OW: "oʊ", UW: "uː", OY: "ɔɪ",
  AW: "aʊ", AO: "ɔː",
  ER: "ɚ",
};

// Strip stress markers from ARPABET vowels: "AH1" → "AH", "AH0" → "AH0" (special case for schwa)
export function normalizeArpabet(code: string): string {
  const stripped = code.replace(/[012]$/, "");
  // AH with stress 0 is schwa (𐑩), AH with stress 1/2 is strut (𐑳)
  if (code.startsWith("AH")) {
    return code.endsWith("0") ? "AH0" : "AH";
  }
  return stripped;
}

export function arpabetToShavian(code: string): string | undefined {
  return ARPABET_TO_SHAVIAN[normalizeArpabet(code)];
}

export function arpabetToIpa(code: string): string | undefined {
  return ARPABET_TO_IPA[normalizeArpabet(code)];
}

// Shavian character → IPA (for the pronunciation row, derived from Shavian source of truth)
const SHAVIAN_TO_IPA = new Map<string, string>(
  SHAVIAN_LETTERS.map((l) => [l.shavian, l.ipa])
);

export function shavianToIpa(char: string): string {
  return SHAVIAN_TO_IPA.get(char) ?? char;
}

// Voicing pairs for consonant alternatives
export const CONSONANT_GROUPS: string[][] = [
  ["𐑐", "𐑚"],  // peep / bib
  ["𐑑", "𐑛"],  // tot / dead
  ["𐑒", "𐑜"],  // kick / gag
  ["𐑓", "𐑝"],  // fee / vow
  ["𐑔", "𐑞"],  // thigh / they
  ["𐑕", "𐑟"],  // so / zoo
  ["𐑖", "𐑠"],  // sure / measure
  ["𐑗", "𐑡"],  // church / judge
  ["𐑥", "𐑯", "𐑙"],  // mime / nun / hung (nasals)
  ["𐑤", "𐑮"],  // loll / roar (liquids)
  ["𐑘", "𐑢"],  // yea / woe (glides)
  ["𐑣"],        // ha-ha (alone)
];

// All vowel Shavian characters (for vowel alternatives — show all vowels)
export const VOWEL_CHARS: string[] = SHAVIAN_LETTERS
  .filter((l) => l.category === "vowel")
  .map((l) => l.shavian);

// Look up letter metadata by character
const SHAVIAN_BY_CHAR = new Map<string, ShavianLetter>(
  SHAVIAN_LETTERS.map((l) => [l.shavian, l])
);

export function getShavianLetter(char: string): ShavianLetter | undefined {
  return SHAVIAN_BY_CHAR.get(char);
}
```

- [ ] **Step 2: Verify module compiles**

Run: `npx tsc --noEmit` (whole project check — single-file check won't resolve `@/` path aliases)
Alternatively: start dev server (`npm run dev`) and confirm no compile errors in terminal.

- [ ] **Step 3: Commit**

```bash
git add lib/shavian/phoneme-map.ts
git commit -m "feat(shavian): add ARPABET/IPA/Shavian phoneme mapping module"
```

---

### Task 2: Consonant & Vowel Alternatives Module

**Files:**
- Create: `lib/shavian/alternatives.ts`

Generates the list of alternative phonemes shown in the per-letter popover. Vowels show all vowel options. Consonants show their voicing pair / place-of-articulation group.

- [ ] **Step 1: Create the alternatives module**

```typescript
// lib/shavian/alternatives.ts
import {
  CONSONANT_GROUPS,
  VOWEL_CHARS,
  getShavianLetter,
  type ShavianLetter,
} from "./phoneme-map";

export interface Alternative {
  shavian: string;
  name: string;
  ipa: string;
}

// Build a lookup: consonant char → its group (excluding itself)
const consonantGroupMap = new Map<string, string[]>();
for (const group of CONSONANT_GROUPS) {
  for (const char of group) {
    consonantGroupMap.set(char, group.filter((c) => c !== char));
  }
}

/**
 * Get alternative Shavian letters for a given character.
 * - Vowels: all other vowel characters
 * - Consonants: voicing pair / articulation group members
 */
export function getAlternatives(shavianChar: string): Alternative[] {
  const letter = getShavianLetter(shavianChar);
  if (!letter) return [];

  let candidates: string[];

  if (letter.category === "vowel") {
    candidates = VOWEL_CHARS.filter((c) => c !== shavianChar);
  } else {
    candidates = consonantGroupMap.get(shavianChar) ?? [];
  }

  return candidates
    .map((c) => {
      const l = getShavianLetter(c);
      if (!l) return null;
      return { shavian: l.shavian, name: l.name, ipa: l.ipa };
    })
    .filter((a): a is Alternative => a !== null);
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/shavian/alternatives.ts
git commit -m "feat(shavian): add per-letter alternative phoneme generation"
```

---

### Task 3: Heuristic Grapheme-to-Phoneme Engine

**Files:**
- Create: `lib/shavian/heuristic.ts`

Rule-based fallback for words not in any dictionary. Uses a table of ~80 English grapheme patterns applied longest-match-first.

- [ ] **Step 1: Create the heuristic module**

```typescript
// lib/shavian/heuristic.ts
import { getShavianLetter, SHAVIAN_LETTERS, type ShavianLetter } from "./phoneme-map";

// Grapheme patterns sorted longest-first for greedy matching.
// Each maps an English spelling pattern to a Shavian character.
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
          for (const char of [...shavianStr]) {
            // Shavian chars are in the supplementary plane, so we need to handle surrogate pairs
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
```

- [ ] **Step 2: Verify in dev console**

Open browser dev console, import and test:
```javascript
// Quick sanity check in dev server
import { heuristicTransliterate } from './lib/shavian/heuristic';
console.log(heuristicTransliterate("thought")); // Should produce Shavian chars
console.log(heuristicTransliterate("knight")); // Should handle silent k
```

- [ ] **Step 3: Commit**

```bash
git add lib/shavian/heuristic.ts
git commit -m "feat(shavian): add rule-based grapheme-to-phoneme heuristic engine"
```

---

### Task 4: Transliteration Pipeline

**Files:**
- Create: `lib/shavian/transliterate.ts`

The core pipeline: tokenises input text, looks up each word in the dictionary (falling back to heuristic), and returns a structured result ready for the gloss grid.

- [ ] **Step 1: Create the transliteration module**

```typescript
// lib/shavian/transliterate.ts
import { arpabetToShavian, arpabetToIpa, normalizeArpabet, shavianToIpa, getShavianLetter } from "./phoneme-map";
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
 * Determine if a word should get a namer dot.
 * Capitalised words not at position 0 (sentence start) get namer dots.
 */
function shouldNamerDot(word: string, isFirstWord: boolean): boolean {
  if (word.length === 0) return false;
  const firstChar = word[0];
  if (firstChar !== firstChar.toUpperCase() || firstChar === firstChar.toLowerCase()) return false;
  return !isFirstWord;
}

/**
 * Transliterate a single word.
 */
export function transliterateWord(word: string, isFirstWord: boolean): GlossWord {
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

  const isNamer = shouldNamerDot(word, isFirstWord);
  const namerPrefix = isNamer ? "·" : "";

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
  let isFirstWord = true;

  while ((match = regex.exec(text)) !== null) {
    if (match[1]) {
      // Word
      const gloss = transliterateWord(match[1], isFirstWord);
      tokens.push({ type: "word", value: match[1], gloss });
      isFirstWord = false;
    } else if (match[2]) {
      // Whitespace
      tokens.push({ type: "whitespace", value: match[2] });
    } else if (match[3]) {
      // Punctuation
      tokens.push({ type: "punctuation", value: match[3] });
      // Reset sentence detection after sentence-ending punctuation
      if (/[.!?]/.test(match[3])) {
        isFirstWord = true;
      }
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
```

- [ ] **Step 2: Commit**

```bash
git add lib/shavian/transliterate.ts
git commit -m "feat(shavian): add transliteration pipeline with tokeniser and dictionary lookup"
```

---

## Chunk 2: Dictionary Build & Font Setup

### Task 5: Dictionary Build Script

**Files:**
- Create: `scripts/build-shavian-dict.ts`

Standalone Node.js script that processes CMU Pronouncing Dictionary into the two-tier JSON format. Read Lexicon integration deferred to a follow-up (CMU covers 134k words which is sufficient for v1).

- [ ] **Step 1: Create the build script**

```typescript
// scripts/build-shavian-dict.ts
//
// Processes CMU Pronouncing Dictionary into two JSON files:
// - lib/shavian/dictionary-core.json (top 7,500 words by frequency)
// - public/data/shavian-dictionary-full.json (all words)
//
// Run: npx tsx scripts/build-shavian-dict.ts
//
// Requires: cmudict.dict downloaded to scripts/data/cmudict.dict
// Frequency list: scripts/data/word-frequency.txt (one word per line, most frequent first)

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const SCRIPTS_DIR = join(import.meta.dirname ?? __dirname, "data");
const CMU_PATH = join(SCRIPTS_DIR, "cmudict.dict");
const FREQ_PATH = join(SCRIPTS_DIR, "word-frequency.txt");
const CORE_OUTPUT = join(import.meta.dirname ?? __dirname, "..", "lib", "shavian", "dictionary-core.json");
const FULL_OUTPUT = join(import.meta.dirname ?? __dirname, "..", "public", "data", "shavian-dictionary-full.json");
const CORE_SIZE = 7500;

function main() {
  if (!existsSync(CMU_PATH)) {
    console.error(`CMU dictionary not found at ${CMU_PATH}`);
    console.error("Download from: https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict");
    process.exit(1);
  }

  console.log("Reading CMU dictionary...");
  const cmuRaw = readFileSync(CMU_PATH, "utf-8");
  const lines = cmuRaw.split("\n").filter((l) => l.trim() && !l.startsWith(";;;"));

  // Parse CMU dict: each line is "word  PHONEME1 PHONEME2 ..."
  // Words with (N) suffix are pronunciation variants — use first occurrence only
  const dict = new Map<string, string[]>();
  for (const line of lines) {
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;
    let word = parts[0].toLowerCase();
    // Skip variant markers like "read(2)"
    if (word.includes("(")) continue;
    // Skip words with non-alpha characters (abbreviations, etc.)
    if (!/^[a-z']+$/.test(word)) continue;
    if (dict.has(word)) continue; // First pronunciation wins
    dict.set(word, parts.slice(1));
  }

  console.log(`Parsed ${dict.size} unique words from CMU dictionary`);

  // Build full dictionary: word → phoneme array
  const fullDict: Record<string, string[]> = {};
  for (const [word, phonemes] of dict) {
    fullDict[word] = phonemes;
  }

  // Load frequency list and build core dictionary
  let coreWords: string[];
  if (existsSync(FREQ_PATH)) {
    console.log("Reading frequency list...");
    const freqRaw = readFileSync(FREQ_PATH, "utf-8");
    const freqWords = freqRaw.split("\n").map((w) => w.trim().toLowerCase()).filter(Boolean);
    // Take top N words that exist in our dictionary
    coreWords = freqWords.filter((w) => dict.has(w)).slice(0, CORE_SIZE);
    console.log(`Selected ${coreWords.length} core words by frequency`);
  } else {
    console.warn(`Frequency list not found at ${FREQ_PATH}, using first ${CORE_SIZE} dict entries`);
    coreWords = [...dict.keys()].slice(0, CORE_SIZE);
  }

  const coreDict: Record<string, string[]> = {};
  for (const word of coreWords) {
    const phonemes = dict.get(word);
    if (phonemes) coreDict[word] = phonemes;
  }

  // Write outputs
  const coreJson = JSON.stringify(coreDict);
  const fullJson = JSON.stringify(fullDict);

  // Ensure output directories exist
  const coreDir = join(CORE_OUTPUT, "..");
  const fullDir = join(FULL_OUTPUT, "..");
  if (!existsSync(coreDir)) mkdirSync(coreDir, { recursive: true });
  if (!existsSync(fullDir)) mkdirSync(fullDir, { recursive: true });

  writeFileSync(CORE_OUTPUT, coreJson);
  writeFileSync(FULL_OUTPUT, fullJson);

  console.log(`Core dictionary: ${coreWords.length} words (${(coreJson.length / 1024).toFixed(0)}KB)`);
  console.log(`Full dictionary: ${dict.size} words (${(fullJson.length / 1024 / 1024).toFixed(1)}MB)`);
  console.log(`Written to:\n  ${CORE_OUTPUT}\n  ${FULL_OUTPUT}`);
}

main();
```

- [ ] **Step 2: Download CMU dictionary and a frequency list**

```bash
mkdir -p scripts/data
curl -sL "https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict" -o scripts/data/cmudict.dict
# Download word frequency list — Peter Norvig's count_1w.txt (Google Web Trillion Word Corpus)
curl -sL "https://norvig.com/ngrams/count_1w.txt" -o /tmp/count_1w.txt
# Extract just the words (tab-separated: word\tcount), most frequent first
cut -f1 /tmp/count_1w.txt > scripts/data/word-frequency.txt
```

Add `scripts/data/` to `.gitignore` since these are large downloaded source files:
```bash
echo "scripts/data/" >> .gitignore
```

- [ ] **Step 3: Run the build script**

```bash
npx tsx scripts/build-shavian-dict.ts
```

Expected output: two JSON files created, sizes printed.

- [ ] **Step 4: Verify the output files exist and look correct**

```bash
ls -lh lib/shavian/dictionary-core.json public/data/shavian-dictionary-full.json
# Check a sample entry
node -e "const d = require('./lib/shavian/dictionary-core.json'); console.log(d['hello']);"
# Should print: [ 'HH', 'AH0', 'L', 'OW1' ]
```

- [ ] **Step 5: Commit**

```bash
git add scripts/build-shavian-dict.ts scripts/data/cmudict.dict lib/shavian/dictionary-core.json public/data/shavian-dictionary-full.json
git commit -m "feat(shavian): add dictionary build script and generate core/full dictionaries"
```

---

### Task 6: Bundle Noto Sans Shavian Font

**Files:**
- Create: `public/fonts/NotoSansShavian-Regular.woff2`

The Shavian Unicode range isn't in standard system fonts. Bundle Noto Sans Shavian as a WOFF2 web font.

- [ ] **Step 1: Download the font**

Download Noto Sans Shavian from Google Fonts or the Noto project:
```bash
# Download from Google Fonts API — Noto Sans Shavian
curl -sL "https://fonts.google.com/download?family=Noto+Sans+Shavian" -o /tmp/noto-shavian.zip
cd /tmp && unzip -o noto-shavian.zip -d noto-shavian
# Find the TTF/WOFF2 file and copy to project
# If only TTF available, convert with a tool or find WOFF2 directly
```

Alternative if the direct download doesn't work:
```bash
# Google Fonts CSS API serves WOFF2 for modern browsers
# Use grep -oE (not -oP) for macOS compatibility
curl -sH "User-Agent: Mozilla/5.0" \
  "https://fonts.googleapis.com/css2?family=Noto+Sans+Shavian" 2>/dev/null | \
  grep -oE 'url\([^)]+' | head -1 | sed 's/url(//' | xargs -I{} curl -sL {} -o public/fonts/NotoSansShavian-Regular.woff2
```

- [ ] **Step 2: Verify file exists and is reasonable size**

```bash
ls -lh public/fonts/NotoSansShavian-Regular.woff2
# Should be ~10-20KB
```

- [ ] **Step 3: Commit**

```bash
git add public/fonts/NotoSansShavian-Regular.woff2
git commit -m "feat(shavian): bundle Noto Sans Shavian web font"
```

---

## Chunk 3: Tool UI Component

### Task 7: Register New Category and Tool

**Files:**
- Modify: `lib/tools.ts` — add "Turbo-nerd Shit" category and Shavian tool entry
- Modify: `app/tools/[toolId]/page.tsx` — add dynamic import for the tool component

- [ ] **Step 1: Add the new category and tool to `lib/tools.ts`**

Import the `Languages` icon at the top of the file alongside existing Lucide imports. Add a new category entry after the existing categories:

```typescript
// Add to imports at top:
import { Languages } from "lucide-react";

// Add new category to toolCategories array (after "calculators"):
{
  id: "turbo-nerd",
  name: "Turbo-nerd Shit",
  tools: [
    {
      id: "shavian-transliterator",
      name: "Shavian Transliterator",
      description: "Transliterate English text to the Shavian alphabet",
      icon: Languages,
      href: "/tools/shavian-transliterator",
      new: true,
    },
  ],
},
```

- [ ] **Step 2: Add to both tool registries**

The codebase has two registries. Add to both:

**`components/tools/index.tsx`** — add static import and registry entry:
```typescript
import { ShavianTransliteratorTool } from "./shavian-transliterator";

// In toolComponents record:
"shavian-transliterator": ShavianTransliteratorTool,
```

**`app/tools/[toolId]/page.tsx`** — add dynamic import to the `toolComponents` record:
```typescript
"shavian-transliterator": dynamic(() =>
  import("@/components/tools/shavian-transliterator").then(
    (mod) => mod.ShavianTransliteratorTool
  )
),
```

- [ ] **Step 3: Verify the tool page renders (even with placeholder)**

Create a minimal placeholder component first to confirm routing works:

```bash
# Quick check — create a one-liner placeholder, then visit localhost:3000/tools/shavian-transliterator
```

- [ ] **Step 4: Commit**

```bash
git add lib/tools.ts app/tools/\\[toolId\\]/page.tsx
git commit -m "feat(shavian): register Shavian Transliterator in new Turbo-nerd Shit category"
```

---

### Task 8: Gloss Grid Component

**Files:**
- Create: `components/tools/shavian-transliterator.tsx`

The main tool component: text input, gloss grid with three-row display, per-letter clickable Shavian with popover, status bar, and action buttons. This is the largest task.

- [ ] **Step 1: Create the tool component with font loading and input**

```typescript
// components/tools/shavian-transliterator.tsx
"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Download, Check, Loader2 } from "lucide-react";
import {
  tokenise,
  reResolveTokens,
  setCoreDictionary,
  setFullDictionary,
  type GlossToken,
  type GlossWord,
  type Phoneme,
  type Dictionary,
} from "@/lib/shavian/transliterate";
import { getAlternatives, type Alternative } from "@/lib/shavian/alternatives";
import { shavianToIpa, getShavianLetter } from "@/lib/shavian/phoneme-map";

// Load Shavian font via CSS
const shavianFontFace = `
@font-face {
  font-family: 'Noto Sans Shavian';
  src: url('/fonts/NotoSansShavian-Regular.woff2') format('woff2');
  font-display: swap;
}
`;

function parseDictJson(json: Record<string, string[]>): Dictionary {
  const map = new Map<string, string[]>();
  for (const [word, phonemes] of Object.entries(json)) {
    map.set(word, phonemes);
  }
  return map;
}

export function ShavianTransliteratorTool() {
  const [input, setInput] = useState("");
  const [tokens, setTokens] = useState<GlossToken[]>([]);
  const [dictStatus, setDictStatus] = useState<"loading-core" | "loading-full" | "ready">("loading-core");
  const [copied, setCopied] = useState(false);
  const [activePopover, setActivePopover] = useState<{ wordIdx: number; phonemeIdx: number } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const fullDictLoadedRef = useRef(false);

  // Inject font face
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = shavianFontFace;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  // Load core dictionary on mount
  useEffect(() => {
    import("@/lib/shavian/dictionary-core.json").then((mod) => {
      const dict = parseDictJson(mod.default);
      setCoreDictionary(dict);
      setDictStatus("loading-full");

      // Re-tokenise if there's existing input
      setTokens((prev) => (prev.length > 0 ? tokenise(input) : prev));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load full dictionary in background
  useEffect(() => {
    if (dictStatus !== "loading-full") return;

    fetch("/data/shavian-dictionary-full.json")
      .then((res) => res.json())
      .then((json) => {
        const dict = parseDictJson(json);
        setFullDictionary(dict);
        fullDictLoadedRef.current = true;
        setDictStatus("ready");

        // Re-resolve any heuristic words
        setTokens((prev) => reResolveTokens(prev));
      })
      .catch((err) => {
        console.error("Failed to load full dictionary:", err);
        setDictStatus("ready"); // Degrade gracefully
      });
  }, [dictStatus]);

  // Transliterate on input change (debounced slightly for paste)
  const handleInput = useCallback((text: string) => {
    setInput(text);
    setTokens(tokenise(text));
    setActivePopover(null);
  }, []);

  // Swap a phoneme for a word
  const swapPhoneme = useCallback(
    (wordIdx: number, phonemeIdx: number, alt: Alternative) => {
      setTokens((prev) => {
        const next = [...prev];
        const wordTokens = next.filter((t) => t.type === "word");
        const token = wordTokens[wordIdx];
        if (!token?.gloss) return prev;

        const newPhonemes = [...token.gloss.phonemes];
        newPhonemes[phonemeIdx] = {
          shavian: alt.shavian,
          ipa: alt.ipa,
          alternatives: getAlternatives(alt.shavian),
        };

        const isNamer = token.gloss.isNamer;
        const namerPrefix = isNamer ? "·" : "";

        token.gloss = {
          ...token.gloss,
          phonemes: newPhonemes,
          shavian: namerPrefix + newPhonemes.map((p) => p.shavian).join(""),
          ipa: newPhonemes.map((p) => p.ipa).join(""),
          userEdited: true,
        };

        return next;
      });
      setActivePopover(null);
    },
    []
  );

  // Copy Shavian text
  const copyShavian = useCallback(() => {
    const shavianText = tokens
      .map((t) => {
        if (t.type === "word" && t.gloss) return t.gloss.shavian;
        return t.value;
      })
      .join("");

    navigator.clipboard.writeText(shavianText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [tokens]);

  // Close popover on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setActivePopover(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Count word tokens for indexing
  const wordTokenIndices = useMemo(() => {
    const indices: number[] = [];
    tokens.forEach((t, i) => {
      if (t.type === "word") indices.push(i);
    });
    return indices;
  }, [tokens]);

  const hasContent = tokens.some((t) => t.type === "word");

  return (
    <div className="space-y-6">
      {/* Input */}
      <Textarea
        placeholder="Type or paste English text here..."
        value={input}
        onChange={(e) => handleInput(e.target.value)}
        className="min-h-[100px] text-base"
      />

      {/* Gloss Grid */}
      {hasContent && (
        <div className="rounded-lg border bg-card p-4">
          <div className="flex flex-wrap gap-x-5 gap-y-3 items-start">
            {tokens.map((token, tokenIdx) => {
              if (token.type === "whitespace") {
                return <div key={tokenIdx} className="w-2" />;
              }
              if (token.type === "punctuation") {
                return (
                  <span key={tokenIdx} className="text-muted-foreground text-lg self-center">
                    {token.value}
                  </span>
                );
              }
              if (!token.gloss) return null;

              const wordIdx = wordTokenIndices.indexOf(tokenIdx);
              const gloss = token.gloss;

              return (
                <div key={tokenIdx} className="flex flex-col items-start gap-0.5">
                  {/* Latin row */}
                  <span className="text-sm text-muted-foreground px-1">
                    {gloss.latin}
                  </span>

                  {/* Shavian row — per-letter clickable */}
                  <div className="flex gap-px">
                    {gloss.phonemes.map((phoneme, pIdx) => {
                      const isActive =
                        activePopover?.wordIdx === wordIdx &&
                        activePopover?.phonemeIdx === pIdx;

                      return (
                        <div key={pIdx} className="relative">
                          <button
                            onClick={() =>
                              setActivePopover(
                                isActive ? null : { wordIdx, phonemeIdx: pIdx }
                              )
                            }
                            className={`
                              text-[22px] leading-tight px-1 py-0.5 rounded
                              transition-all cursor-pointer
                              hover:bg-accent hover:-translate-y-0.5
                              ${isActive ? "bg-accent ring-2 ring-primary -translate-y-0.5" : ""}
                              ${gloss.isNamer ? "text-orange-400" : "text-foreground"}
                              ${gloss.source === "heuristic" && !gloss.userEdited ? "border-b-2 border-dashed border-destructive" : ""}
                            `}
                            style={{ fontFamily: "'Noto Sans Shavian', sans-serif" }}
                          >
                            {phoneme.shavian}
                          </button>

                          {/* Popover */}
                          {isActive && (
                            <div
                              ref={popoverRef}
                              className="absolute top-full left-0 z-50 mt-1 min-w-[180px] rounded-lg border bg-popover p-1.5 shadow-lg"
                            >
                              {/* Current selection */}
                              <div className="flex items-center gap-2.5 px-2.5 py-1.5 rounded bg-accent/50 border-l-2 border-primary mb-1">
                                <span
                                  className="text-xl w-7 text-center"
                                  style={{ fontFamily: "'Noto Sans Shavian', sans-serif" }}
                                >
                                  {phoneme.shavian}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {getShavianLetter(phoneme.shavian)?.name ?? ""}
                                </span>
                                <span className="text-xs text-green-500 ml-auto">
                                  /{phoneme.ipa}/
                                </span>
                              </div>

                              {/* Alternatives */}
                              {phoneme.alternatives.map((alt, aIdx) => (
                                <button
                                  key={aIdx}
                                  onClick={() => swapPhoneme(wordIdx, pIdx, alt)}
                                  className="flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded text-left hover:bg-accent transition-colors cursor-pointer"
                                >
                                  <span
                                    className="text-xl w-7 text-center"
                                    style={{ fontFamily: "'Noto Sans Shavian', sans-serif" }}
                                  >
                                    {alt.shavian}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {alt.name}
                                  </span>
                                  <span className="text-xs text-green-500 ml-auto">
                                    /{alt.ipa}/
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* IPA row — per-letter aligned */}
                  <div className="flex gap-px">
                    {gloss.phonemes.map((phoneme, pIdx) => (
                      <span
                        key={pIdx}
                        className="text-[13px] text-green-500 px-1 min-w-[20px]"
                      >
                        {phoneme.ipa}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Status bar */}
          <div className="flex items-center gap-4 mt-4 pt-4 border-t text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              Dictionary match
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-destructive" />
              Heuristic guess
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-orange-400" />
              Proper noun
            </span>
            {dictStatus === "loading-core" && (
              <span className="flex items-center gap-1.5 ml-auto">
                <Loader2 className="w-3 h-3 animate-spin" />
                Loading dictionary...
              </span>
            )}
            {dictStatus === "loading-full" && (
              <span className="flex items-center gap-1.5 ml-auto">
                <Loader2 className="w-3 h-3 animate-spin" />
                Loading full dictionary...
              </span>
            )}
            {dictStatus === "ready" && (
              <span className="ml-auto text-green-500">Dictionary ready</span>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      {hasContent && (
        <div className="flex gap-2">
          <Button onClick={copyShavian} className="gap-2">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? "Copied!" : "Copy Shavian"}
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => exportGloss(tokens)}>
            <Download className="w-4 h-4" />
            Export Gloss
          </Button>
        </div>
      )}
    </div>
  );
}

// PNG export — implemented in Task 9
function exportGloss(tokens: GlossToken[]) {
  // Placeholder — will be implemented in Task 9
  console.log("Export not yet implemented");
}
```

- [ ] **Step 2: Verify the tool renders in the browser**

Run `npm run dev` and navigate to `http://localhost:3000/tools/shavian-transliterator`. Type some text and verify:
- The gloss grid appears with three rows
- Shavian characters render correctly (requires font loaded)
- Clicking a Shavian letter shows the popover
- Clicking an alternative swaps the letter

- [ ] **Step 3: Commit**

```bash
git add components/tools/shavian-transliterator.tsx
git commit -m "feat(shavian): add Shavian Transliterator tool component with gloss grid"
```

---

## Chunk 4: Export & Polish

### Task 9: PNG Gloss Export

**Files:**
- Modify: `components/tools/shavian-transliterator.tsx` — replace `exportGloss` placeholder

Renders the three-row gloss to a canvas at 1200px width with word-wrapping and delphi.tools branding.

- [ ] **Step 1: Implement the export function**

Replace the placeholder `exportGloss` function in the tool component with:

```typescript
async function exportGloss(tokens: GlossToken[]) {
  const CANVAS_WIDTH = 1200;
  const PADDING = 40;
  const WORD_GAP = 24;
  const LINE_HEIGHT = 80; // Total height per gloss line (3 rows + gap)
  const CONTENT_WIDTH = CANVAS_WIDTH - PADDING * 2;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;

  // Ensure Shavian font is loaded
  await document.fonts.ready;

  // Detect theme
  const isDark = document.documentElement.classList.contains("dark") ||
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const BG_COLOR = isDark ? "#0a0a0a" : "#ffffff";
  const LATIN_COLOR = isDark ? "#8888aa" : "#666688";
  const SHAVIAN_COLOR = isDark ? "#e8e8ff" : "#1a1a2e";
  const IPA_COLOR = isDark ? "#66cc88" : "#227744";
  const BRAND_COLOR = isDark ? "#555" : "#aaa";

  // Measure words and compute line breaks
  const measurements: { token: GlossToken; width: number }[] = [];

  ctx.font = "14px system-ui";
  for (const token of tokens) {
    if (token.type === "word" && token.gloss) {
      const latinWidth = ctx.measureText(token.gloss.latin).width;
      ctx.font = "22px 'Noto Sans Shavian', sans-serif";
      const shavianText = token.gloss.phonemes.map((p) => p.shavian).join("");
      const shavianWidth = ctx.measureText(shavianText).width;
      ctx.font = "13px system-ui";
      const ipaWidth = ctx.measureText(token.gloss.ipa).width;
      ctx.font = "14px system-ui";
      const width = Math.max(latinWidth, shavianWidth, ipaWidth);
      measurements.push({ token, width });
    } else if (token.type === "punctuation") {
      const width = ctx.measureText(token.value).width;
      measurements.push({ token, width });
    }
  }

  // Compute line breaks
  const lines: typeof measurements[] = [];
  let currentLine: typeof measurements = [];
  let currentWidth = 0;

  for (const m of measurements) {
    if (currentWidth + m.width + WORD_GAP > CONTENT_WIDTH && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = [m];
      currentWidth = m.width;
    } else {
      currentLine.push(m);
      currentWidth += m.width + WORD_GAP;
    }
  }
  if (currentLine.length > 0) lines.push(currentLine);

  // Set canvas size
  const BRANDING_HEIGHT = 40;
  canvas.width = CANVAS_WIDTH;
  canvas.height = PADDING + lines.length * LINE_HEIGHT + BRANDING_HEIGHT + PADDING;

  // Background
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Render lines
  let y = PADDING;
  for (const line of lines) {
    let x = PADDING;
    for (const { token } of line) {
      // Punctuation tokens — render inline at Shavian row height
      if (token.type === "punctuation") {
        ctx.font = "18px system-ui";
        ctx.fillStyle = LATIN_COLOR;
        ctx.textAlign = "left";
        ctx.fillText(token.value, x, y + 42);
        x += ctx.measureText(token.value).width + 4;
        continue;
      }

      const gloss = token.gloss!;

      // Latin row
      ctx.font = "14px system-ui";
      ctx.fillStyle = LATIN_COLOR;
      ctx.textAlign = "left";
      ctx.fillText(gloss.latin, x, y + 14);

      // Shavian row (render namer dot if present)
      ctx.font = "22px 'Noto Sans Shavian', sans-serif";
      ctx.fillStyle = gloss.isNamer ? "#ff9f43" : SHAVIAN_COLOR;
      const shavianText = gloss.phonemes.map((p) => p.shavian).join("");
      const namerPrefix = gloss.isNamer ? "·" : "";
      ctx.fillText(namerPrefix + shavianText, x, y + 42);

      // IPA row
      ctx.font = "13px system-ui";
      ctx.fillStyle = IPA_COLOR;
      ctx.fillText(gloss.ipa, x, y + 62);

      const latinWidth = ctx.measureText(gloss.latin).width;
      ctx.font = "22px 'Noto Sans Shavian', sans-serif";
      const shavianWidth = ctx.measureText(namerPrefix + shavianText).width;
      const width = Math.max(latinWidth, shavianWidth) + WORD_GAP;
      x += width;
    }
    y += LINE_HEIGHT;
  }

  // Branding
  ctx.font = "12px system-ui";
  ctx.fillStyle = BRAND_COLOR;
  ctx.textAlign = "right";
  ctx.fillText("delphi.tools", CANVAS_WIDTH - PADDING, canvas.height - PADDING + 8);

  // Download
  const link = document.createElement("a");
  link.download = "shavian-gloss.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
}
```

- [ ] **Step 2: Test the export**

Type some text, click "Export Gloss", verify the PNG downloads with:
- Dark background
- Three rows visible per word
- Words wrap across lines
- delphi.tools branding in bottom-right

- [ ] **Step 3: Commit**

```bash
git add components/tools/shavian-transliterator.tsx
git commit -m "feat(shavian): add PNG gloss export with canvas rendering and branding"
```

---

### Task 10: Final Polish & Verification

**Files:**
- Modify: `components/tools/shavian-transliterator.tsx` — fix any issues found during testing
- Modify: `.gitignore` — add `.superpowers/`

- [ ] **Step 1: Full manual verification**

Test in browser at `http://localhost:3000/tools/shavian-transliterator`:

1. **Typing flow**: Type "The quick brown fox" word by word. Verify each word resolves to gloss after space.
2. **Paste flow**: Paste a paragraph. Verify all words transliterate.
3. **Per-letter editing**: Click a vowel in the Shavian row. Verify popover shows alternatives. Click an alternative. Verify the Shavian and IPA update.
4. **Heuristic words**: Type a made-up word like "flurbnok". Verify red dashed underline appears.
5. **Proper nouns**: Type "Hello World" — verify "World" gets orange namer dot treatment but "Hello" doesn't (sentence start).
6. **Copy Shavian**: Click copy, paste into a text editor. Verify Shavian Unicode text.
7. **Export Gloss**: Click export. Verify PNG downloads correctly.
8. **Dictionary loading**: On fresh page load, verify status bar shows loading progression.
9. **Sidebar**: Verify "Turbo-nerd Shit" category appears in sidebar with the tool listed.

- [ ] **Step 2: Fix any issues found**

Address any bugs or visual issues discovered during testing.

- [ ] **Step 3: Run production build**

```bash
npm run build
```

Verify no build errors. The new tool page should be statically generated.

- [ ] **Step 4: Final commit**

```bash
git add components/tools/shavian-transliterator.tsx
git commit -m "feat(shavian): polish and verify Shavian Transliterator tool"
```

---

## Deferred Features (v2)

The following spec features are intentionally deferred from this plan:

- **Ligatures and abbreviations** — opt-in abbreviation suggestions in the popover (e.g. 𐑿 for "of"). Requires a separate abbreviation dictionary.
- **Namer dot manual toggle** — per-word toggle to add/remove namer dot. Auto-detection covers the common case.
- **Byte-level download progress** — status bar shows spinner + "Loading full dictionary..." rather than bytes downloaded. Would require streaming/chunked fetch.
