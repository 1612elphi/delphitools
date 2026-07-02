"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Copy, Eye, EyeOff, FolderPlus, Lock, Trash2, Upload } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSnapshot, subscribe } from "@/lib/substrata/doc-store";
import { getActiveLayerId, setActiveLayer, subscribeSelection } from "@/lib/substrata/selection";
import {
  deleteLayer,
  duplicateLayer,
  setBlendMode,
  setLayerOrder,
  setOpacity,
  toggleLock,
  toggleVisibility,
} from "@/lib/substrata/layer-ops";
import { getRaster } from "@/lib/substrata/raster-cache";
import { importImageFile } from "@/lib/substrata/import-raster";
import { BLEND_OPTIONS } from "@/components/substrata/modules/inspector-panel";
import type { BlendMode, Layer } from "@/lib/substrata/doc-model";

/**
 * Layers module — the BODY only; the module box supplies the header. Reads the
 * doc + selection stores; edits go through layer-ops (one-way, undoable). Top
 * layer first. Sketch fidelity (modals.html): candy-stripe hidden rows, a
 * selected-arrow marker, hover-reveal eye, lock toggle, drag-reorder, and a
 * footer with the blend/opacity controls + an Upload / group / duplicate / toss
 * action bar. The list scrolls; the footer is pinned.
 *
 * SINGLE-SELECT ONLY (selection.ts). Grouping needs a multi-selection (M2), so
 * the group action is disabled for now; nested group rows / tree elbows / nested
 * drag land with grouping too. Copy is ∑CG.
 */
export function LayersBody() {
  const doc = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const activeId = useSyncExternalStore(subscribeSelection, getActiveLayerId, () => null);
  const layers = doc?.layers ?? [];
  const activeLayer = activeId ? layers.find((l) => l.id === activeId) ?? null : null;

  // Displayed top-first; reorder maps back to doc order (bottom-first).
  const displayed = [...layers].reverse();
  const displayedIds = displayed.map((l) => l.id);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = displayedIds.indexOf(String(active.id));
    const to = displayedIds.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    const next = [...displayedIds];
    next.splice(to, 0, next.splice(from, 1)[0]);
    setLayerOrder([...next].reverse()); // back to doc order
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-auto">
        {layers.length === 0 ? (
          <div className="flex items-center justify-center p-4 text-center text-xs text-muted-foreground">
            {/* ∑CG: empty-state hint when no layers exist
                spec: ≤ 60 chars, drop/paste/upload an image to start; British spelling.
                sample: "Drop, paste, or upload an image to begin." */}
            ∑CG
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            onDragEnd={onDragEnd}
          >
            <SortableContext items={displayedIds} strategy={verticalListSortingStrategy}>
              {displayed.map((layer) => (
                <LayerRow key={layer.id} layer={layer} active={layer.id === activeId} />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
      <Footer activeId={activeId} activeLayer={activeLayer} />
    </div>
  );
}

/** Layer count for the module box header (sub2). */
export function LayersCount() {
  const doc = useSyncExternalStore(subscribe, getSnapshot, () => null);
  return <>{doc?.layers.length ?? 0}</>;
}

// The candy-stripe for hidden rows — theme-aware via color-mix on --foreground.
const HIDDEN_STRIPE =
  "repeating-linear-gradient(-45deg, color-mix(in oklch, var(--foreground) 9%, transparent) 0 4px, transparent 4px 9px)";

function LayerRow({ layer, active }: { layer: Layer; active: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: layer.id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    ...(layer.visible ? {} : { backgroundImage: HIDDEN_STRIPE }),
  };

  const stop = (e: React.PointerEvent | React.MouseEvent) => e.stopPropagation();

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => setActiveLayer(layer.id)}
      className={cn(
        "group relative flex h-[30px] cursor-default items-center gap-2 border-b border-border/60 pr-1.5 text-xs outline-none",
        active ? "bg-accent" : "hover:bg-accent",
      )}
    >
      {/* selected marker — a little arrow (per the sketch, not a stripe) */}
      {active && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-[2px] top-1/2 z-[2] size-0 -translate-y-1/2 border-y-[4px] border-l-[6px] border-y-transparent border-l-primary"
        />
      )}

      <LayerThumb layer={layer} />
      <span className="relative flex-1 truncate" title={layer.name}>
        {layer.name}
      </span>

      {/* lock — muted when unlocked (hover to reveal), solid when locked */}
      <button
        type="button"
        onPointerDown={stop}
        onClick={(e) => {
          stop(e);
          toggleLock(layer.id);
        }}
        // ∑CG: aria-label for the layer lock toggle. sample: "Lock layer"
        aria-label="∑CG"
        className={cn(
          "relative z-[1] grid size-4 shrink-0 place-items-center transition-opacity",
          layer.locked
            ? "text-foreground"
            : "text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100",
        )}
      >
        <Lock className="size-3.5" />
      </button>

      {/* visibility — eye at the far right, revealed on hover unless hidden */}
      <button
        type="button"
        onPointerDown={stop}
        onClick={(e) => {
          stop(e);
          toggleVisibility(layer.id);
        }}
        // ∑CG: aria-label for the layer show/hide toggle. sample: "Toggle visibility"
        aria-label="∑CG"
        className={cn(
          "relative z-[1] grid size-4 shrink-0 place-items-center text-muted-foreground transition-opacity hover:text-foreground",
          layer.visible ? "opacity-0 group-hover:opacity-100" : "opacity-100",
        )}
      >
        {layer.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
      </button>
    </div>
  );
}

/** Small live thumbnail drawn from the cached raster (raster layers only). */
function LayerThumb({ layer }: { layer: Layer }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const hash = layer.kind === "raster" ? layer.blobHash : null;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, el.width, el.height);
    if (!hash) return;
    const src = getRaster(hash);
    if (!src) return;
    const s = Math.min(el.width / src.width, el.height / src.height);
    const w = src.width * s;
    const h = src.height * s;
    ctx.drawImage(src, (el.width - w) / 2, (el.height - h) / 2, w, h);
  }, [hash]);

  return (
    <canvas
      ref={ref}
      width={24}
      height={24}
      className="relative z-[1] ml-1.5 size-[22px] shrink-0 border border-border bg-muted"
      aria-hidden
    />
  );
}

