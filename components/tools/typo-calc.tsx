"use client";

import { useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Unit = "px" | "pt" | "pc" | "ag" | "cc" | "in" | "mm" | "cm" | "em" | "rem";

interface UnitInfo {
  name: string;
  description: string;
  toPx: (value: number, basePx: number) => number;
  fromPx: (px: number, basePx: number) => number;
}

const UNITS: Record<Unit, UnitInfo> = {
  px: {
    name: "Pixels",
    description: "Screen pixels (96 per inch)",
    toPx: (v) => v,
    fromPx: (px) => px,
  },
  pt: {
    name: "Points",
    description: "Print points (72 per inch)",
    toPx: (v) => v * (96 / 72),
    fromPx: (px) => px * (72 / 96),
  },
  pc: {
    name: "Picas",
    description: "12 points per pica",
    toPx: (v) => v * 12 * (96 / 72),
    fromPx: (px) => px / 12 * (72 / 96),
  },
  ag: {
    name: "Agates",
    description: "14 agates per inch (US newspapers)",
    toPx: (v) => v * (96 / 14),
    fromPx: (px) => px * (14 / 96),
  },
  cc: {
    name: "Ciceros",
    description: "European unit (≈4.512mm)",
    toPx: (v) => v * 4.512 * (96 / 25.4),
    fromPx: (px) => px / (4.512 * (96 / 25.4)),
  },
  in: {
    name: "Inches",
    description: "Imperial inch",
    toPx: (v) => v * 96,
    fromPx: (px) => px / 96,
  },
  mm: {
    name: "Millimeters",
    description: "Metric millimeter",
    toPx: (v) => v * (96 / 25.4),
    fromPx: (px) => px * (25.4 / 96),
  },
  cm: {
    name: "Centimeters",
    description: "Metric centimeter",
    toPx: (v) => v * (96 / 2.54),
    fromPx: (px) => px * (2.54 / 96),
  },
  em: {
    name: "Em",
    description: "Relative to parent font-size",
    toPx: (v, basePx) => v * basePx,
    fromPx: (px, basePx) => px / basePx,
  },
  rem: {
    name: "Rem",
    description: "Relative to root font-size",
    toPx: (v, basePx) => v * basePx,
    fromPx: (px, basePx) => px / basePx,
  },
};

const UNIT_ORDER: Unit[] = ["px", "pt", "pc", "ag", "cc", "in", "mm", "cm", "em", "rem"];

export function TypoCalcTool() {
  const [inputValue, setInputValue] = useState("16");
  const [inputUnit, setInputUnit] = useState<Unit>("px");
  const [baseFontSize, setBaseFontSize] = useState("16");

  const basePx = parseFloat(baseFontSize) || 16;
  const numValue = parseFloat(inputValue) || 0;
  const pxValue = UNITS[inputUnit].toPx(numValue, basePx);

  const formatValue = (value: number) => {
    if (Math.abs(value) < 0.001) return "0";
    if (Math.abs(value) >= 1000) return value.toFixed(2);
    if (Math.abs(value) >= 100) return value.toFixed(3);
    if (Math.abs(value) >= 10) return value.toFixed(4);
    if (Math.abs(value) >= 1) return value.toFixed(5);
    return value.toFixed(6);
  };

  const swapUnit = (newUnit: Unit) => {
    const newValue = UNITS[newUnit].fromPx(pxValue, basePx);
    setInputValue(formatValue(newValue));
    setInputUnit(newUnit);
  };

  return (
    <div className="space-y-6">
      {/* Base Font Size */}
      <div className="p-4 rounded-lg border bg-muted/30">
        <div className="flex items-center justify-between gap-4">
          <div>
            <label className="font-bold">Base Font Size</label>
            <p className="text-sm text-muted-foreground">
              Used for em and rem calculations
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={baseFontSize}
              onChange={(e) => setBaseFontSize(e.target.value)}
              className="w-24 text-center font-mono"
            />
            <span className="text-muted-foreground">px</span>
          </div>
        </div>
      </div>

      {/* Input */}
      <div className="space-y-3">
        <label className="font-bold">Convert From</label>
        <div className="flex gap-3">
          <Input
            type="number"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="text-2xl h-14 font-mono flex-1"
            step="any"
          />
          <select
            value={inputUnit}
            onChange={(e) => setInputUnit(e.target.value as Unit)}
            className="h-14 px-4 rounded-lg border bg-background text-lg font-mono min-w-[100px]"
          >
            {UNIT_ORDER.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Conversions */}
      <div className="space-y-3">
        <label className="font-bold">Converted Values</label>
        <div className="grid gap-3 sm:grid-cols-2">
          {UNIT_ORDER.map((unit) => {
            const converted = UNITS[unit].fromPx(pxValue, basePx);
            const isActive = unit === inputUnit;

            return (
              <button
                key={unit}
                onClick={() => swapUnit(unit)}
                disabled={isActive}
                className={`p-4 rounded-lg border text-left transition-colors ${
                  isActive
                    ? "bg-primary/10 border-primary"
                    : "bg-card hover:border-primary/50"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold">{UNITS[unit].name}</span>
                  <span className="text-xs text-muted-foreground font-mono">
                    {unit}
                  </span>
                </div>
                <div className="text-2xl font-mono font-bold tabular-nums">
                  {formatValue(converted)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {UNITS[unit].description}
                </div>
                {!isActive && (
                  <div className="flex items-center gap-1 text-xs text-primary mt-2 opacity-0 group-hover:opacity-100">
                    <ArrowRightLeft className="size-3" />
                    Click to convert from
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Reference */}
      <div className="p-4 rounded-lg border bg-muted/30">
        <label className="font-bold block mb-3">Quick Reference</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground">1 inch =</div>
            <div className="font-mono">96px / 72pt / 25.4mm</div>
          </div>
          <div>
            <div className="text-muted-foreground">1 pica =</div>
            <div className="font-mono">12 points</div>
          </div>
          <div>
            <div className="text-muted-foreground">1 point =</div>
            <div className="font-mono">1/72 inch</div>
          </div>
          <div>
            <div className="text-muted-foreground">1 agate =</div>
            <div className="font-mono">1/14 inch (≈5.14pt)</div>
          </div>
          <div>
            <div className="text-muted-foreground">1 cicero =</div>
            <div className="font-mono">12 Didot pts (≈4.512mm)</div>
          </div>
          <div>
            <div className="text-muted-foreground">1 em/rem =</div>
            <div className="font-mono">{basePx}px (base)</div>
          </div>
        </div>
      </div>
    </div>
  );
}
