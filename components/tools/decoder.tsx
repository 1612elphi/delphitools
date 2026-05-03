"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  ClipboardPaste,
  Copy,
  Sparkles,
  Sliders,
  Wand2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

// ────────────────────────────────────────────────────────────────────────────
// Sample ciphertexts shown when input is empty
// ────────────────────────────────────────────────────────────────────────────

const SAMPLES: { label: string; text: string }[] = [
  { label: "Caesar", text: "AOL XBPJR IYVDU MVE QBTWZ VCLY AOL SHGF KVN" },
  { label: "ROT13", text: "Abj vf gur jvagre bs bhe qvfpbagrag znqr tybevbhf fhzzre" },
  { label: "Vigenère", text: "Vsxt tmq wpt aplrrh ha wlpn hzh eys han asn vbkich kzhex ioqqkd ioiw rpklz zict hvg edz dpb rzi" },
  { label: "Morse", text: ".... . .-.. .-.. --- / .-- --- .-. .-.. -.." },
  { label: "Hex", text: "50 72 69 76 61 63 79 20 69 73 20 70 6f 77 65 72 2e" },
  { label: "Base64", text: "VGhlIGNyb3cgZmxpZXMgYXQgbWlkbmlnaHQu" },
];

// ────────────────────────────────────────────────────────────────────────────
// English-likeness scoring
// ────────────────────────────────────────────────────────────────────────────

const ENGLISH_FREQ: Record<string, number> = {
  A: 8.167, B: 1.492, C: 2.782, D: 4.253, E: 12.702, F: 2.228, G: 2.015,
  H: 6.094, I: 6.966, J: 0.153, K: 0.772, L: 4.025, M: 2.406, N: 6.749,
  O: 7.507, P: 1.929, Q: 0.095, R: 5.987, S: 6.327, T: 9.056, U: 2.758,
  V: 0.978, W: 2.360, X: 0.150, Y: 1.974, Z: 0.074,
};

const COMMON_WORDS = new Set([
  "THE", "BE", "TO", "OF", "AND", "A", "IN", "THAT", "HAVE", "I", "IT",
  "FOR", "NOT", "ON", "WITH", "HE", "AS", "YOU", "DO", "AT", "THIS", "BUT",
  "HIS", "BY", "FROM", "THEY", "WE", "SAY", "HER", "SHE", "OR", "AN", "WILL",
  "MY", "ONE", "ALL", "WOULD", "THERE", "THEIR", "WHAT", "SO", "UP", "OUT",
  "IF", "ABOUT", "WHO", "GET", "WHICH", "GO", "ME", "WHEN", "MAKE", "CAN",
  "LIKE", "TIME", "NO", "JUST", "HIM", "KNOW", "TAKE", "PEOPLE", "INTO",
  "YEAR", "YOUR", "GOOD", "SOME", "COULD", "THEM", "SEE", "OTHER", "THAN",
  "THEN", "NOW", "LOOK", "ONLY", "COME", "ITS", "OVER", "THINK", "ALSO",
  "BACK", "AFTER", "USE", "TWO", "HOW", "OUR", "WORK", "FIRST", "WELL",
  "WAY", "EVEN", "NEW", "WANT", "BECAUSE", "ANY", "THESE", "GIVE", "DAY",
  "MOST", "US", "IS", "WAS", "ARE", "BEEN", "HAS", "HAD", "WERE", "SAID",
]);

function chiSquaredScore(text: string): number {
  const counts: Record<string, number> = {};
  let total = 0;
  for (const ch of text.toUpperCase()) {
    if (ch >= "A" && ch <= "Z") {
      counts[ch] = (counts[ch] ?? 0) + 1;
      total++;
    }
  }
  if (total === 0) return Infinity;
  let chi = 0;
  for (const letter of Object.keys(ENGLISH_FREQ)) {
    const observed = counts[letter] ?? 0;
    const expected = (ENGLISH_FREQ[letter] / 100) * total;
    chi += ((observed - expected) ** 2) / expected;
  }
  return chi;
}

function commonWordRatio(text: string): number {
  const words = text.toUpperCase().match(/[A-Z]+/g);
  if (!words || words.length === 0) return 0;
  let hits = 0;
  for (const w of words) {
    if (COMMON_WORDS.has(w)) hits++;
  }
  return hits / words.length;
}

// Higher = more English-like. Ranges roughly 0..1.
function englishLikeness(text: string): number {
  const letters = text.replace(/[^A-Za-z]/g, "");
  if (letters.length < 3) return 0;
  const chi = chiSquaredScore(text);
  // Map chi to (0..1] — typical English ~10-30, random ~80-200.
  const chiScore = Math.max(0, 1 - chi / 100);
  const wordScore = Math.min(1, commonWordRatio(text) * 3);
  return chiScore * 0.6 + wordScore * 0.4;
}

