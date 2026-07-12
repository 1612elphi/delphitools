"use client";

import { useRef, useSyncExternalStore } from "react";
import { ImagePlus, Type } from "lucide-react";
import { getSnapshot, subscribe } from "@/lib/substrata/doc-store";
import { importImageFile } from "@/lib/substrata/import-raster";
import { setActiveTool } from "@/lib/substrata/tool";

/**
 * Empty-scene starter card (clarity review #2/#3): the blank artboard gave a
 * first-time visitor no visible way in — import lived in a menu, drag-drop and
 * paste were advertised nowhere, and the default Move tool does nothing on an
 * empty click. This floats over the canvas ONLY while the scene has no layers,
 * offers the two primary "add something" paths, and names the invisible ones
 * (drop / paste). pointer-events pass through everywhere except the card, so
 * marquee/pan/drop on the canvas keep working.
 */
export function EmptyHint() {
  const doc = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!doc || doc.layers.length > 0) return null;

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) for (const f of Array.from(files)) if (f.type.startsWith("image/")) void importImageFile(f);
    e.target.value = "";
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center" data-empty-hint>
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={onPick} />
      <div className="pointer-events-auto w-[264px] border border-border bg-background shadow-lg">
        <div className="segmented grid-cols-2 border-x-0 border-t-0">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-[64px] flex-col items-center justify-center gap-1.5 bg-background text-[11px] hover:bg-accent"
          >
            <ImagePlus className="size-[18px] text-muted-foreground" />
            Add image
          </button>
          <button
            type="button"
            onClick={() => setActiveTool("text")}
            className="flex h-[64px] flex-col items-center justify-center gap-1.5 bg-background text-[11px] hover:bg-accent"
          >
            <Type className="size-[18px] text-muted-foreground" />
            Add text
          </button>
        </div>
        <div className="px-3 py-2 text-center text-[10.5px] text-muted-foreground">
          Drop an image, or paste one.
        </div>
      </div>
    </div>
  );
}
