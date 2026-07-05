"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { CircleSlash } from "lucide-react";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { beginTransient, commitTransient, getSnapshot, subscribe } from "@/lib/substrata/doc-store";
import { findLayer, isGroup } from "@/lib/substrata/layer-tree";
import { getActiveLayerId, subscribeSelection } from "@/lib/substrata/selection";
import { getRaster } from "@/lib/substrata/raster-cache";
import {
  FILM_SIM_GRADES,
  FILM_SIM_PRESETS,
  applyGradeToImageData,
} from "@/lib/substrata/filters";
import {
  LUT_LOOKS,
  applyLutToImageData,
  ensureAllLuts,
  getLoadedLut,
  lutEpoch,
  subscribeLuts,
} from "@/lib/substrata/lut-data";
import { clearLook, getLook, setLook, setLookIntensity } from "@/lib/substrata/look-ops";
import type { RasterLayer } from "@/lib/substrata/doc-model";

/**
 * LOOKS module — the bespoke home of the film-sim/LUT family (Ruby,
 * 2026-07-03: pulled OUT of the FX pipeline; a look is browsed with the eyes,
 * not tuned with sliders). Gallery of the preset shelf rendered as LIVE
 * thumbnails — the selected layer's own pixels through each grade (the same
 * pure maths the engine's Canvas2D fallback uses) — plus a None card and one
 * intensity slider. Under the hood a look is still the one film-sim entry in
 * `layer.filters[]`, pinned to the stack's END (grades after adjustments);
 * look-ops is the only writer.
 */
export function LooksBody() {
  const doc = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const activeId = useSyncExternalStore(subscribeSelection, getActiveLayerId, () => null);
  const layer = doc && activeId ? findLayer(doc.layers, activeId) : null;

  // Looks grade PIXELS — raster layers only (a shape gets a look after
  // rasterize, M3-15). Same hint as no-selection: pick a (raster) layer.
  if (!layer || layer.kind !== "raster") {
    return (
      <div className="p-4 text-center text-xs text-muted-foreground">
        {/* ∑CG: LOOKS empty-state hint (no selection, a group, or a non-raster
            layer selected)
            spec: ≤ 48 chars; tells the user to select an image layer to pick
            a look; British spelling.
            sample: "Select an image layer to pick a look." */}
        ∑CG
      </div>
    );
  }

  return <LooksGallery key={layer.id} layer={layer} />;
}

/** id → label across both shelves (authored grades + film LUTs). */
function lookLabel(presetId: string): string | null {
  return (
    FILM_SIM_PRESETS.find((p) => p.id === presetId)?.label ??
    LUT_LOOKS.find((l) => l.id === presetId)?.label ??
    null
  );
}

/** Active look's name for the module box header (sub slot). */
export function LooksSub() {
  const doc = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const activeId = useSyncExternalStore(subscribeSelection, getActiveLayerId, () => null);
  const layer = doc && activeId ? findLayer(doc.layers, activeId) : null;
  const look = layer && !isGroup(layer) ? getLook(layer) : null;
  const label = look ? lookLabel(String(look.params.preset)) : null;
  return label ? <>{label}</> : null;
}

/** Thumbnail geometry: 3:2 cover-crop, 2-up in the module. */
const THUMB_W = 148;
const THUMB_H = 99;

/**
 * Build the base thumbnail (cover-cropped) once per layer, then run each grade
 * over its pixels. Pure canvas work on ~15k pixels × N looks — cheap enough to
 * do synchronously in a memo.
 */
function buildThumbs(blobHash: string): Record<string, string> | null {
  const src = getRaster(blobHash);
  if (!src || typeof document === "undefined") return null;

  const base = document.createElement("canvas");
  base.width = THUMB_W;
  base.height = THUMB_H;
  const ctx = base.getContext("2d")!;
  // cover-crop: fill the 3:2 card from the source's centre
  const scale = Math.max(THUMB_W / src.width, THUMB_H / src.height);
  const w = src.width * scale;
  const h = src.height * scale;
  ctx.drawImage(src, (THUMB_W - w) / 2, (THUMB_H - h) / 2, w, h);
  const basePixels = ctx.getImageData(0, 0, THUMB_W, THUMB_H);

  const work = document.createElement("canvas");
  work.width = THUMB_W;
  work.height = THUMB_H;
  const workCtx = work.getContext("2d")!;

  const byPreset: Record<string, string> = {};
  const render = (id: string, apply: (data: Uint8ClampedArray) => void) => {
    const px = new ImageData(new Uint8ClampedArray(basePixels.data), THUMB_W, THUMB_H);
    apply(px.data);
    workCtx.putImageData(px, 0, 0);
    byPreset[id] = work.toDataURL();
  };
  for (const preset of FILM_SIM_PRESETS) {
    const grade = FILM_SIM_GRADES[preset.id];
    if (grade) render(preset.id, (data) => applyGradeToImageData(data, grade, 1));
  }
  for (const look of LUT_LOOKS) {
    const lut = getLoadedLut(look.id);
    if (lut) render(look.id, (data) => applyLutToImageData(data, lut, 1));
  }
  return byPreset;
}