// ────────────────────────────────────────────────────────────────────────────
// Cipher implementations
// ────────────────────────────────────────────────────────────────────────────

function caesarShift(text: string, shift: number): string {
  const s = ((shift % 26) + 26) % 26;
  let out = "";
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= 65 && code <= 90) {
      out += String.fromCharCode(((code - 65 + s) % 26) + 65);
    } else if (code >= 97 && code <= 122) {
      out += String.fromCharCode(((code - 97 + s) % 26) + 97);
    } else {
      out += ch;
    }
  }
  return out;
}

function rot47(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= 33 && code <= 126) {
      out += String.fromCharCode(33 + ((code - 33 + 47) % 94));
    } else {
      out += ch;
    }
  }
  return out;
}

function atbash(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= 65 && code <= 90) out += String.fromCharCode(90 - (code - 65));
    else if (code >= 97 && code <= 122) out += String.fromCharCode(122 - (code - 97));
    else out += ch;
  }
  return out;
}

function vigenere(text: string, key: string, encode: boolean): string {
  const cleanKey = key.toUpperCase().replace(/[^A-Z]/g, "");
  if (cleanKey.length === 0) return text;
  let out = "";
  let ki = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    const isUpper = code >= 65 && code <= 90;
    const isLower = code >= 97 && code <= 122;
    if (isUpper || isLower) {
      const base = isUpper ? 65 : 97;
      const shift = cleanKey.charCodeAt(ki % cleanKey.length) - 65;
      const adj = encode ? shift : -shift;
      out += String.fromCharCode(((code - base + adj + 26) % 26) + base);
      ki++;
    } else {
      out += ch;
    }
  }
  return out;
}

function modInverse(a: number, m: number): number | null {
  a = ((a % m) + m) % m;
  for (let x = 1; x < m; x++) {
    if ((a * x) % m === 1) return x;
  }
  return null;
}

function affine(text: string, a: number, b: number, encode: boolean): string {
  const inv = encode ? null : modInverse(a, 26);
  if (!encode && inv === null) throw new Error("'a' must be coprime with 26 (try 1,3,5,7,9,11,15,17,19,21,23,25).");
  let out = "";
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    const isUpper = code >= 65 && code <= 90;
    const isLower = code >= 97 && code <= 122;
    if (isUpper || isLower) {
      const base = isUpper ? 65 : 97;
      const x = code - base;
      const y = encode
        ? (a * x + b) % 26
        : ((inv as number) * (x - b + 26)) % 26;
      out += String.fromCharCode(y + base);
    } else {
      out += ch;
    }
  }
  return out;
}

// ── Morse ───────────────────────────────────────────────────────────────────

const MORSE: Record<string, string> = {
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.",
  H: "....", I: "..", J: ".---", K: "-.-", L: ".-..", M: "--", N: "-.",
  O: "---", P: ".--.", Q: "--.-", R: ".-.", S: "...", T: "-", U: "..-",
  V: "...-", W: ".--", X: "-..-", Y: "-.--", Z: "--..",
  "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-",
  "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.",
  ".": ".-.-.-", ",": "--..--", "?": "..--..", "'": ".----.", "!": "-.-.--",
  "/": "-..-.", "(": "-.--.", ")": "-.--.-", "&": ".-...", ":": "---...",
  ";": "-.-.-.", "=": "-...-", "+": ".-.-.", "-": "-....-", "_": "..--.-",
  '"': ".-..-.", "$": "...-..-", "@": ".--.-.",
};
const MORSE_REVERSE: Record<string, string> = Object.fromEntries(
  Object.entries(MORSE).map(([k, v]) => [v, k]),
);

function morseEncode(text: string): string {
  return text
    .toUpperCase()
    .split(/(\s+)/)
    .map((chunk) => {
      if (/^\s+$/.test(chunk)) return "/";
      return chunk
        .split("")
        .map((c) => MORSE[c] ?? "")
        .filter(Boolean)
        .join(" ");
    })
    .join(" ");
}

function morseDecode(text: string): string {
  return text
    .trim()
    .split(/\s*\/\s*|\s{2,}/)
    .map((word) =>
      word
        .trim()
        .split(/\s+/)
        .map((sym) => MORSE_REVERSE[sym] ?? "")
        .join(""),
    )
    .join(" ");
}

// ── A1Z26 ───────────────────────────────────────────────────────────────────

function a1z26Encode(text: string): string {
  return text
    .toUpperCase()
    .split(/(\s+)/)
    .map((chunk) => {
      if (/^\s+$/.test(chunk)) return " / ";
      return chunk
        .split("")
        .filter((c) => c >= "A" && c <= "Z")
        .map((c) => c.charCodeAt(0) - 64)
        .join("-");
    })
    .join("");
}

