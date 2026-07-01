"use client";

import { useState, useSyncExternalStore } from "react";
import { Folder, Image as ImageIcon, MousePointer2, RotateCw, Scaling, Square, Type } from "lucide-react";
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
import type { BlendMode, Layer } from "@/lib/substrata/doc-model";

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
// spelling). Treated as functional chrome labels, not authored copy.
const BLEND_OPTIONS: { value: BlendMode; label: string }[] = [
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

  if (!layer) {
    return (
      <div className="flex flex-col items-center justify-center gap-1.5 p-6 text-center text-muted-foreground">
        <MousePointer2 className="size-4 opacity-50" aria-hidden />
        {/* ∑CG: inspector empty-state hint (no selection)
            spec: ≤48 chars; tells the user to select a layer to edit it; British spelling.
            sample: "Select a layer to inspect it." */}
        <span className="text-xs">∑CG</span>
      </div>
    );
  }

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
    <div>
      {/* selection identity */}
      <div className="flex items-center gap-2 border-b border-border bg-accent px-3 py-1.5">
        <span className="grid size-6 shrink-0 place-items-center bg-primary text-primary-foreground">
          <KindIcon className="size-3.5" aria-hidden />
        </span>
        <span className="truncate text-xs font-semibold text-accent-foreground" title={layer.name}>
          {layer.name}
        </span>
        {nat && (
          <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {nat.w}×{nat.h}
          </span>
        )}
      </div>

      {/* Transform */}
      <div className="px-3 py-2">
        <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Transform</div>
        <div className="segmented grid-cols-2">
          {cells.map((c) => (
            <NumField key={c.key} label={c.label} icon={c.icon} unit={c.unit} value={c.value} onCommit={c.onCommit} />
          ))}
        </div>
      </div>

      {/* Blend + opacity — one line */}
      <div className="flex items-center gap-2 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
        <span className="shrink-0">Blend</span>
        <Select value={layer.blendMode} onValueChange={(v) => setBlendMode(layer.id, v as BlendMode)}>
          <SelectTrigger size="sm" className="h-7 min-w-0 flex-1 text-xs">
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
        <span className="shrink-0">at</span>
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

/** Compact opacity field (0–100%) sitting inside the blend line. */
function OpacityField({ layerId, opacity }: { layerId: string; opacity: number }) {
  const field = useNumberField(opacity * 100, (n) => setOpacity(layerId, Math.max(0, Math.min(100, n)) / 100));
  return (
    <label className="flex h-7 w-[54px] shrink-0 items-center gap-0.5 border border-border bg-card px-2">
      <input className="w-full min-w-0 bg-transparent text-right text-xs tabular-nums outline-none" {...field} />
      <span className="shrink-0 text-[10px] text-muted-foreground">%</span>
    </label>
  );
}
