"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSnapshot, subscribe } from "@/lib/substrata/doc-store";
import { getActiveLayerId, setActiveLayer, subscribeSelection } from "@/lib/substrata/selection";
import { toggleVisibility } from "@/lib/substrata/layer-ops";
import { getRaster } from "@/lib/substrata/raster-cache";
import type { Layer } from "@/lib/substrata/doc-model";

/**
 * Layers module (M1-6). Reads the doc + selection stores; all edits go through
 * the doc store (one-way). Top layer shown first (reverse of the array, since
 * array order is bottom→top z-order). DESIGN.md: dense, flush, hairline, square,
 * mono. Sketch fidelity (tree elbows, candy-stripe, drag-reorder, the big Upload
 * + group/dupe/toss footer) is a follow-up pass; this is list + show/hide +
 * select. All user-facing strings are ∑CG.
 */
export function LayersPanel() {
  const doc = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const activeId = useSyncExternalStore(subscribeSelection, getActiveLayerId, () => null);
  const layers = doc?.layers ?? [];

  return (
    <aside className="flex min-h-0 flex-1 flex-col bg-background text-foreground">
      <div className="flex h-8 shrink-0 items-center border-b border-border px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {/* ∑CG: Layers panel title
            spec: ≤12 chars, the panel name; British spelling.
            sample: "Layers" */}
        ∑CG
      </div>

      {layers.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-muted-foreground">
          {/* ∑CG: empty-state hint when no layers exist
              spec: ≤60 chars, tells the user to drop or paste an image to start;
              friendly-plain; British spelling.
              sample: "Drop or paste an image to begin." */}
          ∑CG
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {[...layers].reverse().map((layer) => (
            <LayerRow key={layer.id} layer={layer} active={layer.id === activeId} />
          ))}
        </div>
      )}
    </aside>
  );
}

function LayerRow({ layer, active }: { layer: Layer; active: boolean }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setActiveLayer(layer.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setActiveLayer(layer.id);
        }
      }}
      className={cn(
        "group flex h-[34px] cursor-default items-center gap-2 border-b border-border/60 px-2 text-xs outline-none",
        active ? "bg-primary/10" : "hover:bg-muted",
        !layer.visible && "opacity-50",
      )}
    >
      <LayerThumb layer={layer} />
      <span className="flex-1 truncate" title={layer.name}>
        {layer.name}
      </span>
      <button
        type="button"
        // ∑CG: aria-label for the layer show/hide toggle
        //   spec: ≤24 chars, describes toggling layer visibility; British spelling.
        //   sample: "Toggle visibility"
        aria-label="∑CG"
        onClick={(e) => {
          e.stopPropagation();
          toggleVisibility(layer.id);
        }}
        className={cn(
          "shrink-0 text-muted-foreground transition-opacity hover:text-foreground",
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
      className="size-6 shrink-0 border border-border bg-muted"
      aria-hidden
    />
  );
}
