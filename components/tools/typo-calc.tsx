"use client";

import { useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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

const QUICK_REF = [
  { label: "1 inch =", value: "96px / 72pt / 25.4mm" },
  { label: "1 pica =", value: "12 points" },
  { label: "1 point =", value: "1/72 inch" },
  { label: "1 agate =", value: "1/14 inch (≈5.14pt)" },
  { label: "1 cicero =", value: "12 Didot pts (≈4.512mm)" },
];

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
    <div className="border-2 border-border">
      {/* Base Font Size */}
      <div className="flex items-stretch border-b-2 border-border">
        <div className="flex flex-1 flex-col justify-center p-4">
          <label className="font-bold">Base Font Size</label>
          <p className="text-sm text-muted-foreground">Used for em and rem calculations</p>
        </div>
        <div className="flex items-center gap-2 border-l border-border px-4">
          <Input
            type="number"
            value={baseFontSize}
            onChange={(e) => setBaseFontSize(e.target.value)}
            className="w-24 border-0 bg-transparent text-center"
            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
          />
          <span className="text-sm text-muted-foreground">px</span>
        </div>
      </div>

      {/* Convert From */}
      <div className="border-b-2 border-border">
        <div className="p-4 pb-0">
          <label className="font-bold">Convert From</label>
        </div>
        <div className="flex items-stretch">
          <Input
            type="number"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="h-14 flex-1 border-0 border-t border-border bg-transparent text-2xl"
            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
            step="any"
          />
          <div className="border-l border-t border-border">
            <Select value={inputUnit} onValueChange={(v) => setInputUnit(v as Unit)}>
              <SelectTrigger className="h-14 min-w-[100px] border-0 bg-transparent text-lg"
                style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNIT_ORDER.map((unit) => (
                  <SelectItem key={unit} value={unit}>
                    {unit}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Converted Values — flush table */}
      <div className="border-b-2 border-border">
        <div className="p-4 pb-0">
          <label className="font-bold">Converted Values</label>
        </div>
        <div className="mt-3 border-t border-border">
          {UNIT_ORDER.map((unit) => {
            const converted = UNITS[unit].fromPx(pxValue, basePx);
            const isActive = unit === inputUnit;

            return (
              <button
                key={unit}
                type="button"
                onClick={() => swapUnit(unit)}
                disabled={isActive}
                className={cn(
                  "flex w-full items-stretch border-b border-border last:border-b-0 text-left transition-colors",
                  isActive ? "bg-muted/40" : "hover:bg-muted/20 group"
                )}
              >
                {/* Unit badge */}
                <span className="flex w-10 shrink-0 items-center justify-center border-r border-border text-xs font-bold text-muted-foreground"
                  style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                  {unit}
                </span>
                {/* Value */}
                <span
                  className={cn(
                    "flex w-40 shrink-0 items-center px-4 text-lg tabular-nums",
                    isActive ? "text-foreground" : "text-foreground"
                  )}
                  style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                >
                  {formatValue(converted)}
                </span>
                {/* Name + description */}
                <span className="flex flex-1 flex-col justify-center border-l border-border px-4 py-2">
                  <span className="text-sm font-bold">{UNITS[unit].name}</span>
                  <span className="text-xs text-muted-foreground">{UNITS[unit].description}</span>
                </span>
                {/* Swap action */}
                <span className={cn(
                  "flex w-12 shrink-0 items-center justify-center border-l border-border text-muted-foreground transition-colors",
                  isActive ? "opacity-30" : "opacity-0 group-hover:opacity-100 group-hover:text-primary"
                )}>
                  <ArrowRightLeft className="size-4" />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Quick Reference — segmented grid */}
      <div className="p-4">
        <label className="font-bold block mb-3">Quick Reference</label>
        <div className="segmented grid-cols-2 sm:grid-cols-3 -mx-4 -mb-4 border-x-0 border-b-0">
          {[
            ...QUICK_REF,
            { label: "1 em/rem =", value: `${basePx}px (base)` },
          ].map((ref) => (
            <div key={ref.label} className="bg-card p-3">
              <div className="text-xs text-muted-foreground">{ref.label}</div>
              <div className="mt-0.5 text-sm font-bold"
                style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                {ref.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
