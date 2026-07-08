"use client";

import { useEffect, useRef } from "react";
import { ColourSwatchCell, DeferredHexInput } from "@/components/colour-field";
import { beginTransient, commitTransient } from "@/lib/substrata/doc-store";

/**
 * Native swatch + hex pair whose OS-picker drags coalesce into ONE undo step
 * (extracted from the FX panel's ColourRow so every doc-editing colour cell —
 * fx params, Inspector fill/stroke — shares the mechanism). The native picker
 * can stream changes while dragging (Chrome) and offers no reliable close
 * signal — the input may keep focus after the OS picker closes, so blur alone
 * can leave the transient gesture open forever. The gesture therefore settles
 * on whichever comes first: a pause in changes (trailing timer), the pair
 * blurring, or unmount. A long pause inside the OS picker splits into two
 * undo steps — acceptable. The hex field commits once on blur/Enter.
 */
export function TransientColourCell({
  value,
  onApply,
  swatchAria,
  hexAria,
  swatchClassName = "h-6 w-9 shrink-0 border border-border",
  hexClassName = "h-6 w-[76px] border-border bg-card px-1.5 text-[11px] tabular-nums shadow-none dark:bg-card md:text-[11px]",
}: {
  value: string;
  /** transient=true while the OS picker streams; false = a single committed set */
  onApply: (hex: string, transient: boolean) => void;
  /** \u2211CG at call sites */
  swatchAria: string;
  hexAria: string;
  swatchClassName?: string;
  hexClassName?: string;
}) {
  const dragging = useRef(false);
  const settleTimer = useRef<number | null>(null);

  const settle = () => {
    if (settleTimer.current !== null) {
      window.clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
    if (!dragging.current) return;
    commitTransient();
    dragging.current = false;
  };

  // A still-open gesture must not outlive the cell (deselect mid-pick).
  useEffect(() => {
    return () => {
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
      if (dragging.current) {
        commitTransient();
        dragging.current = false;
      }
    };
  }, []);

  return (
    <div className="flex items-center gap-1.5" onBlur={settle}>
      <ColourSwatchCell
        colour={value}
        onChange={(hex) => {
          if (!dragging.current) {
            dragging.current = true;
            beginTransient();
          }
          onApply(hex, true);
          if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
          settleTimer.current = window.setTimeout(settle, 600);
        }}
        className={swatchClassName}
        aria-label={swatchAria}
      />
      <DeferredHexInput
        value={value}
        onChange={(hex) => onApply(hex, false)}
        className={hexClassName}
        aria-label={hexAria}
      />
    </div>
  );
}
