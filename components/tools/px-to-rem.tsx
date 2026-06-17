"use client";

import { useState } from "react";
import { ArrowRightLeft, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PxToRemTool() {
  const [pxValue, setPxValue] = useState("");
  const [remValue, setRemValue] = useState("");
  const [baseSize, setBaseSize] = useState("16");
  const [copied, setCopied] = useState<"px" | "rem" | null>(null);
  const [mode, setMode] = useState<"px-to-rem" | "rem-to-px">("px-to-rem");

  const base = parseFloat(baseSize) || 16;

  const handlePxChange = (value: string) => {
    setPxValue(value);
    const num = parseFloat(value);
    if (!isNaN(num)) {
      setRemValue((num / base).toFixed(4).replace(/\.?0+$/, ""));
    } else {
      setRemValue("");
    }
  };

  const handleRemChange = (value: string) => {
    setRemValue(value);
    const num = parseFloat(value);
    if (!isNaN(num)) {
      setPxValue((num * base).toFixed(2).replace(/\.?0+$/, ""));
    } else {
      setPxValue("");
    }
  };

  const handleBaseChange = (value: string) => {
    setBaseSize(value);
    const newBase = parseFloat(value) || 16;
    if (mode === "px-to-rem" && pxValue) {
      const num = parseFloat(pxValue);
      if (!isNaN(num)) {
        setRemValue((num / newBase).toFixed(4).replace(/\.?0+$/, ""));
      }
    } else if (mode === "rem-to-px" && remValue) {
      const num = parseFloat(remValue);
      if (!isNaN(num)) {
        setPxValue((num * newBase).toFixed(2).replace(/\.?0+$/, ""));
      }
    }
  };

  const copyToClipboard = async (value: string, type: "px" | "rem") => {
    const text = type === "px" ? `${value}px` : `${value}rem`;
    await navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 1500);
  };

  const toggleMode = () => {
    setMode(mode === "px-to-rem" ? "rem-to-px" : "px-to-rem");
  };

  const REFERENCE_PX = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48];

  return (
    <div className="border-2 border-border">
      {/* Base size row */}
      <div className="flex items-stretch border-b-2 border-border">
        <span className="flex items-center px-4 text-sm font-bold text-muted-foreground shrink-0">
          Base font size
        </span>
        <div className="flex items-stretch border-l border-border flex-1">
          <Input
            type="number"
            value={baseSize}
            onChange={(e) => handleBaseChange(e.target.value)}
            className="border-0 bg-transparent font-bold text-center w-24"
            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
          />
          <span className="flex items-center pr-4 text-sm text-muted-foreground">px</span>
        </div>
      </div>

      {/* Main converter — three columns: px | swap | rem */}
      <div className="grid grid-cols-[1fr,auto,1fr] border-b-2 border-border">
        {/* PX column */}
        <div className="flex flex-col">
          <div className="px-4 py-2 border-b border-border">
            <label className="text-sm font-bold text-muted-foreground">
              {mode === "px-to-rem" ? "Pixels (input)" : "Pixels (result)"}
            </label>
          </div>
          <div className="relative flex items-stretch">
            <Input
              type="number"
              value={pxValue}
              onChange={(e) =>
                mode === "px-to-rem"
                  ? handlePxChange(e.target.value)
                  : undefined
              }
              readOnly={mode === "rem-to-px"}
              placeholder="0"
              className="border-0 bg-transparent text-3xl h-16 font-bold pr-12"
              style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-lg text-muted-foreground font-medium">
              px
            </span>
          </div>
          {pxValue && (
            <button
              type="button"
              onClick={() => copyToClipboard(pxValue, "px")}
              className="flex items-center justify-center gap-2 h-10 border-t border-border text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {copied === "px" ? (
                <><Check className="size-4" /> Copied!</>
              ) : (
                <><Copy className="size-4" /> Copy {pxValue}px</>
              )}
            </button>
          )}
        </div>

        {/* Swap button */}
        <div className="flex items-center justify-center border-l border-r border-border px-3">
          <Button
            variant="outline"
            size="icon"
            className="size-10 border border-border"
            onClick={toggleMode}
            aria-label="Swap direction"
          >
            <ArrowRightLeft className="size-5" />
          </Button>
        </div>

        {/* REM column */}
        <div className="flex flex-col">
          <div className="px-4 py-2 border-b border-border">
            <label className="text-sm font-bold text-muted-foreground">
              {mode === "rem-to-px" ? "REM (input)" : "REM (result)"}
            </label>
          </div>
          <div className="relative flex items-stretch">
            <Input
              type="number"
              value={remValue}
              onChange={(e) =>
                mode === "rem-to-px"
                  ? handleRemChange(e.target.value)
                  : undefined
              }
              readOnly={mode === "px-to-rem"}
              placeholder="0"
              className="border-0 bg-transparent text-3xl h-16 font-bold pr-16"
              style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-lg text-muted-foreground font-medium">
              rem
            </span>
          </div>
          {remValue && (
            <button
              type="button"
              onClick={() => copyToClipboard(remValue, "rem")}
              className="flex items-center justify-center gap-2 h-10 border-t border-border text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {copied === "rem" ? (
                <><Check className="size-4" /> Copied!</>
              ) : (
                <><Copy className="size-4" /> Copy {remValue}rem</>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Quick Reference table */}
      <div>
        <div className="px-4 py-2 border-b border-border">
          <label className="text-sm font-bold">Quick Reference</label>
        </div>
        {/* Table header */}
        <div className="flex items-stretch border-b border-border bg-muted/30">
          <span className="flex-1 px-4 py-2 text-xs font-bold text-muted-foreground border-r border-border">
            px
          </span>
          <span className="flex-1 px-4 py-2 text-xs font-bold text-muted-foreground">
            rem (base {base}px)
          </span>
        </div>
        {REFERENCE_PX.map((px) => (
          <button
            key={px}
            type="button"
            onClick={() => handlePxChange(px.toString())}
            className="flex w-full items-stretch border-b border-border last:border-b-0 text-left transition-colors hover:bg-muted/50"
          >
            <span
              className="flex-1 px-4 py-2 border-r border-border font-bold"
              style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
            >
              {px}px
            </span>
            <span
              className="flex-1 px-4 py-2 text-muted-foreground"
              style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
            >
              {(px / base).toFixed(4).replace(/\.?0+$/, "")}rem
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
