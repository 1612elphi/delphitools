"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import { snapCenterToCursor } from "@dnd-kit/modifiers";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Download,
  Plus,
  Trash2,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFilePaste } from "@/hooks/use-file-paste";
import { EXPORT_FORMATS, formatMeta, type ExportFormat } from "@/lib/substrata/export-core";
import { encodeCanvas, jxlAvailable } from "@/lib/substrata/export-encode";

type Side = "top" | "left" | "right" | "bottom";
type Fit = "match" | "cheese" | "matte";
type Mode = "individual" | "batch";
type Dir = "row" | "col";

/** matte-mode surround — white, same default as the Matte Generator */
const MATTE_COLOUR = "#ffffff";

const noSubscribe = () => () => {};

const SIDE_ARROW: Record<Side, LucideIcon> = {
  top: ArrowUp,
  left: ArrowLeft,
  right: ArrowRight,
  bottom: ArrowDown,
};

interface Src {
  id: string;
  name: string;
  el: HTMLImageElement;
  /** object URL — backs both the <img> element and the thumbnails */
  url: string;
  w: number;
  h: number;
}

/* ── the mosaic tree ───────────────────────────────────────────────────────────
 * The composite is a tree: leaves are images, splits are rows (side by side)
 * or columns (stacked). A scoped add wraps one node in a new split, a global
 * add wraps the root — geometry-wise wrapping flattens (a row inside a row
 * lays out identically to one long row), so the tree can stay naive.
 * Fits per leaf: match = centre-cropped to the base image's aspect ratio;
 * cheese = the image's own aspect; matte = match's cell, letterboxed — no crop.
 */

interface LeafNode {
  kind: "img";
  key: string;
  srcId: string;
  fit: Fit;
}

interface SplitNode {
  kind: "split";
  key: string;
  dir: Dir;
  children: TreeNode[];
}

type TreeNode = LeafNode | SplitNode;

const leaf = (srcId: string, fit: Fit = "cheese"): LeafNode => ({
  kind: "img",
  key: crypto.randomUUID(),
  srcId,
  fit,
});

function leafSrcIds(node: TreeNode, into: string[] = []): string[] {
  if (node.kind === "img") into.push(node.srcId);
  else node.children.forEach((c) => leafSrcIds(c, into));
  return into;
}

function mapLeaves(node: TreeNode, fn: (l: LeafNode) => LeafNode): TreeNode {
  if (node.kind === "img") return fn(node);
  return { ...node, children: node.children.map((c) => mapLeaves(c, fn)) };
}

/** Wrap the node with `key` (null = the root) in a new split holding the
 *  added leaves on the given side. */
function wrapNode(root: TreeNode, key: string | null, side: Side, added: LeafNode[]): TreeNode {
  const wrap = (node: TreeNode): TreeNode => ({
    kind: "split",
    key: crypto.randomUUID(),
    dir: side === "left" || side === "right" ? "row" : "col",
    children: side === "left" || side === "top" ? [...added, node] : [node, ...added],
  });
  if (key === null) return wrap(root);
  const walk = (node: TreeNode): TreeNode => {
    if (node.key === key) return wrap(node);
    if (node.kind === "split") return { ...node, children: node.children.map(walk) };
    return node;
  };
  return walk(root);
}

/** Splice leaves into a split's child list (seam insert). */
function insertIntoSplit(root: TreeNode, splitKey: string, at: number, added: LeafNode[]): TreeNode {
  const walk = (node: TreeNode): TreeNode => {
    if (node.kind !== "split") return node;
    if (node.key === splitKey)
      return { ...node, children: [...node.children.slice(0, at), ...added, ...node.children.slice(at)] };
    return { ...node, children: node.children.map(walk) };
  };
  return walk(root);
}

/** Drag-move: two leaves trade contents (image + fit); the mosaic structure
 *  itself never changes — slots stay, pictures move. */
function swapLeafContent(root: TreeNode, aKey: string, bKey: string): TreeNode {
  let a: LeafNode | undefined;
  let b: LeafNode | undefined;
  mapLeaves(root, (l) => {
    if (l.key === aKey) a = l;
    if (l.key === bKey) b = l;
    return l;
  });
  if (!a || !b) return root;
  return mapLeaves(root, (l) =>
    l.key === aKey
      ? { ...l, srcId: b!.srcId, fit: b!.fit }
      : l.key === bKey
        ? { ...l, srcId: a!.srcId, fit: a!.fit }
        : l,
  );
}

