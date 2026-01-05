"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Copy, Check, Plus, Minus, Shuffle, Download, Lock, Unlock, Trash2, Sparkles, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getColourName } from "@/lib/colour-names";
import { useBreakpoint, useIsTouchDevice } from "@/hooks/use-breakpoint";
import {
  generatePalette,
  getStrategiesByCategory,
  STRATEGY_CATEGORIES,
  STRATEGY_INFO,
  type PaletteStrategy,
} from "@/lib/palette-strategies";
import {
  COLLECTION_CATEGORIES,
  type PaletteCollectionCategory,
} from "@/lib/palette-collection";
import Link from "next/link";

// ============================================================================
// COLOUR UTILITIES (kept for local use)
// ============================================================================

function hexToRgb(hex: string): [number, number, number] | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  return [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)];
}

function srgbToLinear(c: number): number {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function rgbToOklch(r: number, g: number, b: number): [number, number, number] {
  const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const bVal = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;

  const c = Math.sqrt(a * a + bVal * bVal);
  let h = Math.atan2(bVal, a) * 180 / Math.PI;
  if (h < 0) h += 360;

  return [L, c, h];
}

function getLuminance(r: number, g: number, b: number): number {
  const [lr, lg, lb] = [r, g, b].map(c => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function getContrastText(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#000000";
  const luminance = getLuminance(...rgb);
  return luminance > 0.4 ? "#000000" : "#ffffff";
}

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

interface PaletteColour {
  id: string;
  hex: string;
  locked: boolean;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

const MIN_COLOURS = 2;
const MAX_COLOURS = 11;
const GRID_THRESHOLD_MOBILE = 4;
const GRID_THRESHOLD_TABLET = 5;

// ============================================================================
// PALETTE COMPONENT
// ============================================================================

// Parse colors from URL param (comma-separated hex values)
function parseColorsFromParam(param: string | null): string[] | null {
  if (!param) return null;
  const colors = param.split(",").map(c => {
    const hex = c.trim();
    // Ensure it starts with #
    return hex.startsWith("#") ? hex : `#${hex}`;
  }).filter(c => /^#[a-f\d]{6}$/i.test(c));
  return colors.length >= MIN_COLOURS ? colors : null;
}

// Get colors param from URL on client side
function getColorsFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("colors");
}

export function PaletteGennyTool() {
  const [colours, setColours] = useState<PaletteColour[]>(() =>
    generatePalette(5, "random-cohesive").map(hex => ({
      id: generateId(),
      hex,
      locked: false,
    }))
  );
  const [strategy, setStrategy] = useState<PaletteStrategy>("random-cohesive");
  const [copied, setCopied] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadedFromUrl, setLoadedFromUrl] = useState(false);
  const hasInitializedFromUrl = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);

  // Hidden export mode (press P to toggle)
  const [exportMode, setExportMode] = useState(false);
  const [exportName, setExportName] = useState("");
  const [exportCategory, setExportCategory] = useState<PaletteCollectionCategory>("classic");
  const [importColorsText, setImportColorsText] = useState("");

  const breakpoint = useBreakpoint();
  const isTouchDevice = useIsTouchDevice();

  // Load colors from URL on mount (client-side only)
  useEffect(() => {
    if (hasInitializedFromUrl.current) return;
    const urlColors = parseColorsFromParam(getColorsFromUrl());
    if (urlColors) {
      setColours(urlColors.map(hex => ({
        id: generateId(),
        hex,
        locked: false,
      })));
      setLoadedFromUrl(true);
      hasInitializedFromUrl.current = true;
    }
  }, []);

  // Determine if we should use grid layout
  const shouldUseGrid =
    (breakpoint === "mobile" && colours.length > GRID_THRESHOLD_MOBILE) ||
    (breakpoint === "tablet" && colours.length > GRID_THRESHOLD_TABLET);

  // Copy helpers
  const copyToClipboard = useCallback(async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  }, []);

  // Generate new palette (respecting locks)
  const regeneratePalette = useCallback(() => {
    setColours(prev => {
      const newHexes = generatePalette(prev.length, strategy);

      return prev.map((colour, i) => {
        if (colour.locked) {
          return colour;
        }
        return {
          id: generateId(),
          hex: newHexes[i],
          locked: false,
        };
      });
    });
    setSelectedId(null);
  }, [strategy]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInputFocused = ["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName);

      if (e.code === "Space" && !isInputFocused) {
        e.preventDefault();
        regeneratePalette();
      }

      // P key toggles export mode (hidden dev feature)
      if (e.code === "KeyP" && !isInputFocused) {
        e.preventDefault();
        setExportMode(prev => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [regeneratePalette]);

  // Click outside to deselect
  useEffect(() => {
    if (!selectedId || !isTouchDevice) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      if (paletteRef.current && !paletteRef.current.contains(target)) {
        setSelectedId(null);
      }
    };

    document.addEventListener("click", handleClickOutside);
    document.addEventListener("touchend", handleClickOutside);
    return () => {
      document.removeEventListener("click", handleClickOutside);
      document.removeEventListener("touchend", handleClickOutside);
    };
  }, [selectedId, isTouchDevice]);

  // Add colour
  const addColour = useCallback(() => {
    if (colours.length >= MAX_COLOURS) return;

    const lastColour = colours[colours.length - 1];
    const rgb = hexToRgb(lastColour.hex);
    if (rgb) {
      const [L, c, h] = rgbToOklch(...rgb);
      const newH = (h + 20 + Math.random() * 20) % 360;
      const newL = Math.max(0.3, Math.min(0.8, L + (Math.random() - 0.5) * 0.2));
      // Generate using the imported utilities from palette-strategies would be cleaner
      // but we can also just create a random variant here
      const newHexes = generatePalette(1, strategy);
      setColours(prev => [...prev, {
        id: generateId(),
        hex: newHexes[0],
        locked: false,
      }]);
    }
  }, [colours, strategy]);

  // Remove colour
  const removeColour = useCallback((id: string) => {
    if (colours.length <= MIN_COLOURS) return;
    setColours(prev => prev.filter(c => c.id !== id));
    if (selectedId === id) setSelectedId(null);
  }, [colours.length, selectedId]);

  // Toggle lock
  const toggleLock = useCallback((id: string) => {
    setColours(prev => prev.map(c =>
      c.id === id ? { ...c, locked: !c.locked } : c
    ));
  }, []);

  // Update colour
  const updateColour = useCallback((id: string, hex: string) => {
    setColours(prev => prev.map(c =>
      c.id === id ? { ...c, hex } : c
    ));
  }, []);

  // Handle swatch click/tap
  const handleSwatchClick = useCallback((id: string, e: React.MouseEvent) => {
    if (isTouchDevice) {
      e.stopPropagation();
      setSelectedId(prev => prev === id ? null : id);
    }
  }, [isTouchDevice]);

  // Copy all as hex list
  const copyAllHex = useCallback(() => {
    const hexes = colours.map(c => c.hex).join(", ");
    copyToClipboard(hexes, "all-hex");
  }, [colours, copyToClipboard]);

  // Copy as CSS variables
  const copyAsCss = useCallback(() => {
    const vars = colours.map((c, i) => `  --palette-${i + 1}: ${c.hex};`).join("\n");
    copyToClipboard(`:root {\n${vars}\n}`, "css");
  }, [colours, copyToClipboard]);

  // Copy as JSON
  const copyAsJson = useCallback(() => {
    const json = JSON.stringify(colours.map(c => c.hex), null, 2);
    copyToClipboard(json, "json");
  }, [colours, copyToClipboard]);

  // Download as image
  const downloadImage = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = 1200;
    const height = 630;
    const padding = 40;
    const swatchHeight = height - padding * 2 - 80;
    const swatchWidth = (width - padding * 2 - (colours.length - 1) * 12) / colours.length;

    canvas.width = width;
    canvas.height = height;

    // Background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    // Draw swatches
    colours.forEach((colour, i) => {
      const x = padding + i * (swatchWidth + 12);
      const y = padding;

      // Swatch
      ctx.fillStyle = colour.hex;
      ctx.beginPath();
      ctx.roundRect(x, y, swatchWidth, swatchHeight, 16);
      ctx.fill();

      // Hex label
      ctx.fillStyle = "#1a1a1a";
      ctx.font = "bold 20px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(colour.hex.toUpperCase(), x + swatchWidth / 2, height - padding - 20);
    });

    // Watermark
    ctx.fillStyle = "#999999";
    ctx.font = "16px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("delphitools.com", width - padding, height - padding + 5);

    // Download
    const link = document.createElement("a");
    link.download = "palette.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }, [colours]);

  // Get grouped strategies for dropdown
  const groupedStrategies = getStrategiesByCategory();

  // Generate slug ID from name
  const exportId = exportName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();

  // Generate the JSON for palette collection (with trailing comma for easy paste)
  const exportJson = exportName.trim()
    ? JSON.stringify(
        {
          id: exportId,
          name: exportName.trim(),
          colors: colours.map(c => c.hex),
          category: exportCategory,
        },
        null,
        2
      ) + ","
    : "";

  // Copy export JSON
  const copyExportJson = useCallback(() => {
    if (exportJson) {
      navigator.clipboard.writeText(exportJson);
      setCopied("export-json");
      setTimeout(() => setCopied(null), 1500);
    }
  }, [exportJson]);

  // Load colors from text input (one per line, no #)
  const loadColorsFromText = useCallback(() => {
    const lines = importColorsText.trim().split("\n");
    const parsedColors = lines
      .map(line => {
        const hex = line.trim().replace(/^#/, "");
        return /^[a-f\d]{6}$/i.test(hex) ? `#${hex}` : null;
      })
      .filter((c): c is string => c !== null);

    if (parsedColors.length >= MIN_COLOURS) {
      setColours(parsedColors.map(hex => ({
        id: generateId(),
        hex,
        locked: false,
      })));
      setImportColorsText("");
    }
  }, [importColorsText]);

  return (
    <div className="space-y-6">
      {/* Main Palette Display */}
      <div
        ref={paletteRef}
        className={cn(
          "relative rounded-2xl overflow-hidden shadow-xl shadow-black/10 border border-border/50",
          "transition-all duration-300 ease-out"
        )}
        style={{ minHeight: shouldUseGrid ? "auto" : "320px" }}
      >
        <div
          className={cn(
            "transition-all duration-300 ease-out",
            shouldUseGrid ? "grid gap-1 p-1" : "flex h-80"
          )}
          style={shouldUseGrid ? {
            gridTemplateColumns: breakpoint === "mobile" ? "repeat(2, 1fr)" : "repeat(3, 1fr)",
          } : undefined}
        >
          {colours.map((colour) => {
            const isSelected = selectedId === colour.id;
            const showControls = isSelected || !isTouchDevice;

            return (
              <div
                key={colour.id}
                data-swatch
                onClick={(e) => handleSwatchClick(colour.id, e)}
                className={cn(
                  "relative cursor-pointer transition-all duration-300 ease-out",
                  shouldUseGrid
                    ? "aspect-square rounded-xl"
                    : "flex-1",
                  // Flex mode: expand on hover/select
                  !shouldUseGrid && isSelected && "flex-[1.5]",
                  !shouldUseGrid && !isTouchDevice && "group hover:flex-[1.5]",
                  // Grid mode: highlight on select
                  shouldUseGrid && isSelected && "ring-4 ring-white/60 scale-[1.03] z-10 shadow-2xl",
                )}
                style={{ backgroundColor: colour.hex }}
              >
                {/* Colour overlay controls */}
                <div
                  className={cn(
                    "absolute inset-0 flex flex-col items-center justify-center",
                    "transition-opacity duration-200",
                    showControls ? "opacity-100" : "opacity-0",
                    !isTouchDevice && "group-hover:opacity-100"
                  )}
                >
                  {/* Top controls row */}
                  <div className="absolute top-3 left-3 right-3 flex justify-between">
                    {/* Delete button (if more than MIN) */}
                    {colours.length > MIN_COLOURS && (
                      <button
                        onClick={(e) => { e.stopPropagation(); removeColour(colour.id); }}
                        className={cn(
                          "p-2 rounded-full transition-all",
                          "bg-black/20 hover:bg-red-500/80",
                          "hover:scale-110 active:scale-95"
                        )}
                        style={{ color: getContrastText(colour.hex) }}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                    {colours.length <= MIN_COLOURS && <div />}

                    {/* Lock button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleLock(colour.id); }}
                      className={cn(
                        "p-2 rounded-full transition-all",
                        "hover:scale-110 active:scale-95",
                        colour.locked
                          ? "bg-white/90 text-black shadow-lg"
                          : "bg-black/20 hover:bg-black/40"
                      )}
                      style={{ color: colour.locked ? "#000" : getContrastText(colour.hex) }}
                    >
                      {colour.locked ? <Lock className="size-4" /> : <Unlock className="size-4" />}
                    </button>
                  </div>

                  {/* Center: Colour picker */}
                  <label
                    className={cn(
                      "cursor-pointer p-3 rounded-full transition-all",
                      "bg-white/20 hover:bg-white/40 backdrop-blur-sm",
                      "hover:scale-110 active:scale-95"
                    )}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="color"
                      value={colour.hex}
                      onChange={(e) => updateColour(colour.id, e.target.value)}
                      className="sr-only"
                    />
                    <div
                      className="size-8 rounded-full border-2 border-white shadow-lg"
                      style={{ backgroundColor: colour.hex }}
                    />
                  </label>

                  {/* Copy hex button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); copyToClipboard(colour.hex, colour.id); }}
                    className={cn(
                      "mt-3 px-4 py-2 rounded-full transition-all",
                      "bg-white/20 hover:bg-white/40 backdrop-blur-sm",
                      "font-mono text-sm font-semibold tracking-wider",
                      "flex items-center gap-2",
                      "hover:scale-105 active:scale-95",
                      "drop-shadow-sm"
                    )}
                    style={{ color: getContrastText(colour.hex) }}
                  >
                    {copied === colour.id ? (
                      <>
                        <Check className="size-4" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="size-4" />
                        {colour.hex.toUpperCase()}
                      </>
                    )}
                  </button>
                </div>

                {/* Lock indicator (always visible when locked, outside of controls) */}
                {colour.locked && !showControls && (
                  <div className="absolute top-3 right-3 p-2 rounded-full bg-white/90 shadow-lg animate-in fade-in zoom-in duration-200">
                    <Lock className="size-4 text-black" />
                  </div>
                )}

                {/* Hex label at bottom (when controls not shown) */}
                {!showControls && (
                  <div
                    className={cn(
                      "absolute bottom-3 left-0 right-0 text-center",
                      "font-mono text-sm font-semibold tracking-wider",
                      "opacity-70 drop-shadow-sm"
                    )}
                    style={{ color: getContrastText(colour.hex) }}
                  >
                    {colour.hex.toUpperCase()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Hidden Export Mode Panel (press P to toggle) */}
      {exportMode && (
        <div className="p-4 rounded-xl border-2 border-dashed border-yellow-500/50 bg-yellow-500/5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-yellow-600 dark:text-yellow-400">Export to Collection (Dev Mode)</h3>
            <button
              onClick={() => setExportMode(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Press P to close
            </button>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Palette Name</label>
              <input
                type="text"
                value={exportName}
                onChange={(e) => setExportName(e.target.value)}
                placeholder="e.g. Ocean Sunset"
                className={cn(
                  "w-full h-10 px-3 rounded-lg border bg-background",
                  "focus:ring-2 focus:ring-primary/20 focus:border-primary"
                )}
              />
              {exportId && (
                <p className="text-xs text-muted-foreground">
                  ID: <code className="px-1 py-0.5 rounded bg-muted">{exportId}</code>
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Category</label>
              <select
                value={exportCategory}
                onChange={(e) => setExportCategory(e.target.value as PaletteCollectionCategory)}
                className={cn(
                  "w-full h-10 px-3 rounded-lg border bg-background",
                  "focus:ring-2 focus:ring-primary/20 focus:border-primary"
                )}
              >
                {Object.entries(COLLECTION_CATEGORIES).map(([key, { label }]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Import colors from text */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Import Colors (one per line, no #)</label>
            <div className="flex gap-2">
              <textarea
                value={importColorsText}
                onChange={(e) => setImportColorsText(e.target.value)}
                placeholder={"1a2744\n2c4a7c\nc9a227\nf4e4ba"}
                rows={4}
                className={cn(
                  "flex-1 px-3 py-2 rounded-lg border bg-background font-mono text-sm",
                  "focus:ring-2 focus:ring-primary/20 focus:border-primary",
                  "resize-none"
                )}
              />
              <Button
                variant="outline"
                onClick={loadColorsFromText}
                disabled={!importColorsText.trim()}
                className="self-end"
              >
                Load
              </Button>
            </div>
          </div>

          {exportJson && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">JSON Output</label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyExportJson}
                  className="gap-2"
                >
                  {copied === "export-json" ? <Check className="size-3" /> : <Copy className="size-3" />}
                  {copied === "export-json" ? "Copied!" : "Copy"}
                </Button>
              </div>
              <pre className="p-3 rounded-lg bg-muted text-xs font-mono overflow-x-auto">
                {exportJson}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Generate button */}
        <Button
          onClick={regeneratePalette}
          className="gap-2 transition-transform hover:scale-105 active:scale-95"
          size="lg"
        >
          <Shuffle className="size-4" />
          Generate
        </Button>

        {/* Strategy selector with grouped options */}
        <div className="relative">
          <select
            value={strategy}
            onChange={(e) => setStrategy(e.target.value as PaletteStrategy)}
            className={cn(
              "h-11 pl-4 pr-10 rounded-xl border-2 bg-background appearance-none cursor-pointer",
              "font-medium text-foreground",
              "focus:ring-2 focus:ring-primary/20 focus:border-primary",
              "transition-all hover:border-primary/50"
            )}
          >
            {Object.entries(STRATEGY_CATEGORIES).map(([category, label]) => (
              <optgroup key={category} label={label}>
                {groupedStrategies[category as keyof typeof groupedStrategies]?.map(({ key, info }) => (
                  <option key={key} value={key}>{info.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 size-5 pointer-events-none text-muted-foreground" />
        </div>

        {/* Add/Remove buttons */}
        <div className="flex items-center gap-1 ml-auto">
          <Button
            variant="outline"
            size="icon"
            onClick={() => removeColour(colours[colours.length - 1].id)}
            disabled={colours.length <= MIN_COLOURS}
            className="transition-transform hover:scale-105 active:scale-95"
          >
            <Minus className="size-4" />
          </Button>
          <span className="px-3 font-mono text-sm font-bold min-w-[3ch] text-center">
            {colours.length}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={addColour}
            disabled={colours.length >= MAX_COLOURS}
            className="transition-transform hover:scale-105 active:scale-95"
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </div>

      {/* Strategy description */}
      <div className="p-4 rounded-xl border bg-muted/30 text-sm text-muted-foreground">
        <span className="font-bold text-foreground">{STRATEGY_INFO[strategy].name}:</span>{" "}
        {STRATEGY_INFO[strategy].description}
      </div>

      {/* Export Options */}
      <div className="space-y-3">
        <label className="font-bold">Export</label>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={copyAllHex} className="gap-2 transition-transform hover:scale-105 active:scale-95">
            {copied === "all-hex" ? <Check className="size-4" /> : <Copy className="size-4" />}
            Copy HEX
          </Button>
          <Button variant="outline" onClick={copyAsCss} className="gap-2 transition-transform hover:scale-105 active:scale-95">
            {copied === "css" ? <Check className="size-4" /> : <Copy className="size-4" />}
            CSS Variables
          </Button>
          <Button variant="outline" onClick={copyAsJson} className="gap-2 transition-transform hover:scale-105 active:scale-95">
            {copied === "json" ? <Check className="size-4" /> : <Copy className="size-4" />}
            JSON
          </Button>
          <Button variant="outline" onClick={downloadImage} className="gap-2 transition-transform hover:scale-105 active:scale-95">
            <Download className="size-4" />
            Download Image
          </Button>
        </div>
      </div>

      {/* Colour List (detailed view) */}
      <div className="space-y-3">
        <label className="font-bold">Colours</label>
        <div className="grid gap-2">
          {colours.map((colour) => {
            const rgb = hexToRgb(colour.hex);
            const oklch = rgb ? rgbToOklch(...rgb) : null;
            const colourName = getColourName(colour.hex);

            return (
              <div
                key={colour.id}
                className={cn(
                  "flex items-center gap-4 p-4 rounded-xl",
                  "border border-border/50 bg-card",
                  "hover:border-primary/30 hover:bg-card/80",
                  "transition-all duration-200",
                  "group"
                )}
              >
                {/* Swatch */}
                <label className="cursor-pointer">
                  <input
                    type="color"
                    value={colour.hex}
                    onChange={(e) => updateColour(colour.id, e.target.value)}
                    className="sr-only"
                  />
                  <div
                    className={cn(
                      "size-14 rounded-lg border border-black/10",
                      "shadow-inner",
                      "group-hover:scale-105 transition-transform"
                    )}
                    style={{ backgroundColor: colour.hex }}
                  />
                </label>

                {/* Colour info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-lg tracking-wide">{colour.hex.toUpperCase()}</span>
                    <span className="text-sm text-muted-foreground capitalize">{colourName}</span>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono mt-0.5">
                    {rgb && <span>RGB {rgb.join(" ")}</span>}
                    {oklch && (
                      <>
                        <span className="mx-2 opacity-50">|</span>
                        <span>L{(oklch[0] * 100).toFixed(0)} C{oklch[1].toFixed(2)} H{oklch[2].toFixed(0)}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleLock(colour.id)}
                    className={cn(
                      "transition-transform hover:scale-110 active:scale-95",
                      colour.locked && "text-primary"
                    )}
                    title={colour.locked ? "Unlock colour" : "Lock colour"}
                  >
                    {colour.locked ? <Lock className="size-4" /> : <Unlock className="size-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyToClipboard(colour.hex, `list-${colour.id}`)}
                    title="Copy hex"
                    className="transition-transform hover:scale-110 active:scale-95"
                  >
                    {copied === `list-${colour.id}` ? <Check className="size-4" /> : <Copy className="size-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    asChild
                    title="Generate Tailwind shades"
                    className="transition-transform hover:scale-110 active:scale-95"
                  >
                    <Link href={`/tools/tailwind-shades?color=${encodeURIComponent(colour.hex)}`}>
                      <Sparkles className="size-4" />
                    </Link>
                  </Button>
                  {colours.length > MIN_COLOURS && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeColour(colour.id)}
                      className="text-muted-foreground hover:text-destructive transition-transform hover:scale-110 active:scale-95"
                      title="Remove colour"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Hidden canvas for image export */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Keyboard shortcuts hint */}
      <div className="text-xs text-muted-foreground text-center pt-4 border-t">
        Press <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono">Space</kbd> to generate a new palette
      </div>
    </div>
  );
}
