"use client";

import { TEXT_STYLE_PRESETS, type TextStylePreset } from "@/lib/substrata/text-style";
import { cn } from "@/lib/utils";

/**
 * The four text styles as a flush segmented strip (Ruby 2026-07-06: regular ·
 * outline · on a pill · on a rectangle). Shared by the TEXT bloom (next text)
 * and the Inspector (selected text). Icons are glyph specimens — visual
 * chrome; the aria words are the standard style vocabulary.
 */

function StyleGlyph({ preset }: { preset: TextStylePreset }) {
  switch (preset) {
    case "regular":
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <text x="7" y="11" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor">
            A
          </text>
        </svg>
      );
    case "outline":
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <text
            x="7"
            y="11"
            textAnchor="middle"
            fontSize="11"
            fontWeight="700"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.9"
          >
            A
          </text>
        </svg>
      );
    case "pill":
    case "rectangle":
      return (
        <svg width="16" height="14" viewBox="0 0 16 14" aria-hidden>
          <rect
            x="1"
            y="2.5"
            width="14"
            height="9"
            rx={preset === "pill" ? 4.5 : 1}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <text x="8" y="10" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="currentColor">
            A
          </text>
        </svg>
      );
  }
}

export function TextStyleRow({
  value,
  onPick,
}: {
  value: TextStylePreset;
  onPick: (preset: TextStylePreset) => void;
}) {
  return (
    <span className="segmented grid-cols-4">
      {TEXT_STYLE_PRESETS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          aria-label={label}
          title={label}
          onClick={() => onPick(id)}
          className={cn(
            "grid h-7 min-w-[30px] place-items-center px-1.5",
            value === id
              ? "bg-primary text-primary-foreground"
              : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <StyleGlyph preset={id} />
        </button>
      ))}
    </span>
  );
}