/** Drag-move onto an edge arrow: detach the leaf from its slot (collapsing as
 *  needed) and re-wrap the target so it lands on that side. */
function moveLeafNode(root: TreeNode, movedKey: string, targetKey: string, side: Side): TreeNode {
  if (movedKey === targetKey) return root;
  let moved: LeafNode | undefined;
  mapLeaves(root, (l) => {
    if (l.key === movedKey) moved = l;
    return l;
  });
  const without = removeLeafNode(root, movedKey);
  if (!moved || !without) return root;
  return wrapNode(without, targetKey, side, [moved]);
}

/** Remove a leaf; single-child splits collapse away. Returns null when empty. */
function removeLeafNode(root: TreeNode, key: string): TreeNode | null {
  const walk = (node: TreeNode): TreeNode | null => {
    if (node.kind === "img") return node.key === key ? null : node;
    const children = node.children.map(walk).filter((c): c is TreeNode => !!c);
    if (children.length === 0) return null;
    if (children.length === 1) return children[0];
    return { ...node, children };
  };
  return walk(root);
}

/* ── layout: aspect algebra shared by the DOM trail and the PNG export ─────── */

interface Op {
  src: Src;
  leafKey: string;
  isBase: boolean;
  fit: Fit;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

/** A boundary between two siblings of a split — the "insert here" hover strip. */
interface Seam {
  x: number;
  y: number;
  len: number;
  vertical: boolean;
  splitKey: string;
  at: number;
}

interface Layout {
  w: number;
  h: number;
  ops: Op[];
  seams: Seam[];
}

/** centre-crop source rect covering a target aspect (w/h) */
function coverCrop(src: Src, aspect: number) {
  if (src.w / src.h > aspect) {
    const sw = src.h * aspect;
    return { sx: (src.w - sw) / 2, sy: 0, sw, sh: src.h };
  }
  const sh = src.w / aspect;
  return { sx: 0, sy: (src.h - sh) / 2, sw: src.w, sh };
}

/** Every node reduces to an aspect ratio: leaves contribute their own (cheese)
 *  or the base's (match/matte); a row sums them, a column sums the inverses. */
function nodeAspect(node: TreeNode, byId: Map<string, Src>, baseAspect: number): number {
  if (node.kind === "img") {
    const src = byId.get(node.srcId);
    if (!src) return 1;
    return node.fit === "cheese" ? src.w / src.h : baseAspect;
  }
  const as = node.children.map((c) => nodeAspect(c, byId, baseAspect));
  return node.dir === "row" ? as.reduce((s, a) => s + a, 0) : 1 / as.reduce((s, a) => s + 1 / a, 0);
}

function layoutTree(root: TreeNode, byId: Map<string, Src>, baseId: string): Layout | null {
  const base = byId.get(baseId);
  if (!base) return null;
  const baseAspect = base.w / base.h;
  const ops: Op[] = [];
  const seams: Seam[] = [];
  const walk = (node: TreeNode, x: number, y: number, w: number, h: number) => {
    if (node.kind === "img") {
      const src = byId.get(node.srcId);
      if (!src) return;
      const crop = node.fit === "match" ? coverCrop(src, w / h) : { sx: 0, sy: 0, sw: src.w, sh: src.h };
      ops.push({
        src,
        leafKey: node.key,
        isBase: node.srcId === baseId,
        fit: node.fit,
        ...crop,
        dx: x,
        dy: y,
        dw: w,
        dh: h,
      });
      return;
    }
    const as = node.children.map((c) => nodeAspect(c, byId, baseAspect));
    if (node.dir === "row") {
      const total = as.reduce((s, a) => s + a, 0);
      let cx = x;
      node.children.forEach((c, i) => {
        const cw = w * (as[i] / total);
        if (i > 0) seams.push({ x: cx, y, len: h, vertical: true, splitKey: node.key, at: i });
        walk(c, cx, y, cw, h);
        cx += cw;
      });
    } else {
      const inv = as.map((a) => 1 / a);
      const total = inv.reduce((s, a) => s + a, 0);
      let cy = y;
      node.children.forEach((c, i) => {
        const ch = h * (inv[i] / total);
        if (i > 0) seams.push({ x, y: cy, len: w, vertical: false, splitKey: node.key, at: i });
        walk(c, x, cy, w, ch);
        cy += ch;
      });
    }
  };
  const rootAspect = nodeAspect(root, byId, baseAspect);
  walk(root, 0, 0, rootAspect * 1000, 1000);
  // normalise so the base image sits at its native pixel size
  const baseOp = ops.find((o) => o.isBase);
  const k = baseOp ? base.w / baseOp.dw : 1;
  for (const op of ops) {
    op.dx *= k;
    op.dy *= k;
    op.dw *= k;
    op.dh *= k;
  }
  for (const s of seams) {
    s.x *= k;
    s.y *= k;
    s.len *= k;
  }
  return { w: rootAspect * 1000 * k, h: 1000 * k, ops, seams };
}

/** Near-square grid, every cell centre-cropped to the first image's aspect
 *  (batch is match-only — cheese cells would break the grid).
 *  ponytail: cell size = the first image's pixel size; a giant first image
 *  makes a giant grid — add a cell-size control if anyone hits it. */
function layoutBatch(srcs: Src[]): Layout | null {
  if (srcs.length === 0) return null;
  const cellW = srcs[0].w;
  const cellH = srcs[0].h;
  const aspect = cellW / cellH;
  const cols = Math.ceil(Math.sqrt(srcs.length));
  const ops = srcs.map((src, i) => ({
    src,
    leafKey: src.id,
    isBase: i === 0,
    fit: "match" as const,
    ...coverCrop(src, aspect),
    dx: (i % cols) * cellW,
    dy: Math.floor(i / cols) * cellH,
    dw: cellW,
    dh: cellH,
  }));
  return { w: cols * cellW, h: Math.ceil(srcs.length / cols) * cellH, ops, seams: [] };
}

function drawLayout(canvas: HTMLCanvasElement, layout: Layout, maxSide: number, bg?: string) {
  const scale = Math.min(1, maxSide / Math.max(layout.w, layout.h));
  canvas.width = Math.max(1, Math.round(layout.w * scale));
  canvas.height = Math.max(1, Math.round(layout.h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (bg) {
    // alpha-less formats (JPEG) flatten transparency to black — matte it instead
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  for (const op of layout.ops) {
    if (op.fit === "matte") {
      ctx.fillStyle = MATTE_COLOUR;
      ctx.fillRect(op.dx * scale, op.dy * scale, op.dw * scale, op.dh * scale);
      const s = Math.min(op.dw / op.src.w, op.dh / op.src.h);
      const w = op.src.w * s;
      const h = op.src.h * s;
      ctx.drawImage(
        op.src.el,
        (op.dx + (op.dw - w) / 2) * scale,
        (op.dy + (op.dh - h) / 2) * scale,
        w * scale,
        h * scale,
      );
    } else {
      ctx.drawImage(op.src.el, op.sx, op.sy, op.sw, op.sh, op.dx * scale, op.dy * scale, op.dw * scale, op.dh * scale);
    }
  }
}

/** Where the next picked/dropped files should land. */
type Target =
  | { kind: "first" } // seed the trail: first file = base, rest join a row
  | { kind: "add"; nodeKey: string | null; side: Side } // null scopes to the whole composite
  | { kind: "insert"; splitKey: string; at: number }
  | { kind: "batch" };

function loadImageFile(file: File): Promise<Src> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () =>
      resolve({
        id: crypto.randomUUID(),
        name: file.name.replace(/\.[^.]+$/, ""),
        el,
        url,
        w: el.naturalWidth,
        h: el.naturalHeight,
      });
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("undecodable image"));
    };
    el.src = url;
  });
}

