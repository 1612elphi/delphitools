"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown, Copy, Eye, EyeOff, Folder, FolderMinus, FolderPlus, Lock, Trash2, Upload } from "lucide-react";
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
import {
  getActiveLayerId,
  getSelectedLayerIds,
  getSelectionAnchor,
  setActiveLayer,
  setSelection,
  subscribeSelection,
  toggleInSelection,
} from "@/lib/substrata/selection";
import { openLayerMenu } from "@/lib/substrata/context-menu";
import {
  deleteLayers,
  duplicateLayers,
  groupLayers,
  setBlendMode,
  setOpacity,
  setSiblingOrder,
  toggleLock,
  toggleVisibility,
  ungroupLayer,
} from "@/lib/substrata/layer-ops";
import {
  findLayer,
  flattenForPanel,
  isGroup,
  leafRenderList,
  siblingListOf,
  type PanelRow,
} from "@/lib/substrata/layer-tree";
import { getRaster } from "@/lib/substrata/raster-cache";
import { importImageFile } from "@/lib/substrata/import-raster";
import { BLEND_OPTIONS } from "@/components/substrata/modules/inspector-panel";
import type { BlendMode, Layer, ShapeParams } from "@/lib/substrata/doc-model";
import { polygonPoints, shapeDims, starPoints } from "@/lib/substrata/shape-geometry";
import { freehandDims, outlineToPathD, strokeOutline } from "@/lib/substrata/freehand";

/**
 * Layers module — the BODY only; the module box supplies the header. Reads the
 * doc + selection stores; edits go through layer-ops (one-way, undoable). Top
 * layer first at every level. Sketch fidelity (modals.html): candy-stripe
 * hidden rows, a selected-arrow marker on the primary, hover-reveal eye, lock
 * toggle, drag-reorder, group rows with a folder thumb + collapse chevron +
 * tree-elbow gutters, and a footer with blend/opacity + Upload / group /
 * duplicate / toss.
 *
 * MULTI-SELECT (M2): plain click = single select · ⌘/Ctrl-click toggles ·
 * shift-click ranges from the anchor over the VISIBLE rows. All selected rows
 * highlight; the primary (last-selected) carries the arrow and drives the
 * footer's blend/opacity. Group = the selection when it shares one sibling
 * list; a single selected group offers Ungroup. Toss deletes the whole
 * selection as one undo step. Drag-reorder is constrained to a row's own
 * sibling list (cross-parent drag is a later refinement; while dragging a
 * group row its children don't visually follow — the drop result is correct).
 */

// Collapsed-group ids — tiny module-level store so the state survives the
// module box remounting between bloom/rail/dock (useSyncExternalStore shape).
let collapsedGroups: ReadonlySet<string> = new Set();
const collapseListeners = new Set<() => void>();
const getCollapsed = () => collapsedGroups;
const subscribeCollapsed = (l: () => void) => {
  collapseListeners.add(l);
  return () => {
    collapseListeners.delete(l);
  };
};
function toggleCollapsed(id: string): void {
  const next = new Set(collapsedGroups);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  collapsedGroups = next;
  for (const l of collapseListeners) l();
}

const EMPTY_IDS: readonly string[] = [];

