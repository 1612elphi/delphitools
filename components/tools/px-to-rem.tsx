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

  return (
    <div className="space-y-8">
      {/* Base Size Setting */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-muted-foreground">
          Base font size:
        </label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={baseSize}
            onChange={(e) => handleBaseChange(e.target.value)}
            className="w-20 text-center font-bold"
          />
          <span className="text-sm text-muted-foreground">px</span>
        </div>
      </div>

      {/* Main Converter */}
      <div className="grid gap-6 md:grid-cols-[1fr,auto,1fr] items-center">
        {/* PX Input */}
        <div className="space-y-3">
          <label className="text-lg font-bold block">
            {mode === "px-to-rem" ? "Pixels" : "Result"}
          </label>
          <div className="relative">
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
              className="text-3xl h-16 pr-16 font-bold"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xl text-muted-foreground font-medium">
              px
            </span>
          </div>
          {pxValue && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => copyToClipboard(pxValue, "px")}
            >
              {copied === "px" ? (
                <>
                  <Check className="size-4 mr-2" /> Copied!
                </>
              ) : (
                <>
                  <Copy className="size-4 mr-2" /> Copy {pxValue}px
                </>
              )}
            </Button>
          )}
        </div>

        {/* Toggle Button */}
        <Button
          variant="outline"
          size="icon"
          className="size-14 rounded-full shrink-0"
          onClick={toggleMode}
        >
          <ArrowRightLeft className="size-6" />
        </Button>

        {/* REM Input */}
        <div className="space-y-3">
          <label className="text-lg font-bold block">
            {mode === "rem-to-px" ? "REM" : "Result"}
          </label>
          <div className="relative">
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
              className="text-3xl h-16 pr-20 font-bold"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xl text-muted-foreground font-medium">
              rem
            </span>
          </div>
          {remValue && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => copyToClipboard(remValue, "rem")}
            >
              {copied === "rem" ? (
                <>
                  <Check className="size-4 mr-2" /> Copied!
                </>
              ) : (
                <>
                  <Copy className="size-4 mr-2" /> Copy {remValue}rem
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Quick Reference */}
      <div className="border rounded-lg p-6 bg-card">
        <h3 className="font-bold mb-4">Quick Reference</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
          {[8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48].map((px) => (
            <button
              key={px}
              onClick={() => handlePxChange(px.toString())}
              className="p-3 rounded-md border bg-background hover:bg-accent transition-colors text-center"
            >
              <div className="font-bold">{px}px</div>
              <div className="text-sm text-muted-foreground">
                {(px / base).toFixed(3).replace(/\.?0+$/, "")}rem
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
