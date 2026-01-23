"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronDown, Layers, LayoutGrid, Search, Upload, X } from "lucide-react";
import { PDFDocument } from "pdf-lib";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import {
  paperSizeGroups,
  formatDimensions,
  formatFraction,
  parseSearchQuery,
  matchesNameSearch,
  findClosestSizes,
  type PaperSize
} from "@/lib/paper-sizes";

const COLORS = {
  first: { bg: "bg-primary/20", border: "border-primary", text: "text-primary" },
  second: { bg: "bg-rose-900/20", border: "border-rose-900", text: "text-rose-900" },
};

export function PaperSizesTool() {
  const [selected, setSelected] = useState<[PaperSize | null, PaperSize | null]>([null, null]);
  const [nextSlot, setNextSlot] = useState<0 | 1>(0);
  const [overlayMode, setOverlayMode] = useState(false);
  const [unit, setUnit] = useState<"mm" | "in">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("paperSizeUnit") as "mm" | "in") || "mm";
    }
    return "mm";
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [uploadDpi, setUploadDpi] = useState(300);
  const [uploadedDimensions, setUploadedDimensions] = useState<{width: number; height: number} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchResult = parseSearchQuery(searchQuery);

  useEffect(() => {
    localStorage.setItem("paperSizeUnit", unit);
  }, [unit]);

  useEffect(() => {
    if (uploadedDimensions) {
      setSearchQuery(`${uploadedDimensions.width}x${uploadedDimensions.height}@${uploadDpi}dpi`);
    }
  }, [uploadDpi, uploadedDimensions]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type.startsWith("image/")) {
      const img = new Image();
      img.onload = () => {
        setUploadedDimensions({ width: img.width, height: img.height });
        setSearchQuery(`${img.width}x${img.height}@${uploadDpi}dpi`);
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => {
        URL.revokeObjectURL(img.src);
      };
      img.src = URL.createObjectURL(file);
    } else if (file.type === "application/pdf") {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await PDFDocument.load(arrayBuffer);
        const pageCount = pdf.getPageCount();
        if (pageCount === 0) {
          console.error("PDF has no pages");
          return;
        }
        const firstPage = pdf.getPage(0);
        const { width, height } = firstPage.getSize();
        // PDF dimensions are in points (72 per inch)
        const widthMm = (width / 72) * 25.4;
        const heightMm = (height / 72) * 25.4;
        setUploadedDimensions(null); // Clear pixel dimensions (PDF gives us mm directly)
        setSearchQuery(`${Math.round(widthMm)}x${Math.round(heightMm)}mm`);
      } catch (error) {
        console.error("Failed to parse PDF:", error);
      }
    }

    // Reset file input to allow re-uploading the same file
    e.target.value = '';
  };

  // Compute closest matches for dimension/pixel searches
  const closestMatches = (searchResult.type === "dimensions" || searchResult.type === "pixels")
    ? findClosestSizes(
        paperSizeGroups,
        searchResult.type === "pixels"
          ? (searchResult.width / searchResult.dpi) * 25.4
          : searchResult.widthMm,
        searchResult.type === "pixels"
          ? (searchResult.height / searchResult.dpi) * 25.4
          : searchResult.heightMm
      )
    : [];

  const isHighlighted = (size: PaperSize): boolean => {
    if (searchResult.type === "none") return true;
    if (searchResult.type === "name") return matchesNameSearch(size, searchResult.query);
    // For dimensions/pixels, highlight top 5 closest
    return closestMatches.some(m => m.size.id === size.id && m.size.series === size.series);
  };

  const handleSelect = (size: PaperSize) => {
    const newSelected: [PaperSize | null, PaperSize | null] = [...selected];
    newSelected[nextSlot] = size;
    setSelected(newSelected);
    setNextSlot(nextSlot === 0 ? 1 : 0);
  };

  const clearSlot = (slot: 0 | 1) => {
    const newSelected: [PaperSize | null, PaperSize | null] = [...selected];
    newSelected[slot] = null;
    setSelected(newSelected);
  };

  const maxDimension = Math.max(
    selected[0]?.heightMm ?? 0,
    selected[0]?.widthMm ?? 0,
    selected[1]?.heightMm ?? 0,
    selected[1]?.widthMm ?? 0,
    297
  );

  const getScaledDimensions = (size: PaperSize | null, containerHeight: number) => {
    if (!size) return { width: 0, height: 0 };
    const scale = (containerHeight - 40) / maxDimension;
    return {
      width: Math.round(size.widthMm * scale),
      height: Math.round(size.heightMm * scale),
    };
  };

  const renderSizeBox = (size: PaperSize | null, slot: 0 | 1, containerHeight: number) => {
    const colors = slot === 0 ? COLORS.first : COLORS.second;
    const dims = getScaledDimensions(size, containerHeight);

    if (!size) {
      return (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <span className="text-sm">Click a size below</span>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center h-full">
        <div
          className={`${colors.bg} ${colors.border} border-2 rounded transition-all duration-300`}
          style={{ width: dims.width, height: dims.height }}
        />
      </div>
    );
  };

  const renderSizeDetails = (size: PaperSize | null, slot: 0 | 1) => {
    const colors = slot === 0 ? COLORS.first : COLORS.second;

    if (!size) {
      return (
        <div className="p-4 text-center text-muted-foreground text-sm">
          No size selected
        </div>
      );
    }

    return (
      <div className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className={`text-xl font-bold ${colors.text}`}>{size.label}</span>
          <Button variant="ghost" size="icon" onClick={() => clearSlot(slot)} className="size-6">
            <X className="size-4" />
          </Button>
        </div>
        <div className="text-sm text-muted-foreground">{size.series} · {size.region}</div>
        <div className="grid grid-cols-2 gap-2 pt-2 text-sm">
          <div>
            <div className="text-muted-foreground">Millimeters</div>
            <div className="font-bold">{size.widthMm} × {size.heightMm}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Inches</div>
            <div className="font-bold">{formatFraction(size.widthIn)} × {formatFraction(size.heightIn)}"</div>
          </div>
        </div>
      </div>
    );
  };

  const containerHeight = 280;

  return (
    <div className="space-y-6">
      {/* Mode Toggle */}
      <div className="flex justify-end">
        <div className="flex gap-2">
          <div className="flex rounded-lg border">
            <Button
              variant={unit === "mm" ? "default" : "ghost"}
              size="sm"
              onClick={() => setUnit("mm")}
              className="rounded-r-none"
            >
              mm
            </Button>
            <Button
              variant={unit === "in" ? "default" : "ghost"}
              size="sm"
              onClick={() => setUnit("in")}
              className="rounded-l-none"
            >
              in
            </Button>
          </div>
          <Button
            variant={overlayMode ? "default" : "outline"}
            size="sm"
            onClick={() => setOverlayMode(!overlayMode)}
          >
            {overlayMode ? (
              <><Layers className="size-4 mr-2" /> Overlay</>
            ) : (
              <><LayoutGrid className="size-4 mr-2" /> Side by Side</>
            )}
          </Button>
        </div>
      </div>

      {/* Comparison Boxes */}
      {overlayMode ? (
        <div className="border rounded-xl bg-muted/30 p-4">
          <div className="relative" style={{ height: containerHeight }}>
            {/* First size (back) */}
            {selected[0] && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div
                  className={`${COLORS.first.bg} ${COLORS.first.border} border-2 rounded transition-all duration-300`}
                  style={getScaledDimensions(selected[0], containerHeight)}
                />
              </div>
            )}
            {/* Second size (front) */}
            {selected[1] && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div
                  className={`${COLORS.second.bg} ${COLORS.second.border} border-2 rounded transition-all duration-300`}
                  style={getScaledDimensions(selected[1], containerHeight)}
                />
              </div>
            )}
            {!selected[0] && !selected[1] && (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <span className="text-sm">Select sizes below to compare</span>
              </div>
            )}
          </div>
          {/* Details below overlay */}
          <div className="grid md:grid-cols-2 gap-4 mt-4 border-t pt-4">
            <div className={`rounded-lg border ${selected[0] ? COLORS.first.border : "border-dashed"}`}>
              {renderSizeDetails(selected[0], 0)}
            </div>
            <div className={`rounded-lg border ${selected[1] ? COLORS.second.border : "border-dashed"}`}>
              {renderSizeDetails(selected[1], 1)}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {/* Box 1 */}
          <div className={`rounded-xl border-2 ${selected[0] ? COLORS.first.border : "border-dashed"} bg-muted/30`}>
            <div style={{ height: containerHeight }}>
              {renderSizeBox(selected[0], 0, containerHeight)}
            </div>
            <div className="border-t">
              {renderSizeDetails(selected[0], 0)}
            </div>
          </div>
          {/* Box 2 */}
          <div className={`rounded-xl border-2 ${selected[1] ? COLORS.second.border : "border-dashed"} bg-muted/30`}>
            <div style={{ height: containerHeight }}>
              {renderSizeBox(selected[1], 1, containerHeight)}
            </div>
            <div className="border-t">
              {renderSizeDetails(selected[1], 1)}
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className={`size-4 rounded ${COLORS.first.bg} ${COLORS.first.border} border-2`} />
          <span>First selection</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`size-4 rounded ${COLORS.second.bg} ${COLORS.second.border} border-2`} />
          <span>Second selection</span>
        </div>
      </div>

      {/* Search Bar */}
      <div className="space-y-3">
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search: A4, 210x297mm, 8.5x11in, 1920x1080@300dpi..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                // Clear uploaded dimensions when user manually edits search
                setUploadedDimensions(null);
              }}
              className="pl-10"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 size-7"
                onClick={() => {
                  setSearchQuery("");
                  setUploadedDimensions(null);
                }}
              >
                <X className="size-4" />
              </Button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf"
            className="hidden"
            onChange={handleFileUpload}
          />
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="size-4 mr-2" />
            Upload
          </Button>
        </div>

        {/* DPI selector - show when we have pixel dimensions */}
        {(searchResult.type === "pixels" || uploadedDimensions) && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">DPI:</span>
            {[72, 150, 300, 600].map(dpi => (
              <Button
                key={dpi}
                variant={uploadDpi === dpi ? "default" : "outline"}
                size="sm"
                onClick={() => setUploadDpi(dpi)}
              >
                {dpi}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Closest Matches Banner */}
      {closestMatches.length > 0 && (searchResult.type === "dimensions" || searchResult.type === "pixels") && (
        <Collapsible defaultOpen className="rounded-lg border bg-muted/30 p-4">
          <div className="flex items-center justify-between">
            <div className="font-medium">
              Closest matches for {searchResult.type === "pixels"
                ? `${searchResult.width}×${searchResult.height}px @ ${searchResult.dpi}dpi`
                : `${Math.round(searchResult.widthMm)}×${Math.round(searchResult.heightMm)}mm`
              }
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm">
                <ChevronDown className="size-4" />
              </Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent className="pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {closestMatches.map(({ size, widthDiff, heightDiff }, i) => (
                <button
                  key={`match-${size.series}-${size.id}`}
                  onClick={() => handleSelect(size)}
                  className="p-3 rounded-lg border bg-card text-left hover:bg-accent"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{size.label}</span>
                    {i === 0 && <Badge variant="secondary">Best</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {formatDimensions(size, unit)}
                  </div>
                  <div className="text-xs mt-1">
                    <span className={widthDiff >= 0 ? "text-green-600" : "text-red-600"}>
                      {widthDiff >= 0 ? "+" : ""}{Math.round(widthDiff)}mm
                    </span>
                    {" / "}
                    <span className={heightDiff >= 0 ? "text-green-600" : "text-red-600"}>
                      {heightDiff >= 0 ? "+" : ""}{Math.round(heightDiff)}mm
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Paper Size Grid */}
      <div className="space-y-8">
        {paperSizeGroups.map((group) => (
          <div key={group.id} className="space-y-3">
            <div>
              <h3 className="font-bold text-lg">{group.label}</h3>
              <p className="text-sm text-muted-foreground">{group.description}</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {group.sizes.map((size) => {
                const isSelected0 = selected[0]?.id === size.id && selected[0]?.series === size.series;
                const isSelected1 = selected[1]?.id === size.id && selected[1]?.series === size.series;
                const highlighted = isHighlighted(size);
                return (
                  <button
                    key={`${size.series}-${size.id}`}
                    onClick={() => handleSelect(size)}
                    className={`
                      p-3 rounded-lg border text-left transition-all
                      hover:bg-accent
                      ${isSelected0 ? `${COLORS.first.bg} ${COLORS.first.border} border-2` : ""}
                      ${isSelected1 ? `${COLORS.second.bg} ${COLORS.second.border} border-2` : ""}
                      ${!isSelected0 && !isSelected1 ? "bg-card hover:border-foreground/30" : ""}
                      ${!highlighted ? "opacity-30" : ""}
                    `}
                  >
                    <div className="font-bold">{size.label}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {formatDimensions(size, unit)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
