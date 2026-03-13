// Processes CMU Pronouncing Dictionary into two JSON files:
// - lib/shavian/dictionary-core.json (top 7,500 words by frequency)
// - public/data/shavian-dictionary-full.json (all words)
//
// Run: npx tsx scripts/build-shavian-dict.ts
//
// Requires:
//   scripts/data/cmudict.dict — from https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict
//   scripts/data/word-frequency.txt — one word per line, most frequent first

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = join(__dirname, "data");
const CMU_PATH = join(SCRIPTS_DIR, "cmudict.dict");
const FREQ_PATH = join(SCRIPTS_DIR, "word-frequency.txt");
const CORE_OUTPUT = join(__dirname, "..", "lib", "shavian", "dictionary-core.json");
const FULL_OUTPUT = join(__dirname, "..", "public", "data", "shavian-dictionary-full.json");
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
  const coreDir = dirname(CORE_OUTPUT);
  const fullDir = dirname(FULL_OUTPUT);
  if (!existsSync(coreDir)) mkdirSync(coreDir, { recursive: true });
  if (!existsSync(fullDir)) mkdirSync(fullDir, { recursive: true });

  writeFileSync(CORE_OUTPUT, coreJson);
  writeFileSync(FULL_OUTPUT, fullJson);

  console.log(`Core dictionary: ${coreWords.length} words (${(coreJson.length / 1024).toFixed(0)}KB)`);
  console.log(`Full dictionary: ${dict.size} words (${(fullJson.length / 1024 / 1024).toFixed(1)}MB)`);
  console.log(`Written to:\n  ${CORE_OUTPUT}\n  ${FULL_OUTPUT}`);
}

main();