/* ── the tool ──────────────────────────────────────────────────────────────── */

export function ImageStitcherTool() {
  const [mode, setMode] = useState<Mode>("individual");
  const [srcs, setSrcs] = useState<Src[]>([]);
  const [root, setRoot] = useState<TreeNode | null>(null);
  const [baseId, setBaseId] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragLeafKey, setDragLeafKey] = useState<string | null>(null);
  // a drag's trailing click must not toggle the selection
  const justDragged = useRef(false);
  const [format, setFormat] = useState<ExportFormat>("png");
  // JXL needs a worker + secure context — server snapshot false keeps SSR safe
  const jxlOk = useSyncExternalStore(noSubscribe, jxlAvailable, () => false);

  const byId = useMemo(() => new Map(srcs.map((s) => [s.id, s])), [srcs]);
  const base = (baseId && byId.get(baseId)) || null;
  const batchSrcs = useMemo(
    () => batchIds.map((id) => byId.get(id)).filter((s): s is Src => !!s),
    [batchIds, byId],
  );
  const dragSrc = (dragId && byId.get(dragId)) || null;

  const addFiles = useCallback(async (files: Iterable<File>): Promise<Src[]> => {
    // snapshot synchronously — live FileLists empty out when the input resets
    // (and a DataTransfer dies with its event) before the first await returns
    const list = Array.from(files);
    const added: Src[] = [];
    for (const f of list) {
      if (!f.type.startsWith("image/")) continue;
      try {
        added.push(await loadImageFile(f));
      } catch {
        // undecodable file — skip it
      }
    }
    if (added.length) setSrcs((cur) => [...cur, ...added]);
    return added;
  }, []);

  /** Route freshly loaded images to wherever the picker/drop was aimed. */
  const place = useCallback((added: Src[], target: Target) => {
    if (added.length === 0) return;
    const leaves = added.map((s) => leaf(s.id));
    if (target.kind === "batch") {
      setBatchIds((cur) => [...cur, ...added.map((s) => s.id)]);
    } else if (target.kind === "first") {
      setBaseId(added[0].id);
      setRoot(
        leaves.length === 1
          ? leaves[0]
          : { kind: "split", key: crypto.randomUUID(), dir: "row", children: leaves },
      );
    } else if (target.kind === "add") {
      setRoot((cur) => (cur ? wrapNode(cur, target.nodeKey, target.side, leaves) : null));
    } else {
      setRoot((cur) => (cur ? insertIntoSplit(cur, target.splitKey, target.at, leaves) : null));
    }
  }, []);

  const dropFiles = (files: Iterable<File>, target: Target) =>
    void addFiles(files).then((added) => place(added, target));

  // one hidden input serves every "+"; the aimed target rides along in a ref
  const pendingTarget = useRef<Target>({ kind: "first" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const openPicker = (target: Target) => {
    pendingTarget.current = target;
    fileInputRef.current?.click();
  };

  useFilePaste((f) => {
    if (mode === "batch") dropFiles([f], { kind: "batch" });
    else dropFiles([f], root ? { kind: "add", nodeKey: selectedKey, side: "right" } : { kind: "first" });
  }, "image/*");

  const dropSrcs = (ids: Set<string>) => {
    for (const id of ids) {
      const s = byId.get(id);
      if (s) URL.revokeObjectURL(s.url);
    }
    setSrcs((cur) => cur.filter((s) => !ids.has(s.id)));
  };

  const removeBatchSrc = (id: string) => {
    setBatchIds((cur) => cur.filter((x) => x !== id));
    dropSrcs(new Set([id]));
  };

  const removeTile = (key: string, srcId: string) => {
    setRoot((cur) => (cur ? removeLeafNode(cur, key) : null));
    setSelectedKey((cur) => (cur === key ? null : cur));
    dropSrcs(new Set([srcId]));
  };

  const clearTrail = () => {
    if (root) dropSrcs(new Set(leafSrcIds(root)));
    setRoot(null);
    setBaseId(null);
    setSelectedKey(null);
  };

  const setFit = (key: string, fit: Fit) =>
    setRoot((cur) => (cur ? mapLeaves(cur, (l) => (l.key === key ? { ...l, fit } : l)) : null));

  const trailLayout = useMemo(
    () => (root && baseId ? layoutTree(root, byId, baseId) : null),
    [root, baseId, byId],
  );

  // Esc drops the selection (ignored while typing in a field)
  useEffect(() => {
    if (!selectedKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedKey(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedKey]);

  const download = async () => {
    const layout = mode === "individual" ? trailLayout : layoutBatch(batchSrcs);
    if (!layout) return;
    const meta = formatMeta(format);
    const canvas = document.createElement("canvas");
    // ponytail: 16384 = safe canvas side cap; larger stitches downscale to fit
    drawLayout(canvas, layout, 16384, meta.alpha ? undefined : MATTE_COLOUR);
    try {
      const blob = await encodeCanvas(canvas, format, 90);
      const a = document.createElement("a");
      a.download = `${(mode === "individual" ? base?.name : batchSrcs[0]?.name) || "stitched"}-stitched.${meta.ext}`;
      a.href = URL.createObjectURL(blob);
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      console.error("stitch export failed", err);
    }
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const onTrailDragEnd = (e: DragEndEvent) => {
    setDragLeafKey(null);
    justDragged.current = true;
    setTimeout(() => (justDragged.current = false), 0);
    const over = e.over?.id;
    if (typeof over !== "string" || over === e.active.id) return;
    const a = String(e.active.id);
    if (over.startsWith("place:")) {
      // edge arrow: move the dragged tile next to the target
      const [, targetKey, side] = over.split(":");
      setRoot((cur) => (cur ? moveLeafNode(cur, a, targetKey, side as Side) : null));
    } else {
      // tile centre: the two images trade places
      setRoot((cur) => (cur ? swapLeafContent(cur, a, over) : null));
    }
  };

  // the edge arrows sit inside the tiles — when the pointer covers both,
  // the arrow (place) must beat the tile centre (swap)
  const trailCollision: CollisionDetection = (args) => {
    const hits = pointerWithin(args);
    const place = hits.filter((c) => String(c.id).startsWith("place:"));
    return place.length ? place : hits;
  };

  const selectTile = (key: string | null) => {
    if (justDragged.current) return;
    setSelectedKey(key);
  };

  const onBatchDragEnd = (e: DragEndEvent) => {
    setDragId(null);
    const over = e.over?.id;
    if (typeof over !== "string" || over === e.active.id) return;
    setBatchIds((cur) => {
      const from = cur.indexOf(String(e.active.id));
      const to = cur.indexOf(over);
      return from < 0 || to < 0 ? cur : arrayMove(cur, from, to);
    });
  };

  const uploader = (target: Target) => (
    <div
      onDrop={(e) => {
        e.preventDefault();
        dropFiles(e.dataTransfer.files, target);
      }}
      onDragOver={(e) => e.preventDefault()}
      onClick={() => openPicker(target)}
      className="cursor-pointer p-10 text-center transition-colors hover:bg-muted/30"
    >
      <Upload className="mx-auto mb-4 size-12 text-muted-foreground" />
      <p className="text-lg font-medium">Drop images here</p>
      <p className="mt-1 text-sm text-muted-foreground">{"Add several images at once or paste"}</p>
    </div>
  );

  const hasResult = mode === "individual" ? !!trailLayout : batchSrcs.length > 0;

  return (
    <div className="space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) dropFiles(e.target.files, pendingTarget.current);
          e.target.value = "";
        }}
      />

      <div className="border-2 border-border">
        {/* mode switch */}
        <div className="flex border-b-2 border-border">
          {(["individual", "batch"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "h-11 flex-1 text-sm font-bold capitalize transition-colors",
                mode === m ? "bg-primary text-primary-foreground" : "hover:bg-muted/50",
              )}
            >
              {m}
            </button>
          ))}
        </div>

        {mode === "individual" ? (
          !trailLayout ? (
            uploader({ kind: "first" })
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={trailCollision}
              onDragStart={(e) => setDragLeafKey(String(e.active.id))}
              onDragCancel={() => setDragLeafKey(null)}
              onDragEnd={onTrailDragEnd}
            >
              <div className="flex justify-end border-b border-border">
                <Button variant="ghost" onClick={clearTrail} className="gap-2 rounded-none">
                  <Trash2 className="size-4" />
                  Clear
                </Button>
              </div>
              {/* the trail: with nothing selected the four + buttons scope to
                  the whole composite; clicking an image scopes them to it */}
              <div
                className="grid gap-1.5 bg-muted/30 p-4"
                style={{
                  gridTemplateColumns: "36px minmax(0,1fr) 36px",
                  gridTemplateRows: "36px minmax(0,1fr) 36px",
                }}
                onClick={() => selectTile(null)}
              >
                <div />
                <SideButton side="top" hidden={!!selectedKey} onPick={openPicker} onDrop={dropFiles} />
                <div />
                <SideButton side="left" hidden={!!selectedKey} onPick={openPicker} onDrop={dropFiles} />
                <Trail
                  layout={trailLayout}
                  selectedKey={selectedKey}
                  dragging={!!dragLeafKey}
                  onSelect={selectTile}
                  onFit={setFit}
                  onRemove={removeTile}
                  onPick={openPicker}
                  onDrop={dropFiles}
                />
                <SideButton side="right" hidden={!!selectedKey} onPick={openPicker} onDrop={dropFiles} />
                <div />
                <SideButton side="bottom" hidden={!!selectedKey} onPick={openPicker} onDrop={dropFiles} />
                <div />
              </div>
              <DragOverlay dropAnimation={null} modifiers={[snapCenterToCursor]}>
                {dragLeafKey &&
                  (() => {
                    const op = trailLayout.ops.find((o) => o.leafKey === dragLeafKey);
                    return op ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={op.src.url}
                        alt=""
                        className="size-16 rotate-6 scale-110 border-2 border-primary object-cover shadow-xl"
                      />
                    ) : null;
                  })()}
              </DragOverlay>
            </DndContext>
          )
        ) : batchSrcs.length === 0 ? (
          uploader({ kind: "batch" })
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={(e) => setDragId(String(e.active.id))}
            onDragCancel={() => setDragId(null)}
            onDragEnd={onBatchDragEnd}
          >
            {/* sortable pool: drag to reorder the grid */}
            <SortableContext items={batchIds} strategy={rectSortingStrategy}>
              <div
                className="flex flex-wrap items-center gap-2 border-b-2 border-border p-3"
                onDrop={(e) => {
                  e.preventDefault();
                  dropFiles(e.dataTransfer.files, { kind: "batch" });
                }}
                onDragOver={(e) => e.preventDefault()}
              >
                {batchSrcs.map((s, i) => (
                  <SortableThumb key={s.id} src={s} index={i} onRemove={removeBatchSrc} />
                ))}
                <button
                  onClick={() => openPicker({ kind: "batch" })}
                  aria-label="Add images"
                  className="grid size-16 shrink-0 place-items-center border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  <Plus className="size-5" />
                </button>
              </div>
            </SortableContext>
            <BatchPreview srcs={batchSrcs} />
            <DragOverlay dropAnimation={null} modifiers={[snapCenterToCursor]}>
              {dragSrc && (
                // the fun bit: the dragged thumb tilts and pops
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={dragSrc.url}
                  alt=""
                  className="size-16 rotate-6 scale-110 border-2 border-primary object-cover shadow-xl"
                />
              )}
            </DragOverlay>
          </DndContext>
        )}

        {hasResult && (
          <div className="flex items-stretch border-t-2 border-border">
            {EXPORT_FORMATS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFormat(f.id)}
                disabled={f.id === "jxl" && !jxlOk}
                className={cn(
                  "border-r border-border px-3.5 text-[11px] font-bold transition-colors disabled:opacity-35",
                  format === f.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50",
                )}
              >
                {f.label}
              </button>
            ))}
            <Button size="lg" onClick={download} className="h-14 flex-1 rounded-none border-0 text-lg font-bold">
              <Download className="mr-2 size-5" />
              {`Download ${formatMeta(format).label}`}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── the trail (individual mode) ───────────────────────────────────────────── */

