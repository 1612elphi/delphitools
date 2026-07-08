"use client";

import { useState, useSyncExternalStore } from "react";
import { AudioLines, Grid3x3, Palette, Pipette, Rainbow, SlidersHorizontal, Square, Triangle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { hint } from "@/lib/substrata/hint";
import { getColourName } from "@/lib/colour-names";
import {
  getColour,
  setAlpha,
  setHex,
  setHsv,
  subscribeColour,
} from "@/lib/substrata/colour-store";
import { Knob, usePointerArea } from "@/components/substrata/modules/colour-picker-kit";
import { ColourSwatchCell, DeferredHexInput } from "@/components/colour-field";
import { TriangleMode } from "@/components/substrata/modules/colour-modes/triangle";
import { SlidersMode } from "@/components/substrata/modules/colour-modes/sliders";
import { SwatchesMode } from "@/components/substrata/modules/colour-modes/swatches";
import { PrismMode } from "@/components/substrata/modules/colour-modes/prism";
import { SpectrumMode } from "@/components/substrata/modules/colour-modes/spectrum";
import { ShadeMode } from "@/components/substrata/modules/colour-modes/shade";
import type { ColourSnapshot } from "@/lib/substrata/colour-store";

/**
 * Colour module (modals pass) — the BODY only; the module box supplies the
 * "COLOUR" header + the nearest-name sub. A tabbed picker over one shared
 * current colour (colour-store): basic modes (hue cube · HSV triangle · sliders)
 * and fun modes (swatches · prism · shade). The hue cube lives here; the other
 * five modes are self-contained files in ./colour-modes.
 *
 * All maths lives in colour-convert / colour-hsv / colour-prism; this file is
 * pure UI + pointer handling. Copy is functional chrome (mode labels are icons);
 * the only \u2211CG here is aria text.
 */

type ModeId = "cube" | "triangle" | "sliders" | "swatches" | "prism" | "spectrum" | "shade";

const MODES: { id: ModeId; icon: LucideIcon }[] = [
  { id: "cube", icon: Square },
  { id: "triangle", icon: Triangle },
  { id: "sliders", icon: SlidersHorizontal },
  { id: "swatches", icon: Grid3x3 },
  { id: "prism", icon: Rainbow },
  { id: "spectrum", icon: AudioLines },
  { id: "shade", icon: Palette },
];

function ModeView({ mode, colour }: { mode: ModeId; colour: ColourSnapshot }) {
  switch (mode) {
    case "cube":
      return <HueCube colour={colour} />;
    case "triangle":
      return <TriangleMode colour={colour} />;
    case "sliders":
      return <SlidersMode colour={colour} />;
    case "swatches":
      return <SwatchesMode colour={colour} />;
    case "prism":
      return <PrismMode colour={colour} />;
    case "spectrum":
      return <SpectrumMode colour={colour} />;
    case "shade":
      return <ShadeMode colour={colour} />;
  }
}

export function ColourBody() {
  const colour = useSyncExternalStore(subscribeColour, getColour, getColour);
  const [mode, setMode] = useState<ModeId>("cube");

  return (
    <div>
      {/* mode tabs */}
      <div className="segmented grid-cols-7">
        {MODES.map((m) => {
          const Icon = m.icon;
          const active = mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              {...hint("mode name")}
              className={cn(
                "grid h-8 cursor-default place-items-center",
                active ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
            </button>
          );
        })}
      </div>

      {/* Fixed content height so every mode fills the panel to the same size and
          the whole module sits inside the rail's 300px slot without scrolling
          (header ~30 + tabs ~34 + this + footer ~48 ≤ 300). Modes fill it via
          h-full; taller modes (swatches) scroll within. */}
      <div className="h-[180px] overflow-hidden">
        <ModeView mode={mode} colour={colour} />
      </div>

      <Footer hex={colour.hex} alpha={colour.alpha} />
    </div>
  );
}

/** Box-header sub: nearest colour name for the current colour. */
export function ColourName() {
  const colour = useSyncExternalStore(subscribeColour, getColour, getColour);
  return <>{getColourName(colour.hex)}</>;
}

// ── mode 1: hue cube (SV square + hue + alpha) ───────────────────────────────

function HueCube({ colour }: { colour: ReturnType<typeof getColour> }) {
  const { hsv, alpha, hex } = colour;
  const [svRef, svBind] = usePointerArea((x, y) => setHsv({ s: x, v: 1 - y }));
  const [hueRef, hueBind] = usePointerArea((x) => setHsv({ h: x * 360 }));
  const [alphaRef, alphaBind] = usePointerArea((x) => setAlpha(x));

  return (
    <div className="flex h-full flex-col">
      <div
        ref={svRef}
        {...svBind}
        className="relative min-h-0 flex-1 touch-none border-b border-border"
        style={{
          backgroundColor: `hsl(${hsv.h}, 100%, 50%)`,
          backgroundImage:
            "linear-gradient(to right,#fff,rgba(255,255,255,0)),linear-gradient(to top,#000,rgba(0,0,0,0))",
        }}
      >
        <Knob x={hsv.s} y={1 - hsv.v} />
      </div>

      <div
        ref={hueRef}
        {...hueBind}
        className="relative h-4 touch-none border-b border-border"
        style={{ background: "linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)" }}
      >
        <Knob x={hsv.h / 360} y={0.5} />
      </div>

      <div
        ref={alphaRef}
        {...alphaBind}
        className="relative h-4 touch-none border-b border-border"
        style={{
          backgroundImage: `linear-gradient(to right, transparent, ${hex}), repeating-conic-gradient(#ccc 0 25%, #fff 0 50%)`,
          backgroundSize: "100% 100%, 10px 10px",
        }}
      >
        <Knob x={alpha} y={0.5} />
      </div>
    </div>
  );
}

// ── shared footer: swatch · hex · eyedropper ─────────────────────────────────

interface EyeDropperCtor {
  new (): { open: () => Promise<{ sRGBHex: string }> };
}

// Capability read (secure-context, not in all browsers). useSyncExternalStore
// with a static server snapshot = false avoids both an SSR/hydration mismatch
// and a setState-in-effect (the value never changes after load).
const NOOP_SUBSCRIBE = () => () => {};
const hasEyeDropperClient = () => typeof window !== "undefined" && "EyeDropper" in window;

function Footer({ hex, alpha }: { hex: string; alpha: number }) {
  const hasEyeDropper = useSyncExternalStore(NOOP_SUBSCRIBE, hasEyeDropperClient, () => false);

  const pick = () => {
    const Ctor = (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper;
    if (!Ctor) return;
    void new Ctor().open().then((res) => setHex(res.sRGBHex)).catch(() => {});
  };

  // Flush colour line-item (DESIGN.md §10), reusing the shared gradient-generator
  // components: native swatch cell (click → OS picker) · deferred hex field · the
  // eyedropper. The swatch sits over a checkerboard so alpha reads through.
  return (
    <div className="flex items-stretch border-t border-border">
      <div className="relative w-11 shrink-0 border-r border-border [background:repeating-conic-gradient(#ccc_0_25%,#fff_0_50%)_0_0/10px_10px]">
        <ColourSwatchCell
          colour={hex}
          onChange={(h) => void setHex(h)}
          className="size-full"
          style={{ opacity: alpha }}
          {...hint("Current colour")}
        />
      </div>
      <DeferredHexInput
        value={hex}
        onChange={(h) => void setHex(h)}
        {...hint("Hex value")}
        className="h-9 min-w-0 flex-1 rounded-none border-0 bg-card font-mono text-xs uppercase tabular-nums shadow-none focus-visible:ring-0"
      />
      {hasEyeDropper && (
        <button
          type="button"
          onClick={pick}
          {...hint("Pick from screen")}
          className="grid w-9 shrink-0 place-items-center border-l border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Pipette className="size-3.5" />
        </button>
      )}
    </div>
  );
}
