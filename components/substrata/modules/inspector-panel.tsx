"use client";

import { useState, useSyncExternalStore } from "react";
import { Folder, Frame, Image as ImageIcon, RotateCw, Scaling, Square, Type } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getSnapshot, subscribe } from "@/lib/substrata/doc-store";
import { getActiveLayerId, subscribeSelection } from "@/lib/substrata/selection";
import { setBlendMode, setOpacity, setTransform } from "@/lib/substrata/layer-ops";
import { getPersistenceEnabled, subscribePersistence } from "@/lib/substrata/persistence-pref";
import { openModal } from "@/lib/substrata/modal";
import type { BlendMode, Layer, SubstrataDoc } from "@/lib/substrata/doc-model";

/**
 * Inspector module (modals pass) — the BODY only; the module box supplies the
 * "INSPECTOR" header. Reflects the SELECTED layer and edits its transform,
 * blend mode, and opacity. Reads doc + selection stores; writes go through
 * layer-ops → the doc round-trip (one-way; the reconciler re-renders Fabric and
 * the on-canvas handles). Every field commits on blur/Enter (one undo step each)
 * and supports maths (+100, -50, *1.5, /2, 100+50).
 *
 * Compact by design: it should fit without scrolling. Blend + opacity share one
 * "Blend [Normal] at [NN%]" line (the layers-footer pattern).
 *
 * The layer's transform.x/y is the object CENTRE in scene coordinates (§ sync
 * convention). W/H are the layer's own dimensions (natural × scale); editing one
 * sets that axis's scale. Scale % ties both axes.
 *
 * Section titles + field labels are functional chrome (mockup words, per Ruby's
 * call). Blend-mode names are standard compositing terms (British spelling), same
 * category. Empty-state hint stays ∑CG.
 */

/** Apply a binary op; divide-by-zero is a no-op (keeps the left operand). */
function applyOp(a: number, op: string, b: number): number {
  switch (op) {
    case "+":
      return a + b;
    case "-":
      return a - b;
    case "*":
      return a * b;
    case "/":
      return b === 0 ? a : a / b;
    default:
      return b;
  }
}

/**
 * Evaluate a field entry against the field's current value:
 *   "150" → 150 (absolute) · "+100" → current+100 · "-50" → current-50
 *   "*1.5" → current*1.5 · "/2" → current/2 · "100+50" → 150
 * Returns null on anything unparseable (edit is discarded).
 */