function a1z26Decode(text: string): string {
  return text
    .split(/\s*\/\s*|\s{2,}/)
    .map((word) =>
      word
        .split(/[-\s,]+/)
        .filter(Boolean)
        .map((n) => {
          const v = parseInt(n, 10);
          if (!Number.isFinite(v) || v < 1 || v > 26) return "";
          return String.fromCharCode(64 + v);
        })
        .join(""),
    )
    .join(" ");
}

// ── Bacon's cipher ──────────────────────────────────────────────────────────

const BACON: Record<string, string> = {
  A: "AAAAA", B: "AAAAB", C: "AAABA", D: "AAABB", E: "AABAA", F: "AABAB",
  G: "AABBA", H: "AABBB", I: "ABAAA", J: "ABAAB", K: "ABABA", L: "ABABB",
  M: "ABBAA", N: "ABBAB", O: "ABBBA", P: "ABBBB", Q: "BAAAA", R: "BAAAB",
  S: "BAABA", T: "BAABB", U: "BABAA", V: "BABAB", W: "BABBA", X: "BABBB",
  Y: "BBAAA", Z: "BBAAB",
};
const BACON_REVERSE: Record<string, string> = Object.fromEntries(
  Object.entries(BACON).map(([k, v]) => [v, k]),
);

function baconEncode(text: string): string {
  return text
    .toUpperCase()
    .split(/(\s+)/)
    .map((chunk) => {
      if (/^\s+$/.test(chunk)) return " ";
      return chunk
        .split("")
        .filter((c) => c >= "A" && c <= "Z")
        .map((c) => BACON[c])
        .join(" ");
    })
    .join("");
}

function baconDecode(text: string): string {
  const cleaned = text.toUpperCase().replace(/[^AB]/g, "");
  let out = "";
  for (let i = 0; i + 5 <= cleaned.length; i += 5) {
    const grp = cleaned.slice(i, i + 5);
    out += BACON_REVERSE[grp] ?? "?";
  }
  return out;
}

// ── Rail fence ──────────────────────────────────────────────────────────────

function railFenceEncode(text: string, rails: number): string {
  if (rails < 2) return text;
  const fence: string[][] = Array.from({ length: rails }, () => []);
  let r = 0;
  let dir = 1;
  for (const ch of text) {
    fence[r].push(ch);
    if (r === 0) dir = 1;
    else if (r === rails - 1) dir = -1;
    r += dir;
  }
  return fence.map((row) => row.join("")).join("");
}

function railFenceDecode(text: string, rails: number): string {
  if (rails < 2) return text;
  const len = text.length;
  // Build the zig-zag pattern of row indices, then assign characters by row.
  const pattern: number[] = [];
  let r = 0;
  let dir = 1;
  for (let i = 0; i < len; i++) {
    pattern.push(r);
    if (r === 0) dir = 1;
    else if (r === rails - 1) dir = -1;
    r += dir;
  }
  const rowCounts = Array.from({ length: rails }, (_, k) =>
    pattern.filter((p) => p === k).length,
  );
  const rowChars: string[][] = [];
  let idx = 0;
  for (let k = 0; k < rails; k++) {
    rowChars.push(text.slice(idx, idx + rowCounts[k]).split(""));
    idx += rowCounts[k];
  }
  const cursors = new Array(rails).fill(0);
  let out = "";
  for (let i = 0; i < len; i++) {
    const row = pattern[i];
    out += rowChars[row][cursors[row]++];
  }
  return out;
}

// ── Encodings ───────────────────────────────────────────────────────────────

function utf8ToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}
function bytesToUtf8(b: Uint8Array): string {
  return new TextDecoder().decode(b);
}

function base64Decode(s: string): string {
  const cleaned = s.replace(/\s+/g, "");
  const bin = atob(cleaned);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytesToUtf8(bytes);
}
function base64Encode(s: string): string {
  const bytes = utf8ToBytes(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Decode(s: string): string {
  const cleaned = s.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  let bits = "";
  for (const ch of cleaned) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error("Invalid Base32 character.");
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return bytesToUtf8(new Uint8Array(bytes));
}
function base32Encode(s: string): string {
  const bytes = utf8ToBytes(s);
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  while (bits.length % 5 !== 0) bits += "0";
  let out = "";
  for (let i = 0; i < bits.length; i += 5) {
    out += B32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  while (out.length % 8 !== 0) out += "=";
  return out;
}

function hexDecode(s: string): string {
  const cleaned = s.replace(/\s+/g, "").replace(/^0x/i, "");
  if (cleaned.length % 2 !== 0) throw new Error("Hex must have even length.");
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const byte = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) throw new Error("Invalid hex character.");
    bytes[i] = byte;
  }
  return bytesToUtf8(bytes);
}
function hexEncode(s: string): string {
  return Array.from(utf8ToBytes(s))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
}

function binaryDecode(s: string): string {
  const cleaned = s.replace(/[^01]/g, "");
  if (cleaned.length === 0 || cleaned.length % 8 !== 0)
    throw new Error("Binary must be a multiple of 8 bits.");
  const bytes = new Uint8Array(cleaned.length / 8);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleaned.slice(i * 8, i * 8 + 8), 2);
  }
  return bytesToUtf8(bytes);
}
function binaryEncode(s: string): string {
  return Array.from(utf8ToBytes(s))
    .map((b) => b.toString(2).padStart(8, "0"))
    .join(" ");
}