export function LayersBody() {
  const doc = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const selectedIds = useSyncExternalStore(subscribeSelection, getSelectedLayerIds, () => EMPTY_IDS);
  const activeId = useSyncExternalStore(subscribeSelection, getActiveLayerId, () => null);
  const collapsed = useSyncExternalStore(subscribeCollapsed, getCollapsed, getCollapsed);

  const layers = doc?.layers ?? [];
  const rows = flattenForPanel(layers, collapsed);
  const rowIds = rows.map((r) => r.layer.id);
  const activeLayer = doc && activeId ? findLayer(doc.layers, activeId) : null;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = rows.find((r) => r.layer.id === String(active.id));
    const to = rows.find((r) => r.layer.id === String(over.id));
    // reorder is scoped to ONE sibling list; cross-parent drops are ignored
    if (!from || !to || from.parentId !== to.parentId) return;
    const siblings = rows.filter((r) => r.parentId === from.parentId).map((r) => r.layer.id);
    const fi = siblings.indexOf(from.layer.id);
    const ti = siblings.indexOf(to.layer.id);
    if (fi === -1 || ti === -1) return;
    const next = [...siblings];
    next.splice(ti, 0, next.splice(fi, 1)[0]);
    setSiblingOrder(from.parentId, [...next].reverse()); // display top-first → doc order
  };

  // Right-click → the shared layer context menu; a row inside the selection
  // keeps it (menu acts on all), any other row becomes the selection.
  const onRowContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    if (selectedIds.includes(id)) {
      openLayerMenu(e.clientX, e.clientY, selectedIds);
    } else {
      setActiveLayer(id);
      openLayerMenu(e.clientX, e.clientY, [id]);
    }
  };

  const onRowClick = (e: React.MouseEvent, id: string) => {
    if (e.shiftKey) {
      const anchor = getSelectionAnchor();
      const ai = anchor ? rowIds.indexOf(anchor) : -1;
      const ci = rowIds.indexOf(id);
      if (ai !== -1 && ci !== -1) {
        const [lo, hi] = ai < ci ? [ai, ci] : [ci, ai];
        // keep the anchor; the clicked end becomes primary (range reads that way)
        const range = rowIds.slice(lo, hi + 1);
        setSelection(ci < ai ? [...range].reverse() : range, { anchor });
        return;
      }
    }
    if (e.metaKey || e.ctrlKey) {
      toggleInSelection(id);
      return;
    }
    setActiveLayer(id);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-auto">
        {rows.length === 0 ? (
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
            <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
              {rows.map((row) => (
                <LayerRow
                  key={row.layer.id}
                  row={row}
                  selected={selectedIds.includes(row.layer.id)}
                  primary={row.layer.id === activeId}
                  collapsed={collapsed.has(row.layer.id)}
                  onClick={(e) => onRowClick(e, row.layer.id)}
                  onContextMenu={(e) => onRowContextMenu(e, row.layer.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
      <Footer doc={!!doc} selectedIds={selectedIds} activeLayer={activeLayer} />
    </div>
  );
}

/** Leaf-layer count for the module box header (groups don't count themselves). */
export function LayersCount() {
  const doc = useSyncExternalStore(subscribe, getSnapshot, () => null);
  return <>{doc ? leafRenderList(doc.layers).length : 0}</>;
}

// The candy-stripe for hidden rows — theme-aware via color-mix on --foreground.
const HIDDEN_STRIPE =
  "repeating-linear-gradient(-45deg, color-mix(in oklch, var(--foreground) 9%, transparent) 0 4px, transparent 4px 9px)";

function LayerRow({
  row,
  selected,
  primary,
  collapsed,
  onClick,
  onContextMenu,
}: {
  row: PanelRow;
  selected: boolean;
  primary: boolean;
  collapsed: boolean;
  onClick: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const { layer, depth, lastChild } = row;
  const group = isGroup(layer);
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
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={cn(
        "group relative flex h-[30px] cursor-default items-center gap-2 border-b border-border/60 pr-1.5 text-xs outline-none",
        selected ? "bg-accent" : "hover:bg-accent",
      )}
    >
      {/* primary marker — a little arrow (per the sketch, not a stripe) */}
      {primary && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-[2px] top-1/2 z-[2] size-0 -translate-y-1/2 border-y-[4px] border-l-[6px] border-y-transparent border-l-primary"
        />
      )}

      {/* nested indent: ancestor continuation guides (│ where that ancestor has
          siblings below), then this row's tree elbow (├ mid / └ end) */}
      {depth > 0 && (
        <span aria-hidden className="flex shrink-0 self-stretch">
          {row.trail.slice(1).map((ancestorLast, i) => (
            <span key={i} className="relative w-[14px]">
              {!ancestorLast && (
                <span className="absolute inset-y-0 left-[10px] border-l border-muted-foreground/55" />
              )}
            </span>
          ))}
          <span className="relative w-[22px]">
            <span
              className={cn(
                "absolute left-[10px] top-0 border-l border-muted-foreground/55",
                lastChild ? "bottom-1/2" : "bottom-0",
              )}
            />
            <span className="absolute left-[10px] top-1/2 w-2 border-t border-muted-foreground/55" />
          </span>
        </span>
      )}

      {group ? (
        <span
          className={cn(
            "grid size-[22px] shrink-0 place-items-center border border-border bg-muted text-muted-foreground",
            depth === 0 && "ml-1.5",
          )}
        >
          <Folder className="size-3.5" />
        </span>
      ) : (
        <LayerThumb layer={layer} inset={depth === 0} />
      )}

      <span
        className={cn("relative flex-1 truncate", group && "font-semibold")}
        title={layer.name || undefined}
      >
        {layer.name || (
          // ∑CG: display name for an unnamed group row
          //   spec: ≤ 12 chars, noun; British spelling. sample: "Group"
          <span className="font-normal text-muted-foreground">∑CG</span>
        )}
      </span>

      {group ? (
        /* collapse chevron in the lock slot (the sketch's group-row layout) */
        <button
          type="button"
          onPointerDown={stop}
          onClick={(e) => {
            stop(e);
            toggleCollapsed(layer.id);
          }}
          // ∑CG: aria-label for the group expand/collapse toggle. sample: "Collapse group"
          aria-label="∑CG"
          className="relative z-[1] grid size-4 shrink-0 place-items-center text-muted-foreground hover:text-foreground"
        >
          <ChevronDown
            className={cn("size-3.5 transition-transform motion-reduce:transition-none", collapsed && "-rotate-90")}
          />
        </button>
      ) : (
        /* lock — muted when unlocked (hover to reveal), solid when locked */
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
      )}

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

/** Draw a shape layer's geometry into a thumb context, centred on the origin. */
function traceShape(ctx: CanvasRenderingContext2D, params: ShapeParams): void {
  ctx.beginPath();
  switch (params.shape) {
    case "rectangle":
      ctx.roundRect(-params.width / 2, -params.height / 2, params.width, params.height, params.cornerRadius);
      break;
    case "ellipse":
      ctx.ellipse(0, 0, params.rx, params.ry, 0, 0, 2 * Math.PI);
      break;
    case "line":
      ctx.moveTo(-params.length / 2, 0);
      ctx.lineTo(params.length / 2, 0);
      break;
    case "polygon":
    case "star": {
      const pts =
        params.shape === "polygon"
          ? polygonPoints(params.sides, params.radius)
          : starPoints(params.points, params.outerRadius, params.innerRadius);
      pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      break;
    }
  }
}

/** Small live thumbnail — the cached raster, or a shape's geometry mini-render. */
function LayerThumb({ layer, inset }: { layer: Layer; inset: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const hash = layer.kind === "raster" ? layer.blobHash : null;
  // Shape/freehand thumbs redraw on any content change (cheap vector draw);
  // the sig keeps redraws to content changes, not every doc emit. Freehand
  // points are immutable post-commit, so length + styling is identity enough.
  const shapeSig =
    layer.kind === "shape"
      ? JSON.stringify([layer.params, layer.fill, layer.stroke])
      : layer.kind === "freehand"
        ? `${layer.rawPoints.length}|${layer.fill}|${layer.strokeOptions.size}`
        : null;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, el.width, el.height);
    if (layer.kind === "freehand") {
      const dims = freehandDims(layer.rawPoints, layer.strokeOptions);
      const s = (el.width - 6) / Math.max(dims.width, dims.height, 1);
      const d = outlineToPathD(strokeOutline(layer.rawPoints, layer.strokeOptions));
      if (!d) return;
      ctx.save();
      ctx.translate(el.width / 2, el.height / 2);
      ctx.scale(s, s);
      ctx.fillStyle = layer.fill;
      ctx.fill(new Path2D(d));
      ctx.restore();
      return;
    }
    if (layer.kind === "shape") {
      const dims = shapeDims(layer.params);
      const s = (el.width - 8) / Math.max(dims.width, dims.height, 1);
      ctx.save();
      ctx.translate(el.width / 2, el.height / 2);
      ctx.scale(s, s);
      traceShape(ctx, layer.params);
      if (layer.params.shape !== "line") {
        // A gradient previews as its first stop — a real ramp at 22px reads as noise.
        ctx.fillStyle =
          typeof layer.fill === "string" ? layer.fill : (layer.fill.stops[0]?.colour ?? "#888888");
        ctx.fill();
      }
      if (layer.stroke) {
        ctx.strokeStyle = layer.stroke.colour;
        ctx.lineWidth = Math.max(layer.stroke.width, 1.5 / s); // hairlines stay visible at thumb scale
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    if (!hash) return;
    const src = getRaster(hash);
    if (!src) return;
    const s = Math.min(el.width / src.width, el.height / src.height);
    const w = src.width * s;
    const h = src.height * s;
    ctx.drawImage(src, (el.width - w) / 2, (el.height - h) / 2, w, h);
    // `layer` identity churns with every doc edit; hash/shapeSig pin redraws
    // to actual content changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash, shapeSig]);

  return (
    <canvas
      ref={ref}
      width={24}
      height={24}
      className={cn("relative z-[1] size-[22px] shrink-0 border border-border bg-muted", inset && "ml-1.5")}
      aria-hidden
    />
  );
}

// ── footer: blend/opacity + action bar ───────────────────────────────────────

function Footer({
  doc,
  selectedIds,
  activeLayer,
}: {
  doc: boolean;
  selectedIds: readonly string[];
  activeLayer: Layer | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (file) void importImageFile(file);
    e.currentTarget.value = ""; // allow re-picking the same file
  };

  // Group when the multi-selection shares ONE sibling list; a single selected
  // group flips the button to Ungroup. (Group blend/opacity are v1-deferred —
  // the footer controls disable when the primary is a group.)
  const snapshot = getSnapshot();
  const canGroup =
    doc &&
    selectedIds.length >= 2 &&
    !!snapshot &&
    (() => {
      const list = siblingListOf(snapshot.layers, selectedIds[0]);
      return !!list && selectedIds.every((id) => list.some((l) => l.id === id));
    })();
  const soleGroup = activeLayer && selectedIds.length === 1 && isGroup(activeLayer) ? activeLayer : null;
  const primaryIsGroup = !!activeLayer && isGroup(activeLayer);

  return (
    <div className="shrink-0 border-t-2 border-border">
      {/* blend + opacity for the primary layer (labels dropped so long mode names fit) */}
      <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
        <Select
          value={activeLayer?.blendMode ?? "source-over"}
          onValueChange={(v) => activeLayer && setBlendMode(activeLayer.id, v as BlendMode)}
          disabled={!activeLayer || primaryIsGroup}
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
        <OpacityField
          layerId={activeLayer && !primaryIsGroup ? activeLayer.id : null}
          opacity={activeLayer?.opacity ?? 1}
        />
      </div>

      {/* action bar: big Upload primary + group/ungroup · duplicate · toss */}
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
        {soleGroup ? (
          <ActionBtn
            icon={FolderMinus}
            onClick={() => ungroupLayer(soleGroup.id)}
            // ∑CG: aria-label for ungroup. sample: "Ungroup"
            aria="∑CG"
          />
        ) : (
          <ActionBtn
            icon={FolderPlus}
            disabled={!canGroup}
            onClick={() => canGroup && groupLayers(selectedIds)}
            // ∑CG: aria-label for group-selected-layers. sample: "Group layers"
            aria="∑CG"
          />
        )}
        <ActionBtn
          icon={Copy}
          disabled={selectedIds.length === 0}
          onClick={() => duplicateLayers(selectedIds)}
          // ∑CG: aria-label for duplicate selected layer(s). sample: "Duplicate layers"
          aria="∑CG"
        />
        <ActionBtn
          icon={Trash2}
          disabled={selectedIds.length === 0}
          onClick={() => deleteLayers(selectedIds)}
          // ∑CG: aria-label for delete selected layer(s). sample: "Delete layers"
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

/** Opacity field (0–100%) for the primary layer; commits on blur/Enter. */
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
        // ∑CG: aria-label for the primary layer's opacity field. sample: "Opacity"
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
