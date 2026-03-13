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

- ~5–10k most common English words
- Bundled as a JSON module, available instantly on component mount via dynamic import
- ~200–300KB estimated size
- Each entry maps `word → { shavian: string, ipa: string, phonemes: Phoneme[] }`

### Tier 2: Full Dictionary (lazy-loaded)

- ~134k words sourced from CMU Pronouncing Dictionary + Read Lexicon
- Loaded as a static JSON asset via `fetch()` in the background after mount
- Read Lexicon entries take precedence over CMU where both cover the same word
- Merges into the active lookup map when ready
- UI shows loading progress in the status bar ("Loading full dictionary... 5,231 / 134,166 words")

### Tier 3: Heuristic Fallback

- For words not found in either dictionary, apply letter-to-phoneme rules to produce a best-guess transliteration
- Heuristic-resolved words are flagged visually (red dashed underline) so the user knows to verify them

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
- **Consonants:** Phonetically similar consonants shown (e.g. voiced/unvoiced pairs like 𐑐/𐑚, 𐑑/𐑛)
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

- Renders the gloss to an HTML5 Canvas
- Background matches current theme (light/dark)
- All three rows rendered per word, wrapping naturally
- delphi.tools branding in the bottom corner
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

A build script (not part of the runtime app) processes:

1. CMU Pronouncing Dictionary (ARPABET phonemes for ~134k words)
2. Read Lexicon data (Shavian-specific, community-vetted)

And produces:

- `dictionary-core.json` — top 5–10k words by frequency
- `shavian-dictionary-full.json` — all ~134k words

Read Lexicon entries override CMU entries where both exist. The script maps ARPABET phonemes to Shavian characters and IPA, and pre-computes the alternatives list for each phoneme position.

## Dependencies

- No new external dependencies anticipated
- Canvas rendering for PNG export uses browser-native APIs
- Shavian Unicode rendering depends on the user's system having a Shavian-capable font; may need to bundle or link one (e.g. Noto Sans Shavian) as a web font
