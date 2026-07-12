"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { rgbToHex } from "@/lib/substrata/colour-convert";
import { hslToRgb, rgbToHsl } from "@/lib/substrata/colour-hsv";
import { setRgb, type ColourSnapshot } from "@/lib/substrata/colour-store";
import { Knob, clamp01, usePointerArea } from "@/components/substrata/modules/colour-picker-kit";

/**
 * Colour mode 3 — SLIDERS with manual input. Per-channel gradient track + a
 * numeric field, switchable between an RGB set (R/G/B 0–255) and an HSL set
 * (H 0–360, S/L 0–100) via the segmented toggle. Ported from sketches/pickers.html
 * §"3 · RGB SLIDERS" (.rgbtop/.chan/.track/.cv).
 *
 * All maths lives in colour-convert / colour-hsv; this file is pure UI + pointer
 * handling. Reads come from the `colour` prop; writes go through setRgb — RGB
 * channels write directly, HSL channels read via rgbToHsl(colour.rgb) and write
 * via setRgb(hslToRgb(...)). Channel letters (R/G/B, H/S/L) and the RGB/HSL
 * segment labels are functional glyphs, not copy; only aria-labels are gaps.
 */

type SetId = "rgb" | "hsl";

const HUE_SPECTRUM = "linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)";

interface Row {
  /** Channel glyph — standard letter, not copy. */
  label: string;
  /** Committed display value (integer, in display units). */
  value: number;
  min: number;
  max: number;
  /** Handle position, 0–1. */
  pos: number;
  /** CSS background reflecting the channel. */
  track: string;
  /** Commit a typed display-unit value to the store. */
  onCommit: (n: number) => void;
}

export function SlidersMode({ colour }: { colour: ColourSnapshot }) {
  const [set, setSet] = useState<SetId>("rgb");

  // A track drag emits a normalised x (0–1); write it to channel `row` of the
  // active set. Recomputed each render, so the closure sees the current colour.
  const writeTrack = (row: number, x: number) => {
    const n = clamp01(x);
    if (set === "rgb") {
      const key = (["r", "g", "b"] as const)[row];
      setRgb({ ...colour.rgb, [key]: Math.round(n * 255) });
    } else {
      const cur = rgbToHsl(colour.rgb);
      if (row === 0) setRgb(hslToRgb({ ...cur, h: n * 360 }));
      else if (row === 1) setRgb(hslToRgb({ ...cur, s: n }));
      else setRgb(hslToRgb({ ...cur, l: n }));
    }
  };

  const [t0Ref, t0Bind] = usePointerArea((x) => writeTrack(0, x));
  const [t1Ref, t1Bind] = usePointerArea((x) => writeTrack(1, x));
  const [t2Ref, t2Bind] = usePointerArea((x) => writeTrack(2, x));
  const trackRefs = [t0Ref, t1Ref, t2Ref];
  const trackBinds = [t0Bind, t1Bind, t2Bind];

  const rows: Row[] = set === "rgb" ? rgbRows(colour) : hslRows(colour);

  return (
    <div className="flex h-full flex-col">
      {/* RGB | HSL set toggle */}
      <div className="flex items-center justify-end border-b border-border p-2">
        <div className="segmented grid-cols-2 text-[10.5px]">
          {(["rgb", "hsl"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSet(s)}
              className={cn(
                "grid h-[22px] min-w-[40px] cursor-default place-items-center px-2 tabular-nums",
                set === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {s.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* channel rows — fill the panel evenly (footer swatch shows the preview) */}
      {rows.map((row, i) => (
        <div
          key={row.label}
          className="flex min-h-0 flex-1 items-center gap-2.5 border-b border-border px-3"
        >
          <span className="w-3 shrink-0 text-[11px] font-bold text-muted-foreground">
            {row.label}
          </span>
          <div
            ref={trackRefs[i]}
            {...trackBinds[i]}
            className="relative h-4 flex-1 touch-none border border-border"
            style={{ background: row.track }}
          >
            <Knob x={row.pos} y={0.5} />
          </div>
          <ChannelInput value={row.value} min={row.min} max={row.max} onCommit={row.onCommit} />
        </div>
      ))}
    </div>
  );
}

// ── channel-set view models ──────────────────────────────────────────────────

function rgbRows(colour: ColourSnapshot): Row[] {
  const { r, g, b } = colour.rgb;
  return [
    {
      label: "R",
      value: r,
      min: 0,
      max: 255,
      pos: r / 255,
      track: "linear-gradient(to right,#000,#f00)",
      onCommit: (n) => setRgb({ ...colour.rgb, r: n }),
    },
    {
      label: "G",
      value: g,
      min: 0,
      max: 255,
      pos: g / 255,
      track: "linear-gradient(to right,#000,#0f0)",
      onCommit: (n) => setRgb({ ...colour.rgb, g: n }),
    },
    {
      label: "B",
      value: b,
      min: 0,
      max: 255,
      pos: b / 255,
      track: "linear-gradient(to right,#000,#00f)",
      onCommit: (n) => setRgb({ ...colour.rgb, b: n }),
    },
  ];
}

function hslRows(colour: ColourSnapshot): Row[] {
  const hsl = rgbToHsl(colour.rgb);
  const sTrack = `linear-gradient(to right,${rgbToHex(hslToRgb({ ...hsl, s: 0 }))},${rgbToHex(
    hslToRgb({ ...hsl, s: 1 }),
  )})`;
  const lTrack = `linear-gradient(to right,#000,${rgbToHex(hslToRgb({ ...hsl, l: 0.5 }))},#fff)`;
  return [
    {
      label: "H",
      value: Math.round(hsl.h),
      min: 0,
      max: 360,
      pos: hsl.h / 360,
      track: HUE_SPECTRUM,
      onCommit: (n) => setRgb(hslToRgb({ ...hsl, h: n })),
    },
    {
      label: "S",
      value: Math.round(hsl.s * 100),
      min: 0,
      max: 100,
      pos: hsl.s,
      track: sTrack,
      onCommit: (n) => setRgb(hslToRgb({ ...hsl, s: n / 100 })),
    },
    {
      label: "L",
      value: Math.round(hsl.l * 100),
      min: 0,
      max: 100,
      pos: hsl.l,
      track: lTrack,
      onCommit: (n) => setRgb(hslToRgb({ ...hsl, l: n / 100 })),
    },
  ];
}

// ── numeric channel field ────────────────────────────────────────────────────

/** Editable numeric field: commits on blur/Enter (clamped + rounded to range),
 *  reverts on invalid input or Escape. Mirrors HexInput in colour-panel.tsx. */
function ChannelInput({
  value,
  min,
  max,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  onCommit: (n: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(value);

  const commit = () => {
    if (draft === null) return;
    const n = Number(draft.trim());
    if (draft.trim() !== "" && Number.isFinite(n)) {
      onCommit(Math.max(min, Math.min(max, Math.round(n))));
    }
    setDraft(null); // invalid → snap back to the live value
  };

  return (
    <input
      className="h-6 w-11 shrink-0 border border-border bg-card px-1.5 text-right text-[11.5px] tabular-nums outline-none focus:border-primary"
      value={shown}
      inputMode="numeric"
      spellCheck={false}
      aria-label="Red channel"
      onChange={(e) => setDraft(e.currentTarget.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          setDraft(null);
          e.currentTarget.blur();
        }
      }}
    />
  );
}
