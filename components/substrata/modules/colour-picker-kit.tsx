"use client";

import { useCallback, useRef } from "react";
import { beginTransient, commitTransient } from "@/lib/substrata/doc-store";

/**
 * Shared primitives for the colour-picker modes (hue cube, HSV triangle, sliders,
 * swatches, prism, shade). Each mode is its own file importing these so the drag
 * behaviour, knob, and clamps stay identical across modes.
 */

export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

export interface PointerBind {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
}

/**
 * Normalised (0–1) pointer position within an element, tracked through a drag via
 * pointer capture. `onMove(x, y)` fires on down + every move. Returns a callback
 * ref + a spreadable handler bundle as a tuple, so call sites use bare
 * identifiers (nothing ref-like is read during render — satisfies react-hooks/refs).
 */
export function usePointerArea(
  onMove: (x: number, y: number) => void,
): [(el: HTMLDivElement | null) => void, PointerBind] {
  const elRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  const setRef = useCallback((el: HTMLDivElement | null) => {
    elRef.current = el;
  }, []);

  const emit = (clientX: number, clientY: number) => {
    const el = elRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    onMove(clamp01((clientX - r.left) / r.width), clamp01((clientY - r.top) / r.height));
  };

  return [
    setRef,
    {
      onPointerDown: (e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        // Bracket the drag as ONE doc gesture: with the colour sink live (M4),
        // every move streams a fill edit into the doc — begin/commit coalesce
        // them into a single undo step. Harmless when nothing consumes the
        // colour (commitTransient no-ops when the doc didn't change).
        beginTransient();
        emit(e.clientX, e.clientY);
      },
      onPointerMove: (e) => {
        if (dragging.current) emit(e.clientX, e.clientY);
      },
      onPointerUp: (e) => {
        dragging.current = false;
        e.currentTarget.releasePointerCapture?.(e.pointerId);
        commitTransient();
      },
    },
  ];
}

/** Draggable knob marker positioned by normalised (0–1) coordinates. */
export function Knob({ x, y }: { x: number; y: number }) {
  return (
    <span
      className="pointer-events-none absolute size-[13px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.45)]"
      style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
    />
  );
}