function LooksGallery({ layer }: { layer: RasterLayer }) {
  const look = getLook(layer);
  const activePreset = look ? String(look.params.preset) : null;
  const intensity = look && typeof look.params.intensity === "number" ? look.params.intensity : 100;

  // The gallery is the natural preload point for the LUT strips (~50 KB each);
  // epoch subscription re-renders as each arrives so its thumb fades in.
  useEffect(() => ensureAllLuts(), []);
  const epoch = useSyncExternalStore(subscribeLuts, lutEpoch, lutEpoch);

  // Source raster is content-addressed and immutable per layer → thumbs are
  // stable per blobHash. `decoded` retries once the raster cache fills (a
  // restore can render one frame before hydration); `epoch` retries as each
  // LUT strip arrives.
  const decoded = getRaster(layer.blobHash) !== undefined;
  const thumbs = useMemo(
    () => (decoded && epoch >= 0 ? buildThumbs(layer.blobHash) : null),
    [layer.blobHash, decoded, epoch],
  );

  return (
    // The 16-card gallery outgrows a hover-bloom (natural height) — cap it to
    // the viewport and scroll the grid inside; None + Intensity stay pinned.
    // In the rail the 300px box wins (h-full), so the cap is inert there.
    <div className="flex h-full max-h-[min(560px,calc(100vh-140px))] flex-col text-xs">
      {/* "None" is conventional chrome (the no-selection cell every picker has);
          a slim full-width row — it's the absence of a look, not a look — which
          leaves the 8 grades in a clean 2×4. */}
      <button
        type="button"
        onClick={() => activePreset !== null && clearLook(layer.id, layer)}
        aria-label="None"
        aria-pressed={activePreset === null}
        className={cn(
          "flex h-8 shrink-0 items-center gap-1.5 border-b border-border px-2.5 text-[10.5px]",
          activePreset === null
            ? "font-semibold text-primary shadow-[inset_0_0_0_2px_var(--primary)]"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        <CircleSlash className="size-3.5" />
        None
      </button>
      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-px overflow-auto bg-border">
        {[...FILM_SIM_PRESETS, ...LUT_LOOKS].map((p) => (
          <LookCard
            key={p.id}
            image={thumbs?.[p.id]}
            label={p.label}
            active={activePreset === p.id}
            onPick={() => setLook(layer.id, layer, p.id)}
            fallback={p.swatch}
          />
        ))}
      </div>
      <IntensityRow layer={layer} value={intensity} disabled={!look} />
    </div>
  );
}

function LookCard({
  image,
  label,
  active,
  onPick,
  fallback,
}: {
  image: string | undefined;
  label: string;
  active: boolean;
  onPick: () => void;
  fallback?: [string, string, string];
}) {
  return (
    <button
      type="button"
      onClick={() => !active && onPick()}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "group relative flex flex-col bg-popover text-left",
        !active && "hover:brightness-110",
      )}
    >
      <span className="relative block aspect-[3/2] w-full overflow-hidden bg-muted">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          // shelf-swatch stand-in until the raster/LUT is ready
          fallback && (
            <span
              aria-hidden
              className="absolute inset-0"
              style={{
                background: `linear-gradient(135deg, ${fallback[0]}, ${fallback[1]} 55%, ${fallback[2]})`,
              }}
            />
          )
        )}
        {active && <span aria-hidden className="absolute inset-0 shadow-[inset_0_0_0_2px_var(--primary)]" />}
      </span>
      <span
        className={cn(
          "block truncate px-1.5 py-1 text-[9.5px] leading-[1.2]",
          active ? "font-semibold text-primary" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
    </button>
  );
}

/** Intensity, FX-slider style: pointer boundary opens/settles the transient
 *  gesture (one undo step per drag; keyboard steps commit singly). */
function IntensityRow({ layer, value, disabled }: { layer: RasterLayer; value: number; disabled: boolean }) {
  const dragging = useRef(false);

  const settle = () => {
    if (!dragging.current) return;
    commitTransient();
    dragging.current = false;
  };

  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-2 border-t border-border px-2.5 py-2",
        disabled && "opacity-40",
      )}
    >
      <span className="shrink-0 text-[10.5px] text-muted-foreground">Intensity</span>
      <div
        className="flex min-w-0 flex-1"
        onPointerDownCapture={() => {
          dragging.current = true;
          beginTransient();
        }}
        onPointerUpCapture={settle}
        onPointerCancelCapture={settle}
      >
        <Slider
          value={[value]}
          min={0}
          max={100}
          step={1}
          disabled={disabled}
          onValueChange={([v]) => setLookIntensity(layer.id, layer, v, { transient: dragging.current })}
          className="min-w-0 flex-1"
          aria-label="Intensity"
        />
      </div>
      <span className="min-w-[34px] shrink-0 text-right text-[10.5px] tabular-nums">{value}%</span>
    </div>
  );
}