/** DOM render of the composite: every op is an <img> in a %-positioned box, so
 *  seams, selection, and per-tile controls are ordinary hover/click targets.
 *  Export re-renders the same layout to canvas — the maths is shared. */
function Trail({
  layout,
  selectedKey,
  dragging,
  onSelect,
  onFit,
  onRemove,
  onPick,
  onDrop,
}: {
  layout: Layout;
  selectedKey: string | null;
  dragging: boolean;
  onSelect: (key: string | null) => void;
  onFit: (key: string, fit: Fit) => void;
  onRemove: (key: string, srcId: string) => void;
  onPick: (target: Target) => void;
  onDrop: (files: Iterable<File>, target: Target) => void;
}) {
  const { w, h, ops, seams } = layout;
  const pct = (n: number, of: number) => `${(n / of) * 100}%`;
  const selected = ops.find((o) => o.leafKey === selectedKey);
  return (
    <div className="flex min-h-0 items-center justify-center">
      <div
        className="relative shadow-sm"
        style={{ width: `min(100%, ${(440 * w) / h}px)`, aspectRatio: `${w} / ${h}` }}
      >
        {ops.map((op) => (
          <TrailTile
            key={op.leafKey}
            op={op}
            w={w}
            h={h}
            selected={op.leafKey === selectedKey}
            dragging={dragging}
            onSelect={onSelect}
            onFit={onFit}
            onRemove={onRemove}
          />
        ))}

        {/* hidden-until-hover insert buttons on the seams between images */}
        {!dragging && seams.map((s) => (
          <div
            key={`${s.splitKey}-${s.at}`}
            className="group/seam absolute z-20"
            style={
              s.vertical
                ? { left: pct(s.x, w), top: pct(s.y, h), height: pct(s.len, h), width: 0 }
                : { left: pct(s.x, w), top: pct(s.y, h), width: pct(s.len, w), height: 0 }
            }
          >
            <div className={cn("absolute", s.vertical ? "inset-y-0 -left-3 w-6" : "inset-x-0 -top-3 h-6")} />
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPick({ kind: "insert", splitKey: s.splitKey, at: s.at });
              }}
              aria-label="Insert here"
              className="absolute left-1/2 top-1/2 z-10 grid size-6 -translate-x-1/2 -translate-y-1/2 scale-75 place-items-center border border-primary bg-background text-primary opacity-0 shadow-md transition-all duration-150 hover:bg-primary hover:text-primary-foreground group-hover/seam:scale-100 group-hover/seam:opacity-100"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
        ))}

        {/* selection scope: the four add buttons hug the selected image */}
        {selected &&
          !dragging &&
          (["top", "left", "right", "bottom"] as const).map((side) => {
            const horizontal = side === "left" || side === "right";
            const style: React.CSSProperties = horizontal
              ? {
                  top: pct(selected.dy, h),
                  height: pct(selected.dh, h),
                  width: 22,
                  ...(side === "left"
                    ? { left: pct(selected.dx, w) }
                    : { left: `calc(${pct(selected.dx + selected.dw, w)} - 22px)` }),
                }
              : {
                  left: pct(selected.dx, w),
                  width: pct(selected.dw, w),
                  height: 22,
                  ...(side === "top"
                    ? { top: pct(selected.dy, h) }
                    : { top: `calc(${pct(selected.dy + selected.dh, h)} - 22px)` }),
                };
            return (
              <button
                key={side}
                aria-label={`Add ${side} here`}
                style={style}
                onClick={(e) => {
                  e.stopPropagation();
                  onPick({ kind: "add", nodeKey: selected.leafKey, side });
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDrop(e.dataTransfer.files, { kind: "add", nodeKey: selected.leafKey, side });
                }}
                onDragOver={(e) => e.preventDefault()}
                className="absolute z-30 grid place-items-center border border-dashed border-primary bg-background/70 text-primary backdrop-blur-[1px] transition-colors hover:bg-primary hover:text-primary-foreground"
              >
                <Plus className="size-3.5" />
              </button>
            );
          })}
      </div>
    </div>
  );
}