// ────────────────────────────────────────────────────────────────────────────
// Vigenère cryptanalysis (Index of Coincidence)
// ────────────────────────────────────────────────────────────────────────────

function indexOfCoincidence(text: string): number {
  const counts = new Array(26).fill(0);
  let n = 0;
  for (const ch of text.toUpperCase()) {
    const code = ch.charCodeAt(0);
    if (code >= 65 && code <= 90) {
      counts[code - 65]++;
      n++;
    }
  }
  if (n < 2) return 0;
  let sum = 0;
  for (const c of counts) sum += c * (c - 1);
  return sum / (n * (n - 1));
}

function bestCaesarShiftForGroup(group: string): number {
  let bestShift = 0;
  let bestChi = Infinity;
  for (let s = 0; s < 26; s++) {
    const shifted = caesarShift(group, -s);
    const chi = chiSquaredScore(shifted);
    if (chi < bestChi) {
      bestChi = chi;
      bestShift = s;
    }
  }
  return bestShift;
}

function guessVigenereKey(text: string, maxLen = 10): { key: string; ioc: number } | null {
  const letters = text.toUpperCase().replace(/[^A-Z]/g, "");
  if (letters.length < 20) return null;

  // Compute avg IoC for each candidate key length.
  const iocs: number[] = [0, 0];
  const upper = Math.min(maxLen, Math.floor(letters.length / 4));
  for (let len = 2; len <= upper; len++) {
    let avg = 0;
    for (let off = 0; off < len; off++) {
      let group = "";
      for (let i = off; i < letters.length; i += len) group += letters[i];
      avg += indexOfCoincidence(group);
    }
    iocs.push(avg / len);
  }

  // Multiples of the true key length also have high IoC (a length of 10 looks
  // identical to length 5 when the key is LEMON). Prefer the shortest length
  // whose IoC is within tolerance of the best — otherwise we silently pick a
  // multiple and produce a key like "LEMONLEMON".
  const maxIoC = Math.max(...iocs);
  if (maxIoC < 0.055) return null;
  let bestLen = 0;
  for (let len = 2; len <= upper; len++) {
    if (iocs[len] >= maxIoC - 0.008) {
      bestLen = len;
      break;
    }
  }
  if (bestLen === 0) return null;
  const bestAvgIoC = iocs[bestLen];

  let key = "";
  for (let off = 0; off < bestLen; off++) {
    let group = "";
    for (let i = off; i < letters.length; i += bestLen) group += letters[i];
    key += String.fromCharCode(65 + bestCaesarShiftForGroup(group));
  }
  return { key, ioc: bestAvgIoC };
}

// ────────────────────────────────────────────────────────────────────────────
// Auto-detection pipeline
// ────────────────────────────────────────────────────────────────────────────

type CipherId =
  | "caesar" | "rot13" | "rot47" | "atbash" | "vigenere" | "affine"
  | "morse" | "a1z26" | "bacon" | "rail-fence"
  | "base64" | "base32" | "hex" | "binary";

interface ManualParams {
  caesarShift: number;
  vigenereKey: string;
  affineA: number;
  affineB: number;
  rails: number;
}

interface Candidate {
  cipher: string;
  cipherId: CipherId;
  detail: string;
  output: string;
  score: number;
  params?: Partial<ManualParams>;
}

function safeTry<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

