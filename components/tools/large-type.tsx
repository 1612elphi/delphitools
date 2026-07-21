"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/** Character classes get distinct colours so an O/0 or l/1 can't be misread
 *  while transcribing. Unicode-aware (umlauts are letters, not specials). */
function charColour(ch: string): string {
  if (/\p{N}/u.test(ch)) return "text-sky-600 dark:text-sky-400";
  if (/\s/.test(ch)) return "text-muted-foreground/50";
  if (/\p{L}/u.test(ch)) return "";
  return "text-amber-600 dark:text-amber-400";
}

/** Per-glyph advance width as a fraction of the font size. The app font
 *  (iA Writer Quattro) is only QUASI-mono — m/W/Q run wide — so auto-fit
 *  sizes against the widest glyph actually present, measured for real. */
let measureCtx: CanvasRenderingContext2D | null = null;
const advanceCache = new Map<string, number>();
function charAspect(ch: string): number {
  if (typeof document === "undefined") return 0.6;
  const cached = advanceCache.get(ch);
  if (cached != null) return cached;
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return 0.6;
  measureCtx.font = `100px ${getComputedStyle(document.body).fontFamily}`;
  const measured = measureCtx.measureText(ch === " " ? "␣" : ch).width / 100 || 0.6;
  // a pre-webfont measure sees the fallback font's advance — don't cache it
  if (document.fonts?.status === "loaded") advanceCache.set(ch, measured);
  return measured;
}

/** px-1.5 per cell side + a rounding safety margin */
const CELL_PAD = 14;
/** display container p-6 */
const BOX_PAD = 48;

export function LargeTypeTool() {
  const [text, setText] = useState("");
  const [auto, setAuto] = useState(true); // Maximum: fit the display width
  const [size, setSize] = useState(112);
  const [showPositions, setShowPositions] = useState(true);
  const [colours, setColours] = useState(true);
  const [boxWidth, setBoxWidth] = useState(0);
  const displayRef = useRef<HTMLDivElement>(null);

  // auto-fit follows the live container width (window resize, fullscreen)
  useEffect(() => {
    const el = displayRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // re-render once webfonts land, so the fit maths re-measures the real font
  const [, fontTick] = useState(0);
  useEffect(() => {
    let alive = true;
    void document.fonts?.ready.then(() => alive && fontTick((t) => t + 1));
    return () => {
      alive = false;
    };
  }, []);

  const chars = Array.from(text); // code points, not UTF-16 halves

  const widest = chars.length > 0 ? Math.max(...chars.map(charAspect)) : 0.6;
  const fitSize =
    boxWidth > 0 && chars.length > 0
      ? Math.max(28, Math.min(360, (((boxWidth - BOX_PAD) / chars.length - CELL_PAD) / widest) * 0.98))
      : 112;
  const effectiveSize = auto ? fitSize : size;

  return (
    <div className="space-y-6">
      {/* controls stay column-capped; only the display below runs wide */}
      <div className="mx-auto max-w-4xl border-2 border-border">
        <div className="flex items-stretch">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type or paste"
            autoFocus
            className="h-14 flex-1 rounded-none border-0 bg-transparent px-4 text-lg"
          />
          <Button
            variant="ghost"
            disabled={chars.length === 0}
            onClick={() => displayRef.current?.requestFullscreen()}
            className="h-auto gap-2 self-stretch rounded-none border-l border-border px-5"
          >
            <Maximize2 className="size-4" />
            Fullscreen
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t-2 border-border px-4 py-3">
          <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Size
          </span>
          <button
            onClick={() => setAuto(true)}
            className={cn(
              "border border-border px-2.5 py-1 text-[11px] font-bold transition-colors",
              auto ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            Maximum
          </button>
          {/* dragging the slider takes over from Maximum */}
          <Slider
            value={[Math.round(effectiveSize)]}
            min={28}
            max={360}
            step={4}
            onValueChange={([v]) => {
              setAuto(false);
              setSize(v);
            }}
            className="min-w-32 max-w-xs flex-1"
            aria-label="Size"
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={showPositions} onCheckedChange={setShowPositions} />
            Positions
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={colours} onCheckedChange={setColours} />
            Colours
          </label>
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">
            {chars.length} characters
          </span>
        </div>
      </div>

      {/* the big display — full main-column width; also the fullscreen target */}
      <div className="border-2 border-border">
        <div
          ref={displayRef}
          className="flex min-h-[280px] items-center justify-center overflow-auto bg-background p-6"
        >
          {chars.length > 0 && (
            <div className="flex max-w-full flex-wrap items-end justify-center">
              {chars.map((ch, i) => (
                <div
                  key={i}
                  className={cn("flex flex-col items-center px-1.5 pb-1 pt-2", i % 2 === 0 && "bg-muted/70")}
                >
                  <span
                    className={cn("font-mono leading-none", colours && charColour(ch))}
                    style={{ fontSize: effectiveSize }}
                  >
                    {ch === " " ? "␣" : ch}
                  </span>
                  {showPositions && (
                    <span className="mt-1.5 text-[10px] tabular-nums text-muted-foreground">{i + 1}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