// ── footer: blend/opacity + action bar ───────────────────────────────────────

function Footer({ activeId, activeLayer }: { activeId: string | null; activeLayer: Layer | null }) {
  const fileRef = useRef<HTMLInputElement>(null);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (file) void importImageFile(file);
    e.currentTarget.value = ""; // allow re-picking the same file
  };

  return (
    <div className="shrink-0 border-t-2 border-border">
      {/* blend + opacity for the active layer (labels dropped so long mode names fit) */}
      <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
        <Select
          value={activeLayer?.blendMode ?? "source-over"}
          onValueChange={(v) => activeId && setBlendMode(activeId, v as BlendMode)}
          disabled={!activeLayer}
        >
          <SelectTrigger
            size="sm"
            className="h-7 min-w-0 flex-1 gap-1 border-0 bg-card px-2 text-xs shadow-none hover:bg-accent focus-visible:ring-0 disabled:opacity-50 dark:bg-card dark:hover:bg-accent"
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
        <OpacityField layerId={activeId} opacity={activeLayer?.opacity ?? 1} />
      </div>

      {/* action bar: big Upload primary + group (multi-select, disabled) · duplicate · toss */}
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex h-[42px] flex-1 items-center justify-center gap-2 bg-primary text-[12.5px] font-bold text-primary-foreground hover:brightness-105"
        >
          <Upload className="size-4" />
          {/* "Upload" is a standard functional action label (mockup word). */}
          Upload
        </button>
        <input ref={fileRef} type="file" accept="image/*" onChange={onPick} className="hidden" />
        <ActionBtn
          icon={FolderPlus}
          disabled
          // ∑CG: aria-label for group-layers (needs a multi-selection, M2). sample: "Group layers"
          aria="∑CG"
        />
        <ActionBtn
          icon={Copy}
          disabled={!activeId}
          onClick={() => activeId && duplicateLayer(activeId)}
          // ∑CG: aria-label for duplicate layer. sample: "Duplicate layer"
          aria="∑CG"
        />
        <ActionBtn
          icon={Trash2}
          disabled={!activeId}
          onClick={() => activeId && deleteLayer(activeId)}
          // ∑CG: aria-label for delete layer. sample: "Delete layer"
          aria="∑CG"
        />
      </div>
    </div>
  );
}

function ActionBtn({
  icon: Icon,
  aria,
  onClick,
  disabled,
}: {
  icon: typeof Copy;
  aria: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={aria}
      className="grid w-[42px] shrink-0 place-items-center border-l border-border text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
    >
      <Icon className="size-4" />
    </button>
  );
}

/** Opacity field (0–100%) for the active layer; commits on blur/Enter. */
function OpacityField({ layerId, opacity }: { layerId: string | null; opacity: number }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(Math.round(opacity * 100));

  const commit = () => {
    if (draft !== null && layerId) {
      const n = parseFloat(draft);
      if (Number.isFinite(n)) setOpacity(layerId, Math.max(0, Math.min(100, n)) / 100);
    }
    setDraft(null);
  };

  return (
    <label className="flex h-7 w-[54px] shrink-0 items-center gap-0.5 border border-border bg-card px-2">
      <input
        className="w-full min-w-0 bg-transparent text-right text-xs tabular-nums outline-none disabled:opacity-50"
        value={shown}
        disabled={!layerId}
        inputMode="numeric"
        // ∑CG: aria-label for the active layer's opacity field. sample: "Opacity"
        aria-label="∑CG"
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
      <span className="shrink-0 text-[10px] text-muted-foreground">%</span>
    </label>
  );
}
