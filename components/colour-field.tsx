"use client";

import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Shared colour line-item primitives — the flush swatch + deferred hex input
 * pattern used across delphitools colour tools (gradient generator, Substrata
 * colour picker, …). DESIGN.md §10: native colour input as a full-cell swatch;
 * hex text commits on blur/Enter and reverts invalid drafts.
 */

/** Strip leading #(s), validate a 6-digit hex → "#rrggbb", or null if invalid. */
export function normalizeHex(hex: string): string | null {
  const stripped = hex.replace(/^#+/, "");
  return /^[a-f\d]{6}$/i.test(stripped) ? `#${stripped}` : null;
}

/**
 * Draft-while-typing, commit-on-blur/Enter input controller. Keeps the field
 * responsive without firing onChange per keystroke, and reverts an invalid draft
 * to the last committed value. `parse` returns the normalised value or null.
 */
export function useDeferredInput(
  value: string,
  parse: (draft: string) => string | null,
  onCommit: (parsed: string) => void,
) {
  // `draft === null` ⇒ not editing ⇒ show the live `value` (external updates flow
  // straight through). Typing seeds the draft; blur/Enter commits and clears it.
  // No effect needed, so external changes never stomp an in-progress edit.
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = () => {
    if (draft === null) return;
    const result = parse(draft);
    if (result !== null) onCommit(result);
    setDraft(null); // invalid or committed → snap back to the live value
  };

  return {
    ref: inputRef,
    value: draft ?? value,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value),
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
        inputRef.current?.blur();
      }
    },
  };
}

/** Hex text field that commits a normalised `#rrggbb` on blur/Enter. */
export function DeferredHexInput({
  value,
  onChange,
  className,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  "aria-label"?: string;
}) {
  const inputProps = useDeferredInput(value, (d) => normalizeHex(d), onChange);
  return <Input {...inputProps} aria-label={ariaLabel} className={className} />;
}

/**
 * Full-cell native colour swatch: a visible fill with an invisible `type="color"`
 * input over it, so clicking the cell opens the OS colour picker. Size it via
 * `className` (e.g. `w-11 shrink-0`); it fills its cell height.
 */
export function ColourSwatchCell({
  colour,
  onChange,
  className,
  style,
  "aria-label": ariaLabel,
}: {
  colour: string;
  onChange: (hex: string) => void;
  className?: string;
  /** Extra style merged onto the fill (e.g. `opacity` to preview alpha). */
  style?: React.CSSProperties;
  "aria-label"?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <div className="size-full" style={{ backgroundColor: colour, ...style }} aria-hidden />
      <input
        type="color"
        value={colour}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      />
    </div>
  );
}
