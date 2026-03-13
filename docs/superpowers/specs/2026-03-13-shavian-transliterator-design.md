# Shavian Transliterator — Design Spec

**Date:** 2026-03-13
**Category:** Turbo-nerd Shit (new category)
**Tool ID:** `shavian-transliterator`
**Component:** `ShavianTransliteratorTool`

## Overview

A browser-based Shavian alphabet transliterator that converts English text into Shavian Unicode characters with an interactive interlinear gloss display. Users type or paste English text and see a three-row gloss: Latin text, clickable Shavian letters, and derived IPA pronunciation. Individual Shavian letters are clickable to swap phonemes, enabling precise correction of the transliteration.

All processing happens client-side. No data leaves the browser.

## New Category: Turbo-nerd Shit

A new tool category (`id: "turbo-nerd"`) added to `lib/tools.ts`. The Shavian transliterator is the first tool in it. Uses the `Languages` icon from Lucide for the tool.

## Dictionary Architecture (Hybrid — Approach C)

Three tiers of word resolution, loaded progressively:

### Tier 1: Core Dictionary (bundled)

- Top 7,500 most common English words by Brown corpus frequency
- Bundled as a JSON module, available instantly on component mount via dynamic import
- ~250KB estimated size
- Each entry maps `word → { shavian: string, ipa: string, phonemes: Phoneme[] }`

### Tier 2: Full Dictionary (lazy-loaded)

- ~134k words sourced from CMU Pronouncing Dictionary + Read Lexicon
- Loaded as a static JSON asset via `fetch()` in the background after mount
- Read Lexicon entries take precedence over CMU where both cover the same word
- Merges into the active lookup map when ready
- Status bar shows a loading spinner with bytes-downloaded progress while fetching, then "Dictionary ready" once loaded and merged

### Tier 3: Heuristic Fallback

- For words not found in either dictionary, a rule-based grapheme-to-phoneme converter produces a best-guess transliteration
- Strategy: a table of ~80–100 English grapheme patterns (e.g. "tion" → /ʃən/, "ph" → /f/, "ough" → /oʊ/) applied longest-match-first, with single-letter fallbacks for unmatched characters. Not intended to be perfect — just good enough to produce something editable.
- Heuristic-resolved words are flagged visually (red dashed underline) so the user knows to verify them

### Re-resolution on Tier 2 Load

- When the full dictionary finishes loading, any words currently resolved via heuristic are automatically re-checked against the full dictionary
- Words that now have dictionary matches are upgraded: red underline removed, phonemes replaced with dictionary values
- Words where the user has manually swapped any phoneme are left untouched (user edits are preserved)
- Words still not in the full dictionary remain flagged as heuristic

### Phoneme Data Model

```typescript
interface Phoneme {
  shavian: string;       // Shavian Unicode character
  ipa: string;           // IPA representation
  arpabet: string;       // ARPABET source code (from CMU)
  alternatives: Array<{  // Other valid phonemes for this position
    shavian: string;
    ipa: string;
    name: string;        // Shavian letter keyword name (e.g. "peep", "out")
  }>;
}

interface WordEntry {
  shavian: string;       // Full Shavian rendering
  ipa: string;           // Full IPA rendering
  phonemes: Phoneme[];   // Per-letter breakdown
  source: 'core' | 'full' | 'heuristic';
}
```

### Mapping Module

A small mapping module handles conversions between ARPABET → IPA and ARPABET → Shavian Unicode. The Shavian-to-IPA direction (used for the pronunciation row) is a direct lookup since each Shavian letter has an unambiguous phonetic value.

## Transliteration Engine

### Word Processing Pipeline

1. Input text is tokenised on word boundaries, preserving punctuation and whitespace
2. Each word is lowercased for dictionary lookup; original casing is preserved in the Latin row
3. Capitalised words at non-sentence-start positions receive the namer dot (·) prefix in Shavian output
4. Each word resolves to an array of `Phoneme` objects via the three-tier lookup

### Streaming Behaviour

- Transliteration fires on every word boundary (space, punctuation)
- While typing, the current in-progress word shows as plain Latin text
- Once the user hits space or punctuation, the word resolves into the three-row gloss
- Pasting text triggers the pipeline on all words at once

### Per-Letter Alternative Selection

When the user clicks a Shavian letter in the gloss, a popover shows alternative phonemes:

- **Vowels:** All Shavian vowel characters shown as alternatives (vowel ambiguity is the primary source of transliteration errors)
- **Consonants:** Grouped by similarity — voicing pairs (𐑐 peep / 𐑚 bib, 𐑑 tot / 𐑛 dead, 𐑒 kick / 𐑜 gag, 𐑓 fee / 𐑝 vow, 𐑔 thigh / 𐑞 they, 𐑕 so / 𐑟 zoo, 𐑖 sure / 𐑠 measure, 𐑗 church / 𐑡 judge) and place-of-articulation neighbours (nasals 𐑥/𐑯/𐑙, liquids 𐑤/𐑮)
- Each alternative displays: Shavian character, keyword name (peep, bib, tot, etc.), and IPA value
- Selecting an alternative swaps that letter and updates the IPA row below it