function classifyAndDecode(input: string): Candidate[] {
  const trimmed = input.trim();
  if (!trimmed) return [];

  const candidates: Candidate[] = [];

  // ── Character-set classifiers (often unambiguous) ─────────────────────────
  const onlyMorse = /^[.\-\s/|]+$/.test(trimmed);
  if (onlyMorse) {
    const out = safeTry(() => morseDecode(trimmed));
    if (out) candidates.push({ cipher: "Morse code", cipherId: "morse", detail: "", output: out, score: 0.95 });
  }

  const onlyBinary = /^[01\s]+$/.test(trimmed) && trimmed.replace(/\s/g, "").length >= 8;
  if (onlyBinary) {
    const out = safeTry(() => binaryDecode(trimmed));
    if (out && englishLikeness(out) > 0.05) {
      candidates.push({ cipher: "Binary", cipherId: "binary", detail: "8-bit", output: out, score: 0.9 });
    }
  }

  const onlyHex = /^(0x)?[0-9a-fA-F\s]+$/.test(trimmed) && trimmed.replace(/\s|0x/gi, "").length >= 4;
  if (onlyHex) {
    const out = safeTry(() => hexDecode(trimmed));
    if (out && englishLikeness(out) > 0.05) {
      candidates.push({ cipher: "Hex", cipherId: "hex", detail: "", output: out, score: 0.88 });
    }
  }

  const onlyB64 = /^[A-Za-z0-9+/=\s]+$/.test(trimmed) && trimmed.replace(/\s/g, "").length >= 4 && trimmed.replace(/\s/g, "").length % 4 === 0;
  if (onlyB64) {
    const out = safeTry(() => base64Decode(trimmed));
    if (out && englishLikeness(out) > 0.05) {
      candidates.push({ cipher: "Base64", cipherId: "base64", detail: "", output: out, score: 0.85 });
    }
  }

  const cleanedB32 = trimmed.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  const onlyB32 = /^[A-Z2-7]+$/.test(cleanedB32) && cleanedB32.length >= 8;
  if (onlyB32) {
    const out = safeTry(() => base32Decode(trimmed));
    if (out && englishLikeness(out) > 0.05) {
      candidates.push({ cipher: "Base32", cipherId: "base32", detail: "", output: out, score: 0.82 });
    }
  }

  const onlyBacon = /^[ABab\s]+$/.test(trimmed) && trimmed.replace(/[^ABab]/g, "").length >= 10;
  if (onlyBacon) {
    const out = safeTry(() => baconDecode(trimmed));
    if (out && englishLikeness(out) > 0.1) {
      candidates.push({ cipher: "Bacon's cipher", cipherId: "bacon", detail: "", output: out, score: 0.78 });
    }
  }

  const onlyA1Z26 = /^[\d\s\-/,.]+$/.test(trimmed) && /\d/.test(trimmed);
  if (onlyA1Z26) {
    const out = safeTry(() => a1z26Decode(trimmed));
    if (out && out.length > 0 && englishLikeness(out) > 0.1) {
      candidates.push({ cipher: "A1Z26", cipherId: "a1z26", detail: "", output: out, score: 0.75 });
    }
  }

  // ── Alphabet ciphers (only if input contains letters) ─────────────────────
  const hasLetters = /[A-Za-z]/.test(trimmed);
  if (hasLetters) {
    // All Caesar shifts — keep top 3
    const caesarTries: { shift: number; output: string; score: number }[] = [];
    for (let s = 1; s < 26; s++) {
      const out = caesarShift(trimmed, -s);
      caesarTries.push({ shift: s, output: out, score: englishLikeness(out) });
    }
    caesarTries.sort((a, b) => b.score - a.score);
    for (const t of caesarTries.slice(0, 3)) {
      if (t.score > 0.2) {
        const isRot13 = t.shift === 13;
        candidates.push({
          cipher: isRot13 ? "ROT13" : `Caesar (shift ${t.shift})`,
          cipherId: isRot13 ? "rot13" : "caesar",
          detail: "",
          output: t.output,
          score: t.score,
          params: isRot13 ? undefined : { caesarShift: t.shift },
        });
      }
    }

    // Atbash
    const atb = atbash(trimmed);
    const atbScore = englishLikeness(atb);
    if (atbScore > 0.2) candidates.push({ cipher: "Atbash", cipherId: "atbash", detail: "", output: atb, score: atbScore });

    // ROT47 (ASCII variant — bonus only when input has visible-ASCII variety)
    const rotted = rot47(trimmed);
    const rottedScore = englishLikeness(rotted);
    if (rottedScore > 0.25) candidates.push({ cipher: "ROT47", cipherId: "rot47", detail: "", output: rotted, score: rottedScore });

    // Vigenère — IoC-based key recovery, lengths 2..10
    const guess = guessVigenereKey(trimmed, 10);
    if (guess) {
      const decoded = vigenere(trimmed, guess.key, false);
      const score = englishLikeness(decoded);
      if (score > 0.25) {
        candidates.push({
          cipher: "Vigenère",
          cipherId: "vigenere",
          detail: `key: ${guess.key}`,
          output: decoded,
          score: score * 0.95,
          params: { vigenereKey: guess.key },
        });
      }
    }

    // Affine — try all coprime a values
    const coprimes = [1, 3, 5, 7, 9, 11, 15, 17, 19, 21, 23, 25];
    let bestAff: { a: number; b: number; output: string; score: number } | null = null;
    for (const a of coprimes) {
      if (a === 1) continue; // a=1 reduces to Caesar, already covered
      for (let b = 0; b < 26; b++) {
        const out = safeTry(() => affine(trimmed, a, b, false));
        if (!out) continue;
        const score = englishLikeness(out);
        if (!bestAff || score > bestAff.score) bestAff = { a, b, output: out, score };
      }
    }
    if (bestAff && bestAff.score > 0.3) {
      candidates.push({
        cipher: "Affine",
        cipherId: "affine",
        detail: `a=${bestAff.a}, b=${bestAff.b}`,
        output: bestAff.output,
        score: bestAff.score * 0.9,
        params: { affineA: bestAff.a, affineB: bestAff.b },
      });
    }

    // Rail fence — try rails 2..8
    let bestRail: { rails: number; output: string; score: number } | null = null;
    for (let r = 2; r <= 8; r++) {
      const out = railFenceDecode(trimmed, r);
      const score = englishLikeness(out);
      if (!bestRail || score > bestRail.score) bestRail = { rails: r, output: out, score };
    }
    if (bestRail && bestRail.score > 0.3) {
      candidates.push({
        cipher: "Rail fence",
        cipherId: "rail-fence",
        detail: `${bestRail.rails} rails`,
        output: bestRail.output,
        score: bestRail.score * 0.85,
        params: { rails: bestRail.rails },
      });
    }
  }

  // De-dupe identical outputs (keep best)
  const seen = new Map<string, Candidate>();
  for (const c of candidates) {
    const prev = seen.get(c.output);
    if (!prev || c.score > prev.score) seen.set(c.output, c);
  }

  return Array.from(seen.values()).sort((a, b) => b.score - a.score).slice(0, 8);
}

