# Front page concepts — v2

Five HTML mockups for the 2.0 front page. Each is an addition to the shipped
page, not a rework: hero, Greatest Hits and the category grid stay as they
are. Open the files directly (file:// works; font and icons are embedded in
`frontpage.css`). The hero image is referenced from
`v2/delphitools-v2/public/`, so keep the folder inside the repo.

Static states are stacked and labelled with amber `▸ state:` lines; the
dashed amber banner at the top of each file is annotation, not design.

## The mocks

`01-drop-target.html` — the intake box. A framed drop area between hero and
catalogue. A dropped file collapses it to a file bar and surfaces a
"Matches" section of tools that accept the filetype; the rest of the
catalogue dims. Matching is a static map from extension to tool ids.

`02-omnibox.html` — the chosen direction, round two. One big box under the
hero for typing, pasting, and dropping; an idle legend strip names the three
actions. Typed input is plain search. A typed or pasted value that a
microtool can read gets answer rows fused under the box: the result renders
in the row, the arrow opens the full tool with the value carried over. Tools
that take the value without an inline answer follow as ordinary cells. A
dropped file collapses the box to a file bar and filters the catalogue as
mock 01. ⌘K focuses the field. Building 02 makes 01 redundant.

`03-workbench.html` — pinned and recently used tools in one compact strip
above Greatest Hits. localStorage only, absent until there is history, so a
first visit is identical to the shipped page. Pinning is a hover affordance
on the ordinary cells.

`04-quick-answers.html` — a row of working cells for one-field tools
(PX to REM, Colour Converter, Word Counter, Base Converter). The answer
renders in the cell; a corner arrow opens the full tool. The four micro
implementations are a few lines each and independent of the full tool
components.

`05-verbs.html` — a verb rail (Convert, Generate, Edit, Check, Extract,
Split) as a second axis over the registry. One verb narrows the catalogue to
one section; "All" restores the shipped page. Needs a `verbs` field per tool
in `lib/tools.ts`.

`06-colour-atlas.html` — Colour Atlas, a new catalogue tool rather than
front-page furniture: type one colour, read everything about it (notations,
nearest name, gamut position, contrast on white and black, harmonies, tints
and shades, colour-blindness renderings), leave into the specialised tools
with the value carried over. ColorHexa is the model. The value goes in the
URL hash so a colour page is shareable, which works under static export.
Notation follows the header selector like every colour tool. Proposed
registry entry: id `colour-atlas`, Colour category, likely `new: true`;
description pending (draft: "Everything about one colour, on one page").
The panels are the colour microtools from the table below, so the atlas,
the omnibox rows, and the quick-answer cells share implementations.

## How they combine

- 02 includes 01's behaviour. Pick one of the two.
- 03 and 04 stack under either without competing: bench strip first, quick
  answers second, catalogue third.
- The microtools below back 02's answer rows, 04's quick-answer cells, and
  06's panels; building them once serves all three surfaces.
- 06 is a tool, not a front-page change; the omnibox colour state's headline
  action becomes "open the Colour Atlas with this value". Colour is the only
  domain with the density for a hub: the file-shaped equivalents already
  exist as Font File Explorer and PDF Preflight.
- 05 competes with the category headers for the same job. It is the most
  opinionated of the five and the one most likely to read as a redesign.
- A conservative full assembly: 02 + 03, with 04 as a later addition.

## Microtools

Tools that can answer in an omnibox row from typed or pasted input alone.
Detection kind first, then what the row shows.

| Kind | Microtool | Row shows |
| --- | --- | --- |
| colour (`#hex`, `rgb()`, `hsl()`, `oklch()`, named) | Colour Converter | the other notations |
| colour | Contrast Checker | ratio on white and on black |
| colour | Tailwind Shade Generator | the 11-shade strip |
| colour | Harmony Generator | complement and triad swatches |
| colour | Colour Blindness Simulator | the colour under the three simulations |
| text | Word Counter | words · chars · sentences |
| text (letter frequency shifted) | Cipher Decoder | detected cipher + decoded preview |
| text | Encoding Tools | Base64 and URL-encoded forms; a Base64-shaped paste decodes instead |
| text (English words) | Shavian Transliterator | the transliteration |
| arithmetic expression | Scientific Calculator | the value |
| equation with a variable | Algebra Calculator | the solution |
| integer, `0x…`, `0b…`, `0o…` | Base Converter | the other bases |
| unix timestamp or ISO date | Time Calculator | the other representation |
| number + px/pt/em | PX to REM | the rem value |
| number + px/pt/em | Typography Calculator | the sibling units |
| number + measurement unit | Unit Converter | the sibling units |
| paper size name (`A4`, `letter`) | Paper Sizes | dimensions in mm and in |
| single glyph or `U+XXXX` | Glyph Browser | name, codepoint, block |
| Tailwind class (`m-4`) | Tailwind Cheat Sheet | the CSS it maps to |
| URL | QR Generator | a small QR preview |
| SVG markup | SVG Optimiser | optimised size next to the original |

Route-only (the value carries into the tool, no inline answer): Palette
Generator, Gradient Generator, Text Scratchpad, Text Editor, Large Type,
Text Diff, Document Converter, Meta Tag Generator, Regex Tester, Barcode
Generator, Graph Calculator.

## Copy

The two new strings of four or more words (intake helper line in 01,
omnibox placeholder in 02) carry draft wording, placed directly because
these are research mocks; rewrite them when the real page is built. All
other new strings are one to three words; catalogue names, descriptions and
the hero copy are carried over verbatim from `app/lib/tools.ts` and the
shipped index template.

## Not decided here

- Filetype→tool map and value parsers for 02 (extension list, which formats
  count as a colour, URL handling).
- Whether the bench strip caps at one row or wraps.
- Verb vocabulary and per-tool assignments for 05.

## Decided here

<!-- ∑CG: explains the chosen omnibox detection order and confidence thresholds -->

- Cap: `MAX_ANSWERS = 6`.
- Detection order: colour; SVG; URL (QR); glyph (`U+XXXX` or single
  codepoint); paper size; Tailwind class; unit; integer; timestamp;
  arithmetic expression; algebra; encoding; Shavian; prose/cipher.
- Confidence floors for noisy readings:
  - Cipher: existing `CIPHER_FLOOR = 0.35`, `CIPHER_CONFIDENCE = 1.2`,
    printable ratio ≥ 0.9.
  - Base64: length ≥ 8, valid Base64 alphabet, decodes to printable
    ratio ≥ 0.8.
  - Shavian: at least 2 alphabetic words.