function evalField(raw: string, current: number): number | null {
  const s = raw.trim().replace(/\s+/g, "");
  if (s === "") return null;

  // Leading operator → apply relative to the current value.
  let m = s.match(/^([+\-*/])(-?\d*\.?\d+)$/);
  if (m) {
    const n = parseFloat(m[2]);
    return Number.isFinite(n) ? applyOp(current, m[1], n) : null;
  }

  // Two-operand expression, e.g. "100+50", "10*3", "300/2".
  m = s.match(/^(-?\d*\.?\d+)([+\-*/])(-?\d*\.?\d+)$/);
  if (m) {
    const a = parseFloat(m[1]);
    const b = parseFloat(m[3]);
    return Number.isFinite(a) && Number.isFinite(b) ? applyOp(a, m[2], b) : null;
  }

  // Plain number.
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

const KIND_ICON: Record<Layer["kind"], LucideIcon> = {
  raster: ImageIcon,
  text: Type,
  shape: Square,
  group: Folder,
};

// Standard canvas compositing modes → their conventional names (British
// spelling). Treated as functional chrome labels, not authored copy. Shared with
// the Layers footer blend dropdown.
export const BLEND_OPTIONS: { value: BlendMode; label: string }[] = [
  { value: "source-over", label: "Normal" },
  { value: "multiply", label: "Multiply" },
  { value: "screen", label: "Screen" },
  { value: "overlay", label: "Overlay" },
  { value: "darken", label: "Darken" },
  { value: "lighten", label: "Lighten" },
  { value: "color-dodge", label: "Colour Dodge" },
  { value: "color-burn", label: "Colour Burn" },
  { value: "hard-light", label: "Hard Light" },
  { value: "soft-light", label: "Soft Light" },
  { value: "difference", label: "Difference" },
  { value: "exclusion", label: "Exclusion" },
  { value: "hue", label: "Hue" },
  { value: "saturation", label: "Saturation" },
  { value: "color", label: "Colour" },
  { value: "luminosity", label: "Luminosity" },
];

export function InspectorBody() {
  const doc = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const activeId = useSyncExternalStore(subscribeSelection, getActiveLayerId, () => null);
  const layer = doc && activeId ? doc.layers.find((l) => l.id === activeId) ?? null : null;

  // No selection → show the canvas/scene info (mirrors the Scene menu's readout).
  if (!layer) return <CanvasInfo doc={doc} />;

  const KindIcon = KIND_ICON[layer.kind];
  const nat = layer.kind === "raster" ? { w: layer.naturalWidth, h: layer.naturalHeight } : null;
  const t = layer.transform;

  const cells: {
    key: string;
    label?: string;
    icon?: LucideIcon;
    unit?: string;
    value: number;
    onCommit: (n: number) => void;
  }[] = [
    { key: "x", label: "X", value: t.x, onCommit: (n) => setTransform(layer.id, { ...t, x: n }) },
    { key: "y", label: "Y", value: t.y, onCommit: (n) => setTransform(layer.id, { ...t, y: n }) },
  ];
  if (nat) {
    cells.push(
      {
        key: "w",
        label: "W",
        value: nat.w * t.scaleX,
        onCommit: (n) => setTransform(layer.id, { ...t, scaleX: Math.max(1, n) / nat.w }),
      },
      {
        key: "h",
        label: "H",
        value: nat.h * t.scaleY,
        onCommit: (n) => setTransform(layer.id, { ...t, scaleY: Math.max(1, n) / nat.h }),
      },
    );
  }
  cells.push(
    { key: "angle", icon: RotateCw, unit: "°", value: t.angle, onCommit: (n) => setTransform(layer.id, { ...t, angle: n }) },
    {
      key: "scale",
      icon: Scaling,
      unit: "%",
      value: t.scaleX * 100,
      onCommit: (n) => {
        const s = Math.max(1, n) / 100;
        setTransform(layer.id, { ...t, scaleX: s, scaleY: s });
      },
    },
  );

  return (
    <div className="flex h-full flex-col overflow-hidden text-xs">
      {/* selection identity — header strip; text breathes (DESIGN.md §1) */}
      <div className="flex items-center gap-2 border-b border-border bg-accent px-3 py-1.5">
        <span className="grid size-6 shrink-0 place-items-center bg-primary text-primary-foreground">
          <KindIcon className="size-3.5" aria-hidden />
        </span>
        <span className="truncate font-semibold text-accent-foreground" title={layer.name}>
          {layer.name}
        </span>
        {nat && (
          <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {nat.w}×{nat.h}
          </span>
        )}
      </div>

      {/* Transform — the title breathes (padded); the value grid is a flush
          container that bleeds edge to edge (DESIGN.md §6/§7). Internal 1px
          hairlines; a 2px major divider closes the section (§5). */}
      <div className="px-3 pb-1.5 pt-2 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
        Transform
      </div>
      <div className="segmented grid-cols-2 border-x-0 border-b-0">
        {cells.map((c) => (
          <NumField key={c.key} label={c.label} icon={c.icon} unit={c.unit} value={c.value} onCommit={c.onCommit} />
        ))}
      </div>

      {/* Appearance — a flush action bar pinned to the BOTTOM of the card
          (mt-auto), split off by the 2px major divider (DESIGN.md §5/§9/§11): the
          blend mode fills, opacity is an equal-height cell behind a 1px hairline.
          Labels dropped so long mode names ("Colour Dodge") fit; % self-labels. */}
      <div className="mt-auto flex h-9 items-stretch border-t-2 border-border">
        <Select value={layer.blendMode} onValueChange={(v) => setBlendMode(layer.id, v as BlendMode)}>
          <SelectTrigger
            className="h-full min-w-0 flex-1 gap-1 border-0 bg-card px-3 text-xs shadow-none hover:bg-accent focus-visible:ring-0 dark:bg-card dark:hover:bg-accent"
            // ∑CG: aria-label for the blend-mode dropdown. sample: "Blend mode"
            aria-label="∑CG"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BLEND_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <OpacityField layerId={layer.id} opacity={layer.opacity} />
      </div>
    </div>
  );
}

/** Shared numeric-field behaviour: local draft, commit on blur/Enter (with maths),
 *  revert on Escape, select-all on focus. Reflects the live value when not editing. */
function useNumberField(value: number, onCommit: (n: number) => void) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = evalField(draft, value);
    if (n !== null) onCommit(n);
    setDraft(null);
  };
  return {
    value: draft ?? String(Math.round(value)),
    inputMode: "decimal" as const,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.currentTarget.value),
    onFocus: (e: React.FocusEvent<HTMLInputElement>) => e.currentTarget.select(),
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        commit();
        e.currentTarget.blur();
      } else if (e.key === "Escape") {
        setDraft(null);
        e.currentTarget.blur();
      }
    },
  };
}

