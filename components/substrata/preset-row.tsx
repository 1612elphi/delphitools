"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Ellipsis } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Preset-first value controls (Ruby, 2026-07-06: "a simple editor for simple
 * people" — most shape parameters offer a few good presets plus a custom (…)
 * escape hatch). Shared by the PIECES settings bloom and the Inspector's
 * shape section, so both surfaces read identically.
 */

/** Compact value + up/down stepper (the omnibar Nudge cell's pattern). */
export function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, v)));
  return (
    <span className="flex items-stretch border border-border">
      <span className="grid h-6 min-w-[42px] place-items-center px-1 text-[11px] tabular-nums">
        {value}
        {unit ? ` ${unit}` : ""}
      </span>
      <StepBtn
        icon={ChevronUp}
        onClick={() => set(value + step)}
        disabled={value >= max}
        aria="Increase"
      />
      <StepBtn
        icon={ChevronDown}
        onClick={() => set(value - step)}
        disabled={value <= min}
        aria="Decrease"
      />
    </span>
  );
}

export function StepBtn({
  icon: Icon,
  aria,
  onClick,
  disabled,
}: {
  icon: LucideIcon;
  aria: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={aria}
      title={aria}
      className="grid h-6 w-[22px] place-items-center border-l border-border text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
    >
      <Icon className="size-3" />
    </button>
  );
}

/** Rounded-square glyph for corner-radius presets — visual, not copy. */
export function CornerPresetIcon({ r }: { r: number }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <rect x="1.5" y="1.5" width="11" height="11" rx={r} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export interface PresetOption {
  value: number;
  /** number-ish text (self-labelling data) — or supply an icon instead */
  label?: string;
  icon?: React.ReactNode;
  /** required with icon-only options; \u2211CG at call sites */
  aria?: string;
}

/**
 * A flush strip of preset buttons + an (…) cell revealing a custom Stepper.
 * The strip highlights the matching preset, or the (…) cell when the live
 * value is off-menu. Every path writes through `onChange` (callers make each
 * commit one undo step / one settings patch).
 */
export function PresetRow({
  options,
  value,
  onChange,
  eps = 0.5,
  min,
  max,
  step = 1,
  unit,
}: {
  options: PresetOption[];
  value: number;
  onChange: (v: number) => void;
  /** preset-match tolerance (fractional presets round to px) */
  eps?: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}) {
  const [open, setOpen] = useState(false);
  const isCustom = !options.some((o) => Math.abs(o.value - value) <= eps);

  return (
    <div className="flex flex-col items-end gap-1">
      <span className="segmented" style={{ gridTemplateColumns: `repeat(${options.length + 1}, minmax(0, 1fr))` }}>
        {options.map((o) => {
          const active = Math.abs(o.value - value) <= eps;
          return (
            <button
              key={o.value}
              type="button"
              aria-label={o.aria ?? o.label}
              title={o.aria ?? o.label}
              onClick={() => onChange(o.value)}
              className={cn(
                "grid h-6 min-w-[26px] place-items-center px-1.5 text-[10.5px] tabular-nums",
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {o.icon ?? o.label}
            </button>
          );
        })}
        <button
          type="button"
          aria-label="Custom"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "grid h-6 min-w-[26px] place-items-center px-1.5",
            isCustom || open
              ? "bg-primary text-primary-foreground"
              : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <Ellipsis className="size-3.5" />
        </button>
      </span>
      {open && <Stepper value={Math.round(value)} onChange={onChange} min={min} max={max} step={step} unit={unit} />}
    </div>
  );
}

/** The segmented-cell active/inactive class pair — ONE source so the four
 *  hand-rolled segmented groups (gradient ModePair, TextAlignRow, LTR/RTL,
 *  wand mode) can't drift. A full generic SegmentedGroup is the upgrade if a
 *  fifth site appears. */
export function segCellClass(active: boolean): string {
  return active
    ? "bg-primary text-primary-foreground"
    : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground";
}
