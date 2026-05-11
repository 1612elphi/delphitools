"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  Upload,
  Copy,
  Check,
  Shuffle,
  Plus,
  Minus,
  ExternalLink,
  Wind,
  Palette,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useColourNotation } from "@/hooks/use-colour-notation";
import { formatColour } from "@/lib/colour-notation";
import { getColourName } from "@/lib/colour-names";
import { useBreakpoint, useIsTouchDevice } from "@/hooks/use-breakpoint";
import Link from "next/link";
import { useFilePaste } from "@/hooks/use-file-paste";

type ExtractionStrategy =
  | "dominant"
  | "vibrant"
  | "muted"
  | "light"
  | "dark"
  | "warm"
  | "cool"
  | "accent";

interface StrategyInfo {
  name: string;
  description: string;
}

interface Cluster {
  centroid: [number, number, number]; // OKLAB
  hex: string;
  count: number;
}

const STRATEGIES: Record<ExtractionStrategy, StrategyInfo> = {
  dominant: {
    name: "Dominant",
    description: "The most prominent colours by area — what the image is mostly made of",
  },
  vibrant: {
    name: "Vibrant",
    description: "The most saturated, punchy colours — the ones that pop",
  },
  muted: {
    name: "Muted",
    description: "Understated, desaturated tones — the quiet palette",
  },
  light: {
    name: "Light",
    description: "The brightest colours — highlights, glows, and washed-out tones",
  },
  dark: {
    name: "Dark",
    description: "Deep shadows and rich darks — moody and grounding",
  },
  warm: {
    name: "Warm",
    description: "Reds, oranges, yellows, and earthy tones",
  },
  cool: {
    name: "Cool",
    description: "Blues, greens, and icy tones",
  },
  accent: {
    name: "Accent",
    description: "Rare standout colours that are far from the dominant palette",
  },
};

const STRATEGY_ORDER: ExtractionStrategy[] = [
  "dominant",
  "vibrant",
  "muted",
  "light",
  "dark",
  "warm",
  "cool",
  "accent",
];

const SAMPLE_EDGE = 150;
const MAX_CLUSTERS = 32;
const KMEANS_ITERATIONS = 20;

function srgbToLinear(c: number): number {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  const v =
    c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(255, v * 255)));
}

function rgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const lr = srgbToLinear(r),
    lg = srgbToLinear(g),
    lb = srgbToLinear(b);
  const l = Math.cbrt(
    0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb
  );
  const m = Math.cbrt(
    0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb
  );
  const s = Math.cbrt(
    0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb
  );
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToHex(L: number, a: number, b: number): string {
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);

  const r = linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const g = linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const bv = linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);

  return (
    "#" +
    [r, g, bv]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
  );
}

function oklabChroma(a: number, b: number): number {
  return Math.sqrt(a * a + b * b);
}

function oklabHue(a: number, b: number): number {
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return h;
}

function oklabDist(
  a: [number, number, number],
  b: [number, number, number]
): number {
  const dL = a[0] - b[0];
  const da = a[1] - b[1];
  const db = a[2] - b[2];
  return dL * dL + da * da + db * db;
}

function extractPixels(canvas: HTMLCanvasElement): [number, number, number][] {
  const ctx = canvas.getContext("2d")!;
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const pixels: [number, number, number][] = [];

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    pixels.push(rgbToOklab(data[i], data[i + 1], data[i + 2]));
  }

  return pixels;
}

function kmeanspp(
  pixels: [number, number, number][],
  k: number
): [number, number, number][] {
  const centroids: [number, number, number][] = [];
  centroids.push(pixels[Math.floor(Math.random() * pixels.length)]);

  const distances = new Float64Array(pixels.length).fill(Infinity);

  for (let c = 1; c < k; c++) {
    const last = centroids[c - 1];
    let totalDist = 0;
    for (let i = 0; i < pixels.length; i++) {
      const d = oklabDist(pixels[i], last);
      if (d < distances[i]) distances[i] = d;
      totalDist += distances[i];
    }

    let r = Math.random() * totalDist;
    let idx = 0;
    for (let i = 0; i < pixels.length; i++) {
      r -= distances[i];
      if (r <= 0) {
        idx = i;
        break;
      }
    }
    centroids.push(pixels[idx]);
  }

  return centroids;
}

