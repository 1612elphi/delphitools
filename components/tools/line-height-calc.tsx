"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LineHeightCalcTool() {
  const [fontSize, setFontSize] = useState("16");
  const [copied, setCopied] = useState<string | null>(null);

  const size = parseFloat(fontSize) || 16;

  // Common line height ratios
  const ratios = [
    { name: "Tight", ratio: 1.2, use: "Headings, large text" },
    { name: "Snug", ratio: 1.375, use: "Subheadings" },
    { name: "Normal", ratio: 1.5, use: "Body text (recommended)" },
    { name: "Relaxed", ratio: 1.625, use: "Long-form reading" },
    { name: "Loose", ratio: 2, use: "Large blocks, accessibility" },
  ];

  const copyValue = async (value: string, id: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  // Golden ratio calculation
  const goldenRatio = 1.618;
  const goldenLineHeight = (size * goldenRatio).toFixed(1);

  // Optimal reading line height (based on x-height approximation)
  const optimalLineHeight = (size * 1.5).toFixed(1);

  return (
    <div className="border-2 border-border">
      {/* Font Size Input */}
      <div className="p-4 border-b-2 border-border">
        <label className="font-bold block mb-3">Font Size</label>
        <div className="flex items-stretch border border-border">
          <Input
            type="number"
            value={fontSize}
            onChange={(e) => setFontSize(e.target.value)}
            className="h-14 text-2xl font-bold border-0 flex-1"
            min="1"
          />
          <div className="flex items-center px-4 border-l border-border text-muted-foreground text-xl">
            px
          </div>
        </div>
      </div>

      {/* Recommendations */}
      <div className="border-b-2 border-border">
        <div className="grid grid-cols-2">
          {/* Recommended */}
          <div className="p-4 border-r border-border">
            <div className="text-sm text-muted-foreground mb-1">Recommended</div>
            <div className="text-4xl font-bold mb-1">{optimalLineHeight}px</div>
            <div className="text-sm text-muted-foreground mb-3">
              1.5× ratio — optimal for body text
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyValue(`${optimalLineHeight}px`, "optimal")}
            >
              {copied === "optimal" ? (
                <><Check className="size-4 mr-2" /> Copied!</>
              ) : (
                <><Copy className="size-4 mr-2" /> Copy</>
              )}
            </Button>
          </div>

          {/* Golden Ratio */}
          <div className="p-4">
            <div className="text-sm text-muted-foreground mb-1">Golden Ratio</div>
            <div className="text-4xl font-bold mb-1">{goldenLineHeight}px</div>
            <div className="text-sm text-muted-foreground mb-3">
              φ (1.618) — harmonious proportions
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyValue(`${goldenLineHeight}px`, "golden")}
            >
              {copied === "golden" ? (
                <><Check className="size-4 mr-2" /> Copied!</>
              ) : (
                <><Copy className="size-4 mr-2" /> Copy</>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Common Ratios Table */}
      <div className="border-b-2 border-border">
        <div className="px-4 py-3 border-b border-border">
          <label className="font-bold">Common Ratios</label>
        </div>
        <div>
          {ratios.map((r) => {
            const lineHeight = (size * r.ratio).toFixed(1);
            const id = r.name.toLowerCase();
            return (
              <div
                key={r.name}
                className="flex items-stretch border-b border-border last:border-b-0"
              >
                {/* Name + Use */}
                <div className="flex-1 p-4">
                  <div className="flex items-baseline gap-3">
                    <span className="font-bold">{r.name}</span>
                    <span className="text-sm text-muted-foreground">{r.ratio}×</span>
                  </div>
                  <div className="text-sm text-muted-foreground">{r.use}</div>
                </div>
                {/* Computed value */}
                <div className="flex items-center px-4 border-l border-border">
                  <span className="text-2xl font-bold">{lineHeight}px</span>
                </div>
                {/* Copy action */}
                <div className="flex items-center border-l border-border">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-full w-12 rounded-none"
                    onClick={() => copyValue(`${lineHeight}px`, id)}
                  >
                    {copied === id ? (
                      <Check className="size-4" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Preview */}
      <div>
        <div className="px-4 py-3 border-b border-border">
          <label className="font-bold">Preview</label>
        </div>
        <div className="grid grid-cols-3">
          {[1.2, 1.5, 2].map((ratio, i) => (
            <div
              key={ratio}
              className={i > 0 ? "p-4 border-l border-border" : "p-4"}
            >
              <div className="text-sm text-muted-foreground mb-2">
                {ratio}× line-height
              </div>
              <p
                style={{
                  fontSize: `${Math.min(size, 24)}px`,
                  lineHeight: ratio,
                }}
              >
                The quick brown fox jumps over the lazy dog. Pack my box with
                five dozen liquor jugs.
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