// ────────────────────────────────────────────────────────────────────────────
// Manual cipher dispatch
// ────────────────────────────────────────────────────────────────────────────

const CIPHER_OPTIONS: { value: CipherId; label: string; group: string }[] = [
  { value: "caesar", label: "Caesar", group: "Classical" },
  { value: "rot13", label: "ROT13", group: "Classical" },
  { value: "rot47", label: "ROT47", group: "Classical" },
  { value: "atbash", label: "Atbash", group: "Classical" },
  { value: "vigenere", label: "Vigenère", group: "Classical" },
  { value: "affine", label: "Affine", group: "Classical" },
  { value: "rail-fence", label: "Rail fence", group: "Classical" },
  { value: "morse", label: "Morse code", group: "Codes" },
  { value: "a1z26", label: "A1Z26", group: "Codes" },
  { value: "bacon", label: "Bacon's cipher", group: "Codes" },
  { value: "base64", label: "Base64", group: "Encodings" },
  { value: "base32", label: "Base32", group: "Encodings" },
  { value: "hex", label: "Hex", group: "Encodings" },
  { value: "binary", label: "Binary", group: "Encodings" },
];

function runManual(
  input: string,
  cipher: CipherId,
  encode: boolean,
  p: ManualParams,
): string {
  if (!input) return "";
  switch (cipher) {
    case "caesar":
      return caesarShift(input, encode ? p.caesarShift : -p.caesarShift);
    case "rot13":
      return caesarShift(input, 13);
    case "rot47":
      return rot47(input);
    case "atbash":
      return atbash(input);
    case "vigenere":
      return vigenere(input, p.vigenereKey, encode);
    case "affine":
      return affine(input, p.affineA, p.affineB, encode);
    case "rail-fence":
      return encode ? railFenceEncode(input, p.rails) : railFenceDecode(input, p.rails);
    case "morse":
      return encode ? morseEncode(input) : morseDecode(input);
    case "a1z26":
      return encode ? a1z26Encode(input) : a1z26Decode(input);
    case "bacon":
      return encode ? baconEncode(input) : baconDecode(input);
    case "base64":
      return encode ? base64Encode(input) : base64Decode(input);
    case "base32":
      return encode ? base32Encode(input) : base32Decode(input);
    case "hex":
      return encode ? hexEncode(input) : hexDecode(input);
    case "binary":
      return encode ? binaryEncode(input) : binaryDecode(input);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────

export function DecoderTool() {
  const [input, setInput] = useState("");
  const [activeTab, setActiveTab] = useState<"auto" | "manual">("auto");
  const [cipher, setCipher] = useState<CipherId>("caesar");
  const [mode, setMode] = useState<"decode" | "encode">("decode");
  const [params, setParams] = useState<ManualParams>({
    caesarShift: 3,
    vigenereKey: "",
    affineA: 5,
    affineB: 8,
    rails: 3,
  });
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const candidates = useMemo(() => classifyAndDecode(input), [input]);

  const manualOutput = useMemo(() => {
    try {
      return runManual(input, cipher, mode === "encode", params);
    } catch (e) {
      return e instanceof Error ? `Error: ${e.message}` : "Error";
    }
  }, [input, cipher, mode, params]);

  const manualHasError = manualOutput.startsWith("Error:");

  const copy = async (value: string, key: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setInput(text);
    } catch {
      // Permission denied or no clipboard support — silently no-op.
    }
  };

  const openInManual = (c: Candidate) => {
    setCipher(c.cipherId);
    setMode("decode");
    if (c.params) setParams((prev) => ({ ...prev, ...c.params }));
    setActiveTab("manual");
  };

  return (
    <div className="space-y-6">
      {/* ── Input ─────────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Input</Label>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={pasteFromClipboard}
              className="h-7 px-2 text-muted-foreground hover:text-foreground"
            >
              <ClipboardPaste className="size-3.5 mr-1.5" />
              Paste
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setInput("")}
              disabled={!input}
              className="h-7 px-2 text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <X className="size-3.5 mr-1.5" />
              Clear
            </Button>
          </div>
        </div>
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Paste cipher text or plaintext here…"
          className="font-mono min-h-[140px]"
        />
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "auto" | "manual")}>
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="auto">
            <Wand2 className="size-4 mr-2" />
            Auto-decode
          </TabsTrigger>
          <TabsTrigger value="manual">
            <Sliders className="size-4 mr-2" />
            Manual
          </TabsTrigger>
        </TabsList>

        {/* ── Auto-decode ──────────────────────────────────────────────── */}
        <TabsContent value="auto" className="space-y-4">
          {!input.trim() ? (
            <div className="rounded-lg border border-dashed p-8 space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Enter ciphertext above to see ranked decoding candidates.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <span className="text-xs text-muted-foreground">Try a sample:</span>
                {SAMPLES.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => setInput(s.text)}
                    className="text-xs px-2.5 py-1 rounded-full border bg-background hover:bg-muted transition-colors"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ) : candidates.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No confident matches found. Try the Manual tab if you know the cipher.
            </div>
          ) : (
            <div className="space-y-3">
              {candidates.map((c, i) => {
                const isHero = i === 0;
                const score = Math.round(c.score * 100);
                const canOpenInManual = c.params !== undefined;
                return (
                  <div
                    key={`${c.cipher}-${i}`}
                    className={cn(
                      "rounded-lg border bg-card transition-colors",
                      isHero ? "p-5 ring-1 ring-primary/40" : "p-4 hover:border-foreground/15",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        {isHero && <Sparkles className="size-4 text-primary shrink-0" />}
                        <span className={cn("font-medium", isHero && "text-base")}>{c.cipher}</span>
                        {c.detail && (
                          <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {c.detail}
                          </span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0"
                        onClick={() => copy(c.output, `auto-${i}`)}
                        title="Copy output"
                      >
                        {copiedKey === `auto-${i}` ? (
                          <Check className="size-4 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <Copy className="size-4" />
                        )}
                      </Button>
                    </div>

                    {/* Confidence bar */}
                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            isHero ? "bg-primary" : "bg-primary/60",
                          )}
                          style={{ width: `${Math.max(4, score)}%` }}
                        />
                      </div>
                      <span className="text-xs tabular-nums text-muted-foreground w-9 text-right">
                        {score}%
                      </span>
                    </div>

                    <pre
                      className={cn(
                        "font-mono whitespace-pre-wrap break-words rounded bg-muted/40 p-3",
                        isHero ? "text-sm" : "text-xs",
                      )}
                    >
                      {c.output}
                    </pre>

                    {canOpenInManual && (
                      <div className="mt-3 flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openInManual(c)}
                          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                        >
                          Tweak in Manual
                          <ArrowRight className="size-3 ml-1" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Candidates are ranked by English-likeness (letter frequency + common words). Vigenère key recovery uses the Index of Coincidence and works best on ciphertext longer than ~50 letters.
          </p>
        </TabsContent>

        {/* ── Manual ───────────────────────────────────────────────────── */}
        <TabsContent value="manual" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Left column — controls */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Cipher</Label>
                <Select value={cipher} onValueChange={(v) => setCipher(v as CipherId)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["Classical", "Codes", "Encodings"].map((group) => (
                      <SelectGroup key={group}>
                        <SelectLabel>{group}</SelectLabel>
                        {CIPHER_OPTIONS.filter((o) => o.group === group).map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Direction</Label>
                <div className="grid grid-cols-2 rounded-md border bg-muted/30 p-1">
                  {(["decode", "encode"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(m)}
                      className={cn(
                        "text-sm py-1.5 rounded transition-colors capitalize",
                        mode === m
                          ? "bg-background shadow-sm font-medium"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cipher-specific parameters */}
              {cipher === "caesar" && (
                <div className="space-y-2">
                  <Label>Shift (1–25)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={25}
                    value={params.caesarShift}
                    onChange={(e) =>
                      setParams({ ...params, caesarShift: Number(e.target.value) || 0 })
                    }
                  />
                </div>
              )}

              {cipher === "vigenere" && (
                <div className="space-y-2">
                  <Label>Key</Label>
                  <Input
                    value={params.vigenereKey}
                    onChange={(e) =>
                      setParams({ ...params, vigenereKey: e.target.value })
                    }
                    placeholder="e.g. LEMON"
                    className="font-mono uppercase"
                  />
                </div>
              )}

              {cipher === "affine" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>a <span className="text-muted-foreground font-normal">(coprime w/ 26)</span></Label>
                    <Select
                      value={String(params.affineA)}
                      onValueChange={(v) => setParams({ ...params, affineA: Number(v) })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 3, 5, 7, 9, 11, 15, 17, 19, 21, 23, 25].map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>b <span className="text-muted-foreground font-normal">(0–25)</span></Label>
                    <Input
                      type="number"
                      min={0}
                      max={25}
                      value={params.affineB}
                      onChange={(e) =>
                        setParams({ ...params, affineB: Number(e.target.value) || 0 })
                      }
                    />
                  </div>
                </div>
              )}

              {cipher === "rail-fence" && (
                <div className="space-y-2">
                  <Label>Rails (2–10)</Label>
                  <Input
                    type="number"
                    min={2}
                    max={10}
                    value={params.rails}
                    onChange={(e) =>
                      setParams({ ...params, rails: Number(e.target.value) || 2 })
                    }
                  />
                </div>
              )}
            </div>

            {/* Right column — output */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Output</Label>
                {manualOutput && !manualHasError && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copy(manualOutput, "manual")}
                    className="h-7 px-2 text-muted-foreground hover:text-foreground"
                  >
                    {copiedKey === "manual" ? (
                      <Check className="size-3.5 mr-1.5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Copy className="size-3.5 mr-1.5" />
                    )}
                    Copy
                  </Button>
                )}
              </div>
              <div
                className={cn(
                  "rounded-lg border bg-card min-h-[200px] p-3",
                  manualHasError && "border-destructive/50",
                )}
              >
                {!input ? (
                  <p className="text-sm text-muted-foreground italic">
                    Enter input above to see the result.
                  </p>
                ) : (
                  <pre
                    className={cn(
                      "font-mono text-sm whitespace-pre-wrap break-words",
                      manualHasError && "text-destructive",
                    )}
                  >
                    {manualOutput}
                  </pre>
                )}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Reference */}
      <Accordion type="single" collapsible>
        <AccordionItem value="ref" className="border-b-0">
          <AccordionTrigger className="text-sm">Cipher reference</AccordionTrigger>
          <AccordionContent>
            <div className="text-sm text-muted-foreground space-y-3">
              <div>
                <p className="font-medium text-foreground">Classical (alphabet) ciphers</p>
                <ul className="list-disc list-inside space-y-1 mt-1">
                  <li><strong>Caesar</strong> — fixed shift along the alphabet (key: 1–25).</li>
                  <li><strong>ROT13</strong> — Caesar with shift 13 (self-inverse).</li>
                  <li><strong>ROT47</strong> — shift 47 across printable ASCII (33–126).</li>
                  <li><strong>Atbash</strong> — A↔Z, B↔Y, … (no key).</li>
                  <li><strong>Vigenère</strong> — repeating-keyword polyalphabetic shift.</li>
                  <li><strong>Affine</strong> — y = (a·x + b) mod 26; a coprime with 26.</li>
                  <li><strong>Rail fence</strong> — zig-zag transposition over N rails.</li>
                </ul>
              </div>
              <div>
                <p className="font-medium text-foreground">Codes</p>
                <ul className="list-disc list-inside space-y-1 mt-1">
                  <li><strong>Morse code</strong> — dots and dashes; <code>/</code> separates words.</li>
                  <li><strong>A1Z26</strong> — A=1, B=2, …, Z=26.</li>
                  <li><strong>Bacon&apos;s cipher</strong> — five-bit A/B groups per letter.</li>
                </ul>
              </div>
              <div>
                <p className="font-medium text-foreground">Encodings</p>
                <ul className="list-disc list-inside space-y-1 mt-1">
                  <li><strong>Base64 / Base32 / Hex / Binary</strong> — byte-level encodings, not ciphers.</li>
                </ul>
              </div>
              <div>
                <p className="font-medium text-foreground">Not included</p>
                <p>Playfair, Hill, Enigma, custom monoalphabetic substitution, and columnar transposition are not in this tool. They each need substantial setup (5×5 grids, matrix maths, rotor wirings, custom key tables) and are best served by dedicated tools.</p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