function runKmeans(
  pixels: [number, number, number][],
  k: number
): Cluster[] {
  if (pixels.length === 0) return [];
  const actualK = Math.min(k, pixels.length);

  let centroids = kmeanspp(pixels, actualK);
  const assignments = new Int32Array(pixels.length);

  for (let iter = 0; iter < KMEANS_ITERATIONS; iter++) {
    // Assign
    for (let i = 0; i < pixels.length; i++) {
      let minDist = Infinity;
      let best = 0;
      for (let c = 0; c < centroids.length; c++) {
        const d = oklabDist(pixels[i], centroids[c]);
        if (d < minDist) {
          minDist = d;
          best = c;
        }
      }
      assignments[i] = best;
    }

    // Update centroids
    const sums = centroids.map(() => [0, 0, 0]);
    const counts = new Int32Array(centroids.length);

    for (let i = 0; i < pixels.length; i++) {
      const c = assignments[i];
      sums[c][0] += pixels[i][0];
      sums[c][1] += pixels[i][1];
      sums[c][2] += pixels[i][2];
      counts[c]++;
    }

    centroids = centroids.map((old, c) => {
      if (counts[c] === 0) return old;
      return [
        sums[c][0] / counts[c],
        sums[c][1] / counts[c],
        sums[c][2] / counts[c],
      ] as [number, number, number];
    });
  }

  // Build clusters
  const clusterCounts = new Int32Array(centroids.length);
  for (let i = 0; i < pixels.length; i++) {
    clusterCounts[assignments[i]]++;
  }

  return centroids
    .map((centroid, i) => ({
      centroid,
      hex: oklabToHex(centroid[0], centroid[1], centroid[2]),
      count: clusterCounts[i],
    }))
    .filter((c) => c.count > 0);
}

