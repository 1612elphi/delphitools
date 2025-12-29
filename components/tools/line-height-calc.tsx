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
    <div className="space-y-8">
      {/* Font Size Input */}
      <div className="space-y-3">
        <label className="text-lg font-bold block">Font Size</label>
        <div className="flex gap-3 items-center max-w-xs">
          <Input
            type="number"
            value={fontSize}
            onChange={(e) => setFontSize(e.target.value)}
            className="text-2xl h-14 font-bold"
            min="1"
          />
          <span className="text-xl text-muted-foreground">px</span>
        </div>
      </div>

      {/* Recommendations */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="p-6 rounded-xl border-2 border-primary bg-primary/5">
          <div className="text-sm text-muted-foreground mb-1">Recommended</div>
          <div className="text-4xl font-bold">{optimalLineHeight}px</div>
          <div className="text-sm text-muted-foreground mt-2">
            1.5× ratio — optimal for body text
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => copyValue(`${optimalLineHeight}px`, "optimal")}
          >
            {copied === "optimal" ? (
              <><Check className="size-4 mr-2" /> Copied!</>
            ) : (
              <><Copy className="size-4 mr-2" /> Copy</>
            )}
          </Button>
        </div>

        <div className="p-6 rounded-xl border bg-card">
          <div className="text-sm text-muted-foreground mb-1">Golden Ratio</div>
          <div className="text-4xl font-bold">{goldenLineHeight}px</div>
          <div className="text-sm text-muted-foreground mt-2">
            φ (1.618) — harmonious proportions
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
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

      {/* All Ratios */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold">Common Ratios</h3>
        <div className="grid gap-3">
          {ratios.map((r) => {
            const lineHeight = (size * r.ratio).toFixed(1);
            const id = r.name.toLowerCase();
            return (
              <div
                key={r.name}
                className="flex items-center justify-between p-4 rounded-lg border bg-card"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="font-bold">{r.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {r.ratio}×
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">{r.use}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold">{lineHeight}px</span>
                  <Button
                    variant="ghost"
                    size="icon"
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
      <div className="space-y-4">
        <h3 className="text-lg font-bold">Preview</h3>
        <div className="grid gap-4 md:grid-cols-3">
          {[1.2, 1.5, 2].map((ratio) => (
            <div key={ratio} className="p-4 rounded-lg border bg-card">
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