## Shavian Features

### Character Set

- All 48 core Shavian letters supported (24 tall, 24 deep)
- Full Unicode range: U+10450 to U+1047F

### Namer Dot

- Namer dot (·) auto-applied to capitalised words not at sentence-start position
- Manual toggle available per word to add/remove namer dot

### Ligatures and Abbreviations

- When a word has a common Shavian abbreviation (e.g. 𐑿 for "of"), the popover includes it as an option alongside the letter-by-letter spelling
- Abbreviation usage is opt-in per word, not automatic

### Punctuation and Numbers

- Punctuation passes through unchanged (Shavian uses Latin punctuation)
- Numbers pass through as-is (Shavian has no numeral system)

## UI Layout

### Input Area

- Single text input at top of the tool
- Supports both typing (with streaming transliteration) and paste

### Gloss Grid

- Left-aligned `flex-wrap` layout
- Three rows per word, left-aligned within each word column:
  - **Latin row** (14px, muted colour): Original English text, read-only reference
  - **Shavian row** (22px, bright, interactive): Each letter is an independently clickable block. This row is the source of truth.
  - **IPA row** (13px, green): Pronunciation derived from the Shavian row above, not from the English. Aligned per-letter with the Shavian row.
- Words wrap naturally across lines

### Visual Indicators

- **Orange text:** Proper noun with namer dot
- **Red dashed underline:** Heuristic guess (not dictionary-confirmed)
- **Hover state:** Subtle background + slight upward translate on Shavian letters to indicate interactivity
- **Active state:** Purple outline on clicked letter with popover visible

### Letter Popover

- Appears below the clicked Shavian letter, left-aligned to it
- Shows alternative phonemes as a vertical list
- Each row: Shavian character, keyword name, IPA value
- Current selection highlighted with left border accent
- Clicking an alternative swaps the letter immediately

### Status Bar

- Legend showing the three visual states (dictionary match, heuristic guess, proper noun)
- Dictionary loading progress indicator when Tier 2 is loading

### Actions

- **Copy Shavian** (primary button): Copies full Shavian Unicode text to clipboard as plain text
- **Export Gloss**: Renders the three-row interlinear gloss as a branded PNG

## Export

### Copy Shavian

- Copies the concatenated Shavian text (with spaces and punctuation preserved) to clipboard
- Uses the Clipboard API

### Export Gloss (PNG)

- Renders the gloss to an HTML5 Canvas at a fixed width of 1200px
- Word-wrapping computed by measuring each word group's width (Latin text width as the reference) and breaking to a new line when cumulative width exceeds the canvas width minus padding
- Background matches current theme (light/dark)
- All three rows rendered per word group, maintaining the same left-aligned layout as the DOM version
- delphi.tools branding in the bottom corner
- Canvas height determined dynamically by number of wrapped lines
- Downloads as PNG

## File Structure

```
components/tools/shavian-transliterator.tsx    # Main tool component
lib/shavian/
  dictionary-core.json                          # Tier 1: bundled core dictionary
  phoneme-map.ts                                # ARPABET ↔ IPA ↔ Shavian mappings
  transliterate.ts                              # Tokenisation + lookup pipeline
  heuristic.ts                                  # Letter-to-phoneme fallback rules
  alternatives.ts                               # Per-letter alternative generation
public/data/
  shavian-dictionary-full.json                  # Tier 2: full dictionary (static asset)
```

## Dictionary Build Process

A standalone Node.js build script at `scripts/build-shavian-dict.ts` (not part of the runtime app, run manually when dictionary sources are updated). It processes:

1. **CMU Pronouncing Dictionary** — downloaded as `cmudict.dict` (ARPABET phonemes, ~134k words)
2. **Read Lexicon data** — Shavian-specific community-vetted entries (sourced as CSV or JSON)
3. **Word frequency list** — Brown corpus word frequency data used to rank words for core dictionary inclusion

And produces:

- `lib/shavian/dictionary-core.json` — top 7,500 words by Brown corpus frequency
- `public/data/shavian-dictionary-full.json` — all ~134k words

Read Lexicon entries override CMU entries where both exist. The script maps ARPABET phonemes to Shavian characters and IPA, and pre-computes the alternatives list for each phoneme position.

Run with: `npx tsx scripts/build-shavian-dict.ts`

## Dependencies

- **Noto Sans Shavian** web font — bundled as a self-hosted WOFF2 file in `public/fonts/`. Shavian characters are not in most system fonts, so this is required for the tool to function. Noto Sans Shavian is ~15KB as WOFF2. Loaded via `@font-face` in the tool component, not globally.
- Canvas rendering for PNG export uses browser-native APIs (no external dependency)
- The canvas export must also load the Shavian font for correct rendering
