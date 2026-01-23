"use client";

import { useState } from "react";
import { Layers, LayoutGrid, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { paperSizeGroups, type PaperSize } from "@/lib/paper-sizes";

const COLORS = {
  first: { bg: "bg-primary/20", border: "border-primary", text: "text-primary" },
  second: { bg: "bg-rose-900/20", border: "border-rose-900", text: "text-rose-900" },
};

const getPrimaryDimensions = (size: PaperSize): string => {
  // US sizes use inches as primary
  if (size.region === "North America") {
    return `${size.widthIn.toFixed(1)} × ${size.heightIn.toFixed(1)}"`;
  }
  // Everything else uses mm
  return `${Math.round(size.widthMm)} × ${Math.round(size.heightMm)} mm`;
};

export function PaperSizesTool() {
  const [selected, setSelected] = useState<[PaperSize | null, PaperSize | null]>([null, null]);
  const [nextSlot, setNextSlot] = useState<0 | 1>(0);
  const [overlayMode, setOverlayMode] = useState(false);

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
            <div className="font-bold">{size.widthIn.toFixed(2)} × {size.heightIn.toFixed(2)}</div>
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
                    `}
                  >
                    <div className="font-bold">{size.label}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {getPrimaryDimensions(size)}
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