/** A flush transform cell: glyph/icon label + number input (+ optional unit).
 *  Wrapped in <label> so the visible glyph is the accessible name. */
function NumField({
  label,
  icon: Icon,
  unit,
  value,
  onCommit,
}: {
  label?: string;
  icon?: LucideIcon;
  unit?: string;
  value: number;
  onCommit: (n: number) => void;
}) {
  const field = useNumberField(value, onCommit);
  return (
    <label className="flex h-7 items-center gap-1.5 bg-card px-2.5">
      {(Icon || label) && (
        <span className="grid w-3.5 shrink-0 place-items-center text-[11px] text-muted-foreground">
          {Icon ? <Icon className="size-3" aria-hidden /> : label}
        </span>
      )}
      <input className="w-full min-w-0 bg-transparent text-xs tabular-nums outline-none" {...field} />
      {unit && <span className="shrink-0 text-[10.5px] text-muted-foreground">{unit}</span>}
    </label>
  );
}

/** Opacity field (0–100%) — a flush cell in the appearance bar, same height as
 *  the blend dropdown, divided off by a 1px hairline. */
function OpacityField({ layerId, opacity }: { layerId: string; opacity: number }) {
  const field = useNumberField(opacity * 100, (n) => setOpacity(layerId, Math.max(0, Math.min(100, n)) / 100));
  return (
    <label className="flex h-full w-[62px] shrink-0 items-center gap-0.5 border-l border-border bg-card px-3">
      <input className="w-full min-w-0 bg-transparent text-right text-xs tabular-nums outline-none" {...field} />
      <span className="shrink-0 text-[10px] text-muted-foreground">%</span>
    </label>
  );
}

/**
 * No-selection state: the canvas / scene readout (dimensions, resolution, bit
 * depth, colour mode, layer count, storage) — the same facts the Scene menu
 * shows, so the Inspector always has something useful. Row labels/values are
 * functional chrome (mockup words), matching the Scene menu.
 */
function CanvasInfo({ doc }: { doc: SubstrataDoc | null }) {
  const persistOn = useSyncExternalStore(subscribePersistence, getPersistenceEnabled, () => false);
  const ab = doc?.artboard;
  return (
    <div className="flex h-full flex-col overflow-hidden text-xs">
      {/* canvas identity — mirrors the layer seltype header */}
      <div className="flex items-center gap-2 border-b border-border bg-accent px-3 py-1.5">
        <span className="grid size-6 shrink-0 place-items-center bg-primary text-primary-foreground">
          <Frame className="size-3.5" aria-hidden />
        </span>
        <span className="truncate font-semibold text-accent-foreground" title={doc?.name || undefined}>
          {doc?.name?.trim() ? (
            doc.name
          ) : (
            // ∑CG: placeholder name for an unsaved/untitled scene (≤ 24 chars; British spelling).
            //   sample: "Untitled scene"
            <span className="text-accent-foreground/70">∑CG</span>
          )}
        </span>
        {ab && (
          <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {ab.width}×{ab.height}
          </span>
        )}
      </div>
      <div className="border-b border-border">
        <InfoRow label="Dimensions" value={ab ? `${ab.width} × ${ab.height} px` : "—"} />
        <InfoRow label="Resolution" value={ab ? `${ab.resolution} ppi` : "—"} />
        <InfoRow label="Bit depth" value="8-bit / ch" />
        <InfoRow label="Colour" value="sRGB" />
        <InfoRow label="Layers" value={String(doc?.layers.length ?? 0)} />
        <InfoRow label="Stored" value={persistOn ? "Local" : "Off"} />
      </div>
      {/* opens the same Canvas-size modal as Scene ▸ Canvas size… */}
      <button
        type="button"
        onClick={() => openModal("canvas-size")}
        className="flex items-center gap-1.5 border-b-2 border-border px-3 py-2 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Scaling className="size-3.5" aria-hidden />
        Canvas size…
      </button>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-[5px] text-[11.5px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
