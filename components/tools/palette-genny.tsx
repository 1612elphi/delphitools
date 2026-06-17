"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Copy, Check, Plus, Minus, Shuffle, Download, Lock, Unlock, Trash2, Wind, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { getColourName } from "@/lib/colour-names";
import { useBreakpoint } from "@/hooks/use-breakpoint";
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
import { useColourNotation } from "@/hooks/use-colour-notation";
import { formatColour } from "@/lib/colour-notation";

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
  const [strategyOpen, setStrategyOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [loadedFromUrl, setLoadedFromUrl] = useState(false);
  const hasInitializedFromUrl = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Hidden export mode (press P to toggle)
  const { notation } = useColourNotation();
  const [exportMode, setExportMode] = useState(false);
  const [exportName, setExportName] = useState("");
  const [exportCategory, setExportCategory] = useState<PaletteCollectionCategory>("classic");
  const [importColorsText, setImportColorsText] = useState("");

  const breakpoint = useBreakpoint();

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
  }, [colours.length]);

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

  // Copy all colours
  const copyAllHex = useCallback(() => {
    const values = colours.map(c => formatColour(c.hex, notation)).join(", ");
    copyToClipboard(values, "all-hex");
  }, [colours, copyToClipboard, notation]);

  // Copy as CSS variables
  const copyAsCss = useCallback(() => {
    const vars = colours.map((c, i) => `  --palette-${i + 1}: ${formatColour(c.hex, notation)};`).join("\n");
    copyToClipboard(`:root {\n${vars}\n}`, "css");
  }, [colours, copyToClipboard, notation]);

  // Copy as JSON
  const copyAsJson = useCallback(() => {
    const json = JSON.stringify(colours.map(c => formatColour(c.hex, notation)), null, 2);
    copyToClipboard(json, "json");
  }, [colours, copyToClipboard, notation]);

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
    ctx.fillText("tools.rmv.fyi", width - padding, height - padding + 5);

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
      {/* Main editor frame */}
      <div className="border-2 border-border">
      {/* Main Palette Display — flush periodic-table columns */}
      <div className="border-b-2 border-border">
        <div
          className={cn(
            "gap-px bg-border",
            shouldUseGrid ? "grid" : "flex h-80"
          )}
          style={
            shouldUseGrid
              ? {
                  gridTemplateColumns:
                    breakpoint === "mobile" ? "repeat(2, 1fr)" : "repeat(3, 1fr)",
                }
              : undefined
          }
        >
          {colours.map((colour, index) => {
            const contrast = getContrastText(colour.hex);
            const value =
              notation === "hex"
                ? colour.hex.toUpperCase()
                : formatColour(colour.hex, notation);
            const name = getColourName(colour.hex);
            const isCopied = copied === colour.id;
            const atMin = colours.length <= MIN_COLOURS;

            return (
              <div
                key={colour.id}
                data-swatch
                className={cn(
                  "group flex min-w-0 flex-col bg-background",
                  !shouldUseGrid && "flex-1"
                )}
              >
                {/* Colour fill — click to edit */}
                <label
                  data-no-select
                  title="Click to edit colour"
                  className={cn(
                    "relative block cursor-pointer",
                    shouldUseGrid ? "aspect-square" : "flex-1"
                  )}
                >
                  <div
                    className="absolute inset-0"
                    style={{ backgroundColor: colour.hex }}
                    aria-hidden
                  />
                  <input
                    type="color"
                    value={colour.hex}
                    onChange={(e) => updateColour(colour.id, e.target.value)}
                    aria-label={`Edit colour ${value}`}
                    className="absolute inset-0 size-full cursor-pointer opacity-0"
                  />
                  {/* Index — atomic-number flourish */}
                  <span
                    className="pointer-events-none absolute left-1.5 top-1 font-mono text-[10px] font-bold tabular-nums opacity-50"
                    style={{ color: contrast }}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {/* Lock state */}
                  {colour.locked && (
                    <Lock
                      className="pointer-events-none absolute right-1.5 top-1.5 size-3.5 drop-shadow-sm"
                      style={{ color: contrast }}
                    />
                  )}
                </label>

                {/* Caption — text breathes */}
                <div className="border-t border-border px-2 py-1.5 leading-tight">
                  <div className="truncate font-mono text-sm font-bold tracking-tight">
                    {value}
                  </div>
                  <div className="truncate text-[11px] capitalize text-muted-foreground">
                    {name}
                  </div>
                </div>

                {/* Control bar — flush, hairline-divided */}
                <div className="flex border-t border-border">
                  <button
                    type="button"
                    onClick={() => toggleLock(colour.id)}
                    aria-label={colour.locked ? "Unlock colour" : "Lock colour"}
                    title={colour.locked ? "Unlock" : "Lock"}
                    className={cn(
                      "flex h-9 flex-1 items-center justify-center transition-colors hover:bg-muted",
                      colour.locked
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {colour.locked ? (
                      <Lock className="size-4" />
                    ) : (
                      <Unlock className="size-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(formatColour(colour.hex, notation), colour.id)}
                    aria-label="Copy colour"
                    title="Copy"
                    className="flex h-9 flex-1 items-center justify-center border-l border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {isCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeColour(colour.id)}
                    disabled={atMin}
                    aria-label="Remove colour"
                    title="Remove"
                    className="flex h-9 flex-1 items-center justify-center border-l border-border text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:pointer-events-none disabled:opacity-30"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Hidden Export Mode Panel (press P to toggle) */}
      {exportMode && (
        <div className="p-4 border-b-2 border-dashed border-yellow-500/50 bg-yellow-500/5 space-y-4">
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
                  "w-full h-10 px-3 border bg-background",
                  "focus:ring-2 focus:ring-primary/20 focus:border-primary"
                )}
              />
              {exportId && (
                <p className="text-xs text-muted-foreground">
                  ID: <code className="px-1 py-0.5 bg-muted">{exportId}</code>
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Category</label>
              <Select value={exportCategory} onValueChange={(v) => setExportCategory(v as PaletteCollectionCategory)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(COLLECTION_CATEGORIES).map(([key, { label }]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                  "flex-1 px-3 py-2 border bg-background font-mono text-sm",
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
              <pre className="p-3 bg-muted text-xs font-mono overflow-x-auto">
                {exportJson}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="flex min-h-16 items-stretch border-b-2 border-border">
        {/* Strategy selector (left) — combobox with name + description fused */}
        <Popover open={strategyOpen} onOpenChange={setStrategyOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              role="combobox"
              aria-expanded={strategyOpen}
              aria-label="Choose palette strategy"
              className="flex min-w-0 flex-1 items-center gap-3 border-r border-border px-4 py-2 text-left transition-colors hover:bg-muted/50"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold leading-tight">
                  {STRATEGY_INFO[strategy].name}
                </span>
                <span className="block truncate text-xs leading-tight text-muted-foreground">
                  {STRATEGY_INFO[strategy].description}
                </span>
              </span>
              <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[min(24rem,90vw)] p-0">
            <Command>
              <CommandInput placeholder="Search strategies…" />
              <CommandList>
                <CommandEmpty>No strategy found.</CommandEmpty>
                {Object.entries(STRATEGY_CATEGORIES).map(([category, label]) => (
                  <CommandGroup key={category} heading={label}>
                    {groupedStrategies[category as keyof typeof groupedStrategies]?.map(({ key, info }) => (
                      <CommandItem
                        key={key}
                        value={`${info.name} ${info.description}`}
                        onSelect={() => {
                          setStrategy(key as PaletteStrategy);
                          setStrategyOpen(false);
                        }}
                        className="flex items-start gap-2"
                      >
                        <Check
                          className={cn(
                            "mt-0.5 size-4 shrink-0",
                            strategy === key ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-bold leading-tight">{info.name}</span>
                          <span className="block text-xs leading-tight text-muted-foreground">
                            {info.description}
                          </span>
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Generate (centre, big, primary) */}
        <Button
          onClick={regeneratePalette}
          className="h-auto flex-[1.3] gap-2 rounded-none border-0 text-base font-bold"
        >
          <Shuffle className="size-5" />
          Generate
        </Button>

        {/* Colour count (right) */}
        <div className="flex items-stretch border-l border-border">
          <button
            type="button"
            onClick={() => removeColour(colours[colours.length - 1].id)}
            disabled={colours.length <= MIN_COLOURS}
            aria-label="Remove colour"
            className="flex w-12 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
          >
            <Minus className="size-4" />
          </button>
          <span className="flex min-w-12 items-center justify-center border-x border-border px-2 font-mono text-sm font-bold">
            {colours.length}
          </span>
          <button
            type="button"
            onClick={addColour}
            disabled={colours.length >= MAX_COLOURS}
            aria-label="Add colour"
            className="flex w-12 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
          >
            <Plus className="size-4" />
          </button>
        </div>
      </div>

      {/* Export Options */}
      <div className="space-y-3 border-b-2 border-border p-4">
        <label className="font-bold">Export</label>
        <div className="segmented grid-cols-2 sm:grid-cols-4 -mx-4 -mb-4 border-x-0 border-b-0">
          <Button variant="outline" onClick={copyAllHex} className="gap-2">
            {copied === "all-hex" ? <Check className="size-4" /> : <Copy className="size-4" />}
            Copy Colours
          </Button>
          <Button variant="outline" onClick={copyAsCss} className="gap-2">
            {copied === "css" ? <Check className="size-4" /> : <Copy className="size-4" />}
            CSS Variables
          </Button>
          <Button variant="outline" onClick={copyAsJson} className="gap-2">
            {copied === "json" ? <Check className="size-4" /> : <Copy className="size-4" />}
            JSON
          </Button>
          <Button variant="outline" onClick={downloadImage} className="gap-2">
            <Download className="size-4" />
            Download Image
          </Button>
        </div>
      </div>

      {/* Colour List (detailed view) */}
      <div className="p-4">
        <label className="font-bold">Colours</label>
        <div className="-mx-4 -mb-4 mt-3 border-t border-border">
          {colours.map((colour) => {
            const rgb = hexToRgb(colour.hex);
            const oklch = rgb ? rgbToOklch(...rgb) : null;
            const colourName = getColourName(colour.hex);

            return (
              <div
                key={colour.id}
                className={cn(
                  "flex items-stretch",
                  "border-b border-border bg-card",
                  "hover:bg-card/80",
                  "transition-colors duration-200",
                  "group"
                )}
              >
                {/* Swatch */}
                <label className="relative w-16 shrink-0 cursor-pointer border-r border-border">
                  <input
                    type="color"
                    value={colour.hex}
                    onChange={(e) => updateColour(colour.id, e.target.value)}
                    className="absolute inset-0 size-full cursor-pointer opacity-0"
                  />
                  <div
                    className="size-full"
                    style={{ backgroundColor: colour.hex }}
                    aria-hidden
                  />
                </label>

                {/* Colour info */}
                <div className="flex-1 min-w-0 p-4">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-lg tracking-wide">
                      {notation === "hex" ? colour.hex.toUpperCase() : formatColour(colour.hex, notation)}
                    </span>
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
                <div className="flex items-center gap-1 border-l border-border px-2">
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
                    onClick={() => copyToClipboard(formatColour(colour.hex, notation), `list-${colour.id}`)}
                    title="Copy colour"
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
                      <Wind className="size-4" />
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
      </div>

      {/* Hidden canvas for image export */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Keyboard shortcuts hint */}
      <div className="text-xs text-muted-foreground text-center pt-4 border-t">
        Press <kbd className="px-1.5 py-0.5 bg-muted font-mono">Space</kbd> to generate a new palette
      </div>
    </div>
  );
}
