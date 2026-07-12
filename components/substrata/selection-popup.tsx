"use client";

import { useSyncExternalStore } from "react";
import { CopyPlus, Expand, Scissors, Shrink, SquareSlash, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSnapshot, subscribe } from "@/lib/substrata/doc-store";
import { getActiveLayerId, subscribeSelection } from "@/lib/substrata/selection";
import {
  clearPixelSelection,
  getPixelSelection,
  subscribePixelSelection,
} from "@/lib/substrata/pixel-selection";
import {
  canOperateOnActive,
  cutSelection,
  extractSelection,
  growSelection,
  invertSelection,
  shrinkSelection,
} from "@/lib/substrata/select-ops";

/**
 * Contextual pixel-selection popup (M2-10, ratified 2026-07-07): while a pixel
 * selection exists, a small action strip floats under its bounds — extract
 * (the DEFAULT action, also Enter) · cut (destructive) · invert · grow ·
 * shrink · deselect (also Escape). Action words are standard graphics
 * vocabulary = functional chrome (BLEND_OPTIONS precedent). Extract/cut gate
 * on a raster active layer (the FX non-raster precedent; auto-rasterize is
 * M3-15's business).
 *
 * The canvas reports the anchor (wrap-relative screen coords) from its
 * after:render pass via `reportSelectionAnchor` — the popup itself never
 * touches Fabric. Plain absolutely-positioned div, NOT a Radix Popover: this
 * is a persistent mini-toolbar; dismiss/focus-trap semantics would fight it.
 */

let anchor = { x: 0, y: 0 };
const anchorListeners = new Set<() => void>();

/** Canvas → popup: bottom-centre of the selection bbox, wrap-relative px. */
export function reportSelectionAnchor(x: number, y: number): void {
  if (Math.abs(x - anchor.x) < 0.5 && Math.abs(y - anchor.y) < 0.5) return;
  anchor = { x, y };
  for (const l of anchorListeners) l();
}

function subscribeAnchor(l: () => void): () => void {
  anchorListeners.add(l);
  return () => {
    anchorListeners.delete(l);
  };
}

const getAnchor = () => anchor;

const ICON = "h-3.5 w-3.5";

function ActionBtn({
  action,
  label,
  primary,
  destructive,
  disabled,
  onClick,
  children,
}: {
  action: string;
  label: string;
  primary?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-select-action={action}
      // standard graphics vocabulary = functional chrome (not authored copy)
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid h-7 w-7 place-items-center",
        primary
          ? "bg-primary text-primary-foreground hover:opacity-90"
          : "hover:bg-muted",
        destructive && "text-destructive",
        disabled && "pointer-events-none opacity-35",
      )}
    >
      {children}
    </button>
  );
}

export function SelectionPopup() {
  const sel = useSyncExternalStore(subscribePixelSelection, getPixelSelection, () => null);
  const doc = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const a = useSyncExternalStore(subscribeAnchor, getAnchor, getAnchor);
  // re-render when the active layer changes (extract/cut gate reads it)
  useSyncExternalStore(subscribeSelection, getActiveLayerId, () => null);

  if (!sel || !doc) return null;
  const ready = canOperateOnActive();

  return (
    <div
      className="absolute z-30 flex -translate-x-1/2 border-2 border-border bg-background shadow-sm"
      style={{ left: a.x, top: a.y }}
    >
      <ActionBtn action="extract" label="Extract" primary disabled={!ready} onClick={() => void extractSelection()}>
        <CopyPlus className={ICON} />
      </ActionBtn>
      <ActionBtn action="cut" label="Cut" destructive disabled={!ready} onClick={() => void cutSelection()}>
        <Scissors className={ICON} />
      </ActionBtn>
      <div className="w-px bg-border" />
      <ActionBtn action="invert" label="Invert" onClick={invertSelection}>
        <SquareSlash className={ICON} />
      </ActionBtn>
      <ActionBtn action="grow" label="Grow" onClick={() => growSelection()}>
        <Expand className={ICON} />
      </ActionBtn>
      <ActionBtn action="shrink" label="Shrink" onClick={() => shrinkSelection()}>
        <Shrink className={ICON} />
      </ActionBtn>
      <div className="w-px bg-border" />
      <ActionBtn action="deselect" label="Deselect" onClick={clearPixelSelection}>
        <X className={ICON} />
      </ActionBtn>
    </div>
  );
}