/** One image in the mosaic: click selects, drag moves (dropping on another
 *  tile swaps the two images — the slot structure never changes), hover shows
 *  the ring preview and the fit pill. */
function TrailTile({
  op,
  w,
  h,
  selected,
  dragging,
  onSelect,
  onFit,
  onRemove,
}: {
  op: Op;
  w: number;
  h: number;
  selected: boolean;
  dragging: boolean;
  onSelect: (key: string | null) => void;
  onFit: (key: string, fit: Fit) => void;
  onRemove: (key: string, srcId: string) => void;
}) {
  const pct = (n: number, of: number) => `${(n / of) * 100}%`;
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: op.leafKey });
  const { isOver, setNodeRef: setDropRef } = useDroppable({ id: op.leafKey });
  return (
    <div
      ref={(el) => {
        setDragRef(el);
        setDropRef(el);
      }}
      {...listeners}
      {...attributes}
      className="group/tile absolute cursor-grab touch-none"
      style={{ left: pct(op.dx, w), top: pct(op.dy, h), width: pct(op.dw, w), height: pct(op.dh, h) }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(selected ? null : op.leafKey);
      }}
    >
      <div
        className={cn("absolute inset-0 overflow-hidden", isDragging && "opacity-40")}
        style={op.fit === "matte" ? { backgroundColor: MATTE_COLOUR } : undefined}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={op.src.url}
          alt={op.src.name}
          className={cn("h-full w-full", op.fit === "matte" ? "object-contain" : "object-cover")}
        />
      </div>
      {/* selection ring: double keyline, previewed softly on hover */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 z-10 transition-opacity duration-150",
          "shadow-[inset_0_0_0_2px_var(--primary),inset_0_0_0_4px_var(--background)]",
          selected ? "opacity-100" : dragging ? "opacity-0" : "opacity-0 group-hover/tile:opacity-50",
        )}
      />
      {/* swap target tint while another tile is dragged over this one */}
      {isOver && !isDragging && (
        <span aria-hidden className="pointer-events-none absolute inset-0 z-10 bg-primary/25" />
      )}
      {/* drop-to-place arrows: appear on every OTHER tile during a drag */}
      {dragging &&
        !isDragging &&
        (["top", "left", "right", "bottom"] as const).map((side) => (
          <PlaceZone key={side} leafKey={op.leafKey} side={side} />
        ))}
      {!op.isBase && !dragging && (
        <div className="absolute inset-0 z-10 hidden place-items-center group-hover/tile:grid">
          <div
            className="flex items-center gap-1 rounded-none border border-border bg-background/95 p-0.5 text-[10px] font-medium shadow-md"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {(["match", "cheese", "matte"] as const).map((f) => (
              <button
                key={f}
                onClick={() => onFit(op.leafKey, f)}
                className={cn(
                  "px-1.5 py-0.5 capitalize transition-colors",
                  op.fit === f ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                {f}
              </button>
            ))}
            <button
              onClick={() => onRemove(op.leafKey, op.src.id)}
              aria-label="Remove tile"
              className="grid size-5 place-items-center text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Edge drop zone shown on a tile while another tile is being dragged —
 *  dropping here MOVES the dragged image to this side of the tile (dropping
 *  on the tile centre swaps instead). */
function PlaceZone({ leafKey, side }: { leafKey: string; side: Side }) {
  const { isOver, setNodeRef } = useDroppable({ id: `place:${leafKey}:${side}` });
  const Icon = SIDE_ARROW[side];
  return (
    <div
      ref={setNodeRef}
      aria-label={`Place ${side}`}
      className={cn(
        "absolute z-20 grid place-items-center transition-colors",
        side === "top" && "inset-x-0 top-0 h-7",
        side === "bottom" && "inset-x-0 bottom-0 h-7",
        side === "left" && "inset-y-0 left-0 w-7",
        side === "right" && "inset-y-0 right-0 w-7",
        isOver && "bg-primary/30",
      )}
    >
      <span
        className={cn(
          "grid size-6 place-items-center border border-primary shadow-md transition-colors",
          isOver ? "bg-primary text-primary-foreground" : "bg-background text-primary",
        )}
      >
        <Icon className="size-3.5" />
      </span>
    </div>
  );
}

/** One of the four slim add buttons hugging the trail — scoped to the whole
 *  composite, so they step aside while an image is selected. Click to pick
 *  files; OS file drops land here too. */
function SideButton({
  side,
  hidden,
  onPick,
  onDrop,
}: {
  side: Side;
  hidden: boolean;
  onPick: (target: Target) => void;
  onDrop: (files: Iterable<File>, target: Target) => void;
}) {
  return (
    <button
      aria-label={`Add ${side}`}
      onClick={(e) => {
        e.stopPropagation();
        onPick({ kind: "add", nodeKey: null, side });
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(e.dataTransfer.files, { kind: "add", nodeKey: null, side });
      }}
      onDragOver={(e) => e.preventDefault()}
      className={cn(
        "grid place-items-center border-2 border-dashed border-border text-muted-foreground transition-all duration-150 hover:border-primary hover:bg-primary/10 hover:text-primary",
        hidden && "pointer-events-none opacity-0",
      )}
    >
      <Plus className="size-4" />
    </button>
  );
}

/* ── batch pieces ──────────────────────────────────────────────────────────── */

/** DOM grid preview — same near-square, first-image-aspect cells as the
 *  export's layoutBatch; object-cover does the centre-crop. */
function BatchPreview({ srcs }: { srcs: Src[] }) {
  const cols = Math.ceil(Math.sqrt(srcs.length));
  const first = srcs[0];
  return (
    <div className="flex justify-center bg-muted/30 p-4">
      <div
        className="grid w-full max-w-[560px] shadow-sm"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {srcs.map((s) => (
          <div key={s.id} className="overflow-hidden" style={{ aspectRatio: `${first.w} / ${first.h}` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.url} alt={s.name} className="h-full w-full object-cover" />
          </div>
        ))}
      </div>
    </div>
  );
}

function SortableThumb({ src, index, onRemove }: { src: Src; index: number; onRemove: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: src.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group relative size-16 shrink-0 cursor-grab touch-none overflow-hidden border border-border bg-muted/30",
        isDragging && "z-10 opacity-30",
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src.url} alt={src.name} className="pointer-events-none h-full w-full object-cover" />
      <span className="absolute bottom-0 left-0 bg-background/80 px-1 font-mono text-[10px] tabular-nums">
        {index + 1}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove(src.id);
        }}
        aria-label="Remove image"
        className="absolute right-0 top-0 hidden size-5 place-items-center bg-background/80 group-hover:grid"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}
