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
 * Layers module (M1-6) — the BODY only; the module box (omnibar bloom / rail)
 * supplies the header. Reads the doc + selection stores; edits go through the doc
 * store (one-way). Top layer first. DESIGN.md dense/flush/hairline. Sketch
 * fidelity (tree elbows, candy-stripe, drag-reorder, blend/upload footer) is a
 * follow-up; this is list + show/hide + select. Copy ∑CG.
 */
export function LayersBody() {
  const doc = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const activeId = useSyncExternalStore(subscribeSelection, getActiveLayerId, () => null);
  const layers = doc?.layers ?? [];

  if (layers.length === 0) {
    return (
      <div className="flex items-center justify-center p-4 text-center text-xs text-muted-foreground">
        {/* ∑CG: empty-state hint when no layers exist
            spec: ≤60 chars, drop or paste an image to start; British spelling.
            sample: "Drop or paste an image to begin." */}
        ∑CG
      </div>
    );
  }

  return (
    <div>
      {[...layers].reverse().map((layer) => (
        <LayerRow key={layer.id} layer={layer} active={layer.id === activeId} />
      ))}
    </div>
  );
}

/** Layer count for the module box header (sub2). */
export function LayersCount() {
  const doc = useSyncExternalStore(subscribe, getSnapshot, () => null);
  return <>{doc?.layers.length ?? 0}</>;
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
        // ∑CG: aria-label for the layer show/hide toggle. sample: "Toggle visibility"
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
