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
  AE: "𐑨", AH0: "𐑩", AH: "𐑳", AA: "𐑪", AA_PALM: "𐑭",
  UH: "𐑫", IH: "𐑦", EH: "𐑧",
  EY: "𐑱", IY: "𐑰", IY0: "𐑦", AY: "𐑲",
  OW: "𐑴", UW: "𐑵", OY: "𐑶",
  AW: "𐑬", AO: "𐑷",
  ER: "𐑼",
  // Merged sequences
  YUW: "𐑿",  // yew ligature (Y + UW)
};

// ARPABET to IPA mapping
const ARPABET_TO_IPA: Record<string, string> = {
  P: "p", T: "t", K: "k", F: "f",
  TH: "θ", S: "s", SH: "ʃ", CH: "tʃ",
  B: "b", D: "d", G: "ɡ", V: "v",
  DH: "ð", Z: "z", ZH: "ʒ", JH: "dʒ",
  Y: "j", W: "w", NG: "ŋ", HH: "h",
  M: "m", N: "n", L: "l", R: "r",
  AE: "æ", AH0: "ə", AH: "ʌ", AA: "ɒ", AA_PALM: "ɑː",
  UH: "ʊ", IH: "ɪ", EH: "ɛ",
  EY: "eɪ", IY: "iː", IY0: "i", AY: "aɪ",
  OW: "oʊ", UW: "uː", OY: "ɔɪ",
  AW: "aʊ", AO: "ɔː",
  ER: "ɚ",
  // Merged sequences
  YUW: "juː",  // yew ligature
};

// Strip stress markers from ARPABET vowels: "AH1" → "AH", "AH0" → "AH0" (special case for schwa)
export function normalizeArpabet(code: string): string {
  // AH with stress 0 is schwa (𐑩), AH with stress 1/2 is strut (𐑳)
  if (code.startsWith("AH")) {
    return code.endsWith("0") ? "AH0" : "AH";
  }
  // IY with stress 0 is kit (𐑦), IY with stress 1/2 is fleece (𐑰)
  // Per Shavian spelling rule 11: final unstressed -y/-ie is 𐑦 not 𐑰
  if (code.startsWith("IY")) {
    return code.endsWith("0") ? "IY0" : "IY";
  }
  return code.replace(/[012]$/, "");
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