function rankClusters(
  clusters: Cluster[],
  strategy: ExtractionStrategy,
  count: number
): Cluster[] {
  let largeCentroids: [number, number, number][] | null = null;
  if (strategy === "accent") {
    const sorted = [...clusters].sort((a, b) => b.count - a.count);
    const largeThreshold = sorted[Math.floor(sorted.length / 3)]?.count ?? 0;
    largeCentroids = sorted
      .filter((cl) => cl.count >= largeThreshold)
      .map((cl) => cl.centroid);
  }

  const scored = clusters.map((c) => {
    const [L, a, b] = c.centroid;
    const chroma = oklabChroma(a, b);
    const hue = oklabHue(a, b);
    let score: number;

    switch (strategy) {
      case "dominant":
        score = c.count;
        break;
      case "vibrant":
        score = chroma * (c.count > 0 ? 1 : 0);
        break;
      case "muted":
        score = 1 / (chroma + 0.001);
        break;
      case "light":
        score = L;
        break;
      case "dark":
        score = 1 - L;
        break;
      case "warm": {
        const isWarm = (hue >= 0 && hue <= 70) || hue >= 320;
        score = isWarm ? chroma + 0.5 : chroma * 0.1;
        break;
      }
      case "cool": {
        const isCool = hue >= 150 && hue <= 300;
        score = isCool ? chroma + 0.5 : chroma * 0.1;
        break;
      }
      case "accent": {
        let minDist = Infinity;
        for (const lc of largeCentroids!) {
          const d = oklabDist(c.centroid, lc);
          if (d < minDist) minDist = d;
        }
        score = minDist / Math.log(c.count + 2);
        break;
      }
    }

    return { cluster: c, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, count).map((s) => s.cluster);
}

function getContrastText(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance =
    0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
  return luminance > 0.4 ? "#000000" : "#ffffff";
}

const MIN_COLOURS = 3;
const MAX_COLOURS = 11;

export function PaletteExtractorTool() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [allClusters, setAllClusters] = useState<Cluster[]>([]);
  const [strategy, setStrategy] = useState<ExtractionStrategy>("dominant");
  const [count, setCount] = useState(5);
  const [copied, setCopied] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const [extracting, setExtracting] = useState(false);

  const { notation } = useColourNotation();
  const breakpoint = useBreakpoint();
  const isTouchDevice = useIsTouchDevice();

  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const paletteRef = useRef<HTMLDivElement>(null);

  const palette = useMemo(
    () => allClusters.length > 0 ? rankClusters(allClusters, strategy, count) : [],
    [allClusters, strategy, count]
  );

  const totalPixels = useMemo(
    () => allClusters.reduce((s, c) => s + c.count, 0),
    [allClusters]
  );

  const shouldUseGrid =
    (breakpoint === "mobile" && count > 4) ||
    (breakpoint === "tablet" && count > 5);

  // Cleanup
  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  const extract = useCallback(
    (canvas: HTMLCanvasElement) => {
      setExtracting(true);
      requestAnimationFrame(() => {
        const pixels = extractPixels(canvas);
        const clusters = runKmeans(pixels, MAX_CLUSTERS);
        setAllClusters(clusters);
        setSelectedIndex(null);
        setExtracting(false);
      });
    },
    []
  );

  const handleImage = useCallback(
    (file: File) => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      const url = URL.createObjectURL(file);
      setImageUrl(url);
      setImageFile(file);
      setAllClusters([]);
      setSelectedIndex(null);

      const img = new Image();
      img.onload = () => {
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        const scale = SAMPLE_EDGE / Math.max(w, h);
        if (scale < 1) {
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, w, h);
        sampleCanvasRef.current = canvas;
        extract(canvas);
      };
      img.src = url;
    },
    [imageUrl, extract]
  );

  useFilePaste(handleImage, "image/*");

  const reExtract = useCallback(() => {
    if (sampleCanvasRef.current) extract(sampleCanvasRef.current);
  }, [extract]);

  // Keyboard: space to re-extract
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isInteractive = ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(tag)
        || (e.target as HTMLElement)?.isContentEditable;
      if (e.code === "Space" && !isInteractive && allClusters.length > 0) {
        e.preventDefault();
        reExtract();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [reExtract, allClusters.length]);

  // Click outside to deselect
  useEffect(() => {
    if (selectedIndex === null || !isTouchDevice) return;
    const handleClick = (e: MouseEvent | TouchEvent) => {
      if (paletteRef.current && !paletteRef.current.contains(e.target as HTMLElement)) {
        setSelectedIndex(null);
      }
    };
    document.addEventListener("click", handleClick);
    document.addEventListener("touchend", handleClick);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("touchend", handleClick);
    };
  }, [selectedIndex, isTouchDevice]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = Array.from(e.dataTransfer.files).find((f) =>
        f.type.startsWith("image/")
      );
      if (file) handleImage(file);
    },
    [handleImage]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file?.type.startsWith("image/")) handleImage(file);
  };

  const copyValue = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  const copyAllColours = () => {
    const values = palette.map((c) => formatColour(c.hex, notation)).join(", ");
    copyValue(values, "all");
  };

  const copyAsCss = () => {
    const vars = palette
      .map((c, i) => `  --palette-${i + 1}: ${formatColour(c.hex, notation)};`)
      .join("\n");
    copyValue(`:root {\n${vars}\n}`, "css");
  };

  const paletteGennyUrl =
    palette.length > 0
      ? `/tools/palette-genny?colors=${palette.map((c) => encodeURIComponent(c.hex)).join(",")}`
      : null;

  const handleSwatchClick = useCallback(
    (i: number, e: React.MouseEvent) => {
      if (isTouchDevice) {
        e.stopPropagation();
        setSelectedIndex((prev) => (prev === i ? null : i));
      }
    },
    [isTouchDevice]
  );

  if (!imageFile) {
    return (
      <div className="space-y-6">
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed rounded-xl p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
          onClick={() =>
            document.getElementById("palette-extractor-input")?.click()
          }
        >
          <input
            id="palette-extractor-input"
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Upload className="size-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-lg font-medium">Drop an image here</p>
          <p className="text-sm text-muted-foreground mt-1">
            or click to select a file, or paste
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Palette Display */}
      {palette.length > 0 && (
        <div
          ref={paletteRef}
          className={cn(
            "relative rounded-2xl overflow-hidden shadow-xl shadow-black/10 border border-border/50",
            "transition-all duration-300 ease-out",
            extracting && "opacity-60"
          )}
          style={{ minHeight: shouldUseGrid ? "auto" : "280px" }}
        >
          <div
            className={cn(
              "transition-all duration-300 ease-out",
              shouldUseGrid ? "grid gap-1 p-1" : "flex h-72"
            )}
            style={
              shouldUseGrid
                ? {
                    gridTemplateColumns:
                      breakpoint === "mobile"
                        ? "repeat(2, 1fr)"
                        : "repeat(3, 1fr)",
                  }
                : undefined
            }
          >
            {palette.map((cluster, i) => {
              const isSelected = selectedIndex === i;
              const textColour = getContrastText(cluster.hex);

              return (
                <div
                  key={`${cluster.hex}-${i}`}
                  onClick={(e) => handleSwatchClick(i, e)}
                  className={cn(
                    "relative cursor-pointer transition-all duration-300 ease-out",
                    shouldUseGrid ? "aspect-square rounded-xl" : "flex-1",
                    !shouldUseGrid && isSelected && "flex-[1.5]",
                    !shouldUseGrid && !isTouchDevice && "group hover:flex-[1.5]",
                    shouldUseGrid &&
                      isSelected &&
                      "ring-4 ring-white/60 scale-[1.03] z-10 shadow-2xl"
                  )}
                  style={{ backgroundColor: cluster.hex }}
                >
                  <div
                    className={cn(
                      "absolute inset-0 flex flex-col items-center justify-center",
                      "transition-opacity duration-200",
                      isSelected ? "opacity-100" : "opacity-0",
                      !isTouchDevice && "group-hover:opacity-100"
                    )}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        copyValue(
                          formatColour(cluster.hex, notation),
                          `swatch-${i}`
                        );
                      }}
                      className={cn(
                        "px-4 py-2 rounded-full transition-all",
                        "bg-white/20 hover:bg-white/40 backdrop-blur-sm",
                        "font-mono text-sm font-semibold tracking-wider",
                        "flex items-center gap-2",
                        "hover:scale-105 active:scale-95",
                        "drop-shadow-sm"
                      )}
                      style={{ color: textColour }}
                    >
                      {copied === `swatch-${i}` ? (
                        <>
                          <Check className="size-4" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="size-4" />
                          {notation === "hex"
                            ? cluster.hex.toUpperCase()
                            : formatColour(cluster.hex, notation)}
                        </>
                      )}
                    </button>
                  </div>

                  {!isSelected && (
                    <div
                      className={cn(
                        "absolute bottom-3 left-0 right-0 text-center",
                        "font-mono text-sm font-semibold tracking-wider",
                        "opacity-70 drop-shadow-sm",
                        "transition-opacity duration-200",
                        !isTouchDevice && "group-hover:opacity-0"
                      )}
                      style={{ color: textColour }}
                    >
                      {notation === "hex"
                        ? cluster.hex.toUpperCase()
                        : formatColour(cluster.hex, notation)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Toolbar: source image + strategy + re-extract + count */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
        {/* Source thumbnail + change */}
        <button
          onClick={() =>
            document.getElementById("palette-extractor-input-change")?.click()
          }
          className="relative size-11 rounded-lg overflow-hidden border shrink-0 hover:ring-2 hover:ring-primary/40 transition-all"
          title={`Source: ${imageFile.name} — click to change`}
        >
          {imageUrl && (
            <img
              src={imageUrl}
              alt="Source"
              className="size-full object-cover"
            />
          )}
        </button>
        <input
          id="palette-extractor-input-change"
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Strategy dropdown */}
        <Select value={strategy} onValueChange={(v) => setStrategy(v as ExtractionStrategy)}>
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STRATEGY_ORDER.map((s) => (
              <SelectItem key={s} value={s}>
                {STRATEGIES[s].name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Re-extract */}
        <Button
          onClick={reExtract}
          disabled={extracting}
          variant="outline"
          size="sm"
          className="gap-2"
          title="Re-extract with new seeds (Space)"
        >
          <Shuffle className="size-4" />
          Re-extract
        </Button>

        {/* Count +/- */}
        <div className="flex items-center gap-1 ml-auto">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setCount((c) => Math.max(MIN_COLOURS, c - 1))}
            disabled={count <= MIN_COLOURS}
            title="Fewer colours"
          >
            <Minus className="size-3.5" />
          </Button>
          <span className="px-1 font-mono text-sm font-bold min-w-[2ch] text-center">
            {count}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setCount((c) => Math.min(MAX_COLOURS, c + 1))}
            disabled={count >= MAX_COLOURS}
            title="More colours"
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Strategy description */}
      <p className="text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">
          {STRATEGIES[strategy].name}
        </span>{" "}
        — {STRATEGIES[strategy].description}
      </p>

      {/* Export actions */}
      {palette.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={copyAllColours}
            className="gap-2"
          >
            {copied === "all" ? (
              <Check className="size-3.5" />
            ) : (
              <Copy className="size-3.5" />
            )}
            Copy All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={copyAsCss}
            className="gap-2"
          >
            {copied === "css" ? (
              <Check className="size-3.5" />
            ) : (
              <Copy className="size-3.5" />
            )}
            CSS Variables
          </Button>
          {paletteGennyUrl && (
            <Button
              variant="outline"
              size="sm"
              asChild
              className="gap-2 ml-auto"
            >
              <Link href={paletteGennyUrl}>
                <Palette className="size-3.5" />
                Open in Palette Generator
                <ExternalLink className="size-3" />
              </Link>
            </Button>
          )}
        </div>
      )}

      {/* Colour list */}
      {palette.length > 0 && (
        <div className="grid gap-2">
          {palette.map((cluster, i) => {
            const name = getColourName(cluster.hex);
            const formatted = formatColour(cluster.hex, notation);
            const pct = totalPixels > 0
              ? ((cluster.count / totalPixels) * 100).toFixed(1)
              : "0";

            return (
              <div
                key={`list-${cluster.hex}-${i}`}
                className={cn(
                  "flex items-center gap-4 px-4 py-3 rounded-xl",
                  "border border-border/50 bg-card",
                  "hover:border-primary/30 hover:bg-card/80",
                  "transition-all duration-200",
                  "group"
                )}
              >
                <div
                  className="size-10 rounded-lg border border-black/10 shadow-inner shrink-0 group-hover:scale-105 transition-transform"
                  style={{ backgroundColor: cluster.hex }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold tracking-wide">
                      {notation === "hex"
                        ? cluster.hex.toUpperCase()
                        : formatted}
                    </span>
                    <span className="text-sm text-muted-foreground capitalize truncate">
                      {name}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono mt-0.5">
                    {pct}% of image
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => copyValue(formatted, `list-${i}`)}
                    title="Copy colour"
                  >
                    {copied === `list-${i}` ? (
                      <Check className="size-4" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    asChild
                    title="Generate Tailwind shades"
                  >
                    <Link
                      href={`/tools/tailwind-shades?color=${encodeURIComponent(cluster.hex)}`}
                    >
                      <Wind className="size-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Keyboard hint */}
      {palette.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          Press{" "}
          <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono">
            Space
          </kbd>{" "}
          to re-extract with new seeds
        </p>
      )}
    </div>
  );
}
