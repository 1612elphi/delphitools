"use client";

import { useState, useMemo } from "react";
import { Copy, Check, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface GlyphCategory {
  name: string;
  ranges: [number, number][];
}

const CATEGORIES: GlyphCategory[] = [
  { name: "Latin Basic", ranges: [[0x0020, 0x007f]] },
  { name: "Latin Extended", ranges: [[0x0080, 0x00ff], [0x0100, 0x017f]] },
  { name: "Greek", ranges: [[0x0370, 0x03ff]] },
  { name: "Cyrillic", ranges: [[0x0400, 0x04ff]] },
  { name: "Punctuation", ranges: [[0x2000, 0x206f]] },
  { name: "Currency", ranges: [[0x20a0, 0x20cf]] },
  { name: "Arrows", ranges: [[0x2190, 0x21ff]] },
  { name: "Math Operators", ranges: [[0x2200, 0x22ff]] },
  { name: "Box Drawing", ranges: [[0x2500, 0x257f]] },
  { name: "Geometric Shapes", ranges: [[0x25a0, 0x25ff]] },
  { name: "Symbols", ranges: [[0x2600, 0x26ff]] },
  { name: "Dingbats", ranges: [[0x2700, 0x27bf]] },
  { name: "Emoji", ranges: [[0x1f300, 0x1f5ff], [0x1f600, 0x1f64f], [0x1f680, 0x1f6ff]] },
];

export function GlyphBrowserTool() {
  const [selectedCategory, setSelectedCategory] = useState(CATEGORIES[0].name);
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [selectedGlyph, setSelectedGlyph] = useState<number | null>(null);

  const glyphs = useMemo(() => {
    const category = CATEGORIES.find((c) => c.name === selectedCategory);
    if (!category) return [];

    const chars: number[] = [];
    for (const [start, end] of category.ranges) {
      for (let i = start; i <= end; i++) {
        chars.push(i);
      }
    }
    return chars;
  }, [selectedCategory]);

  const filteredGlyphs = useMemo(() => {
    if (!search) return glyphs;
    const lower = search.toLowerCase();
    return glyphs.filter((code) => {
      const char = String.fromCodePoint(code);
      const hex = code.toString(16).toLowerCase();
      return char === search || hex.includes(lower) || `u+${hex}`.includes(lower);
    });
  }, [glyphs, search]);

  const copyGlyph = async (code: number) => {
    const char = String.fromCodePoint(code);
    await navigator.clipboard.writeText(char);
    setCopied(char);
    setTimeout(() => setCopied(null), 1500);
  };

  const copyCode = async (code: number, format: "char" | "html" | "css" | "js") => {
    let text = "";
    switch (format) {
      case "char":
        text = String.fromCodePoint(code);
        break;
      case "html":
        text = `&#x${code.toString(16)};`;
        break;
      case "css":
        text = `\\${code.toString(16)}`;
        break;
      case "js":
        text = code <= 0xffff
          ? `\\u${code.toString(16).padStart(4, "0")}`
          : `\\u{${code.toString(16)}}`;
        break;
    }
    await navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="space-y-6">
      {/* Search & Category */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by character or hex code..."
            className="pl-10"
          />
        </div>
        <select
          value={selectedCategory}
          onChange={(e) => {
            setSelectedCategory(e.target.value);
            setSearch("");
            setSelectedGlyph(null);
          }}
          className="h-10 px-4 rounded-lg border bg-background min-w-[180px]"
        >
          {CATEGORIES.map((cat) => (
            <option key={cat.name} value={cat.name}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>

      {/* Selected Glyph Detail */}
      {selectedGlyph !== null && (
        <div className="p-6 rounded-lg border bg-card">
          <div className="flex items-start gap-6">
            <div className="text-8xl leading-none p-4 bg-muted rounded-lg">
              {String.fromCodePoint(selectedGlyph)}
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <div className="text-sm text-muted-foreground">Unicode</div>
                <div className="font-mono text-lg">
                  U+{selectedGlyph.toString(16).toUpperCase().padStart(4, "0")}
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyCode(selectedGlyph, "char")}
                >
                  {copied === String.fromCodePoint(selectedGlyph) ? (
                    <Check className="size-3 mr-1" />
                  ) : (
                    <Copy className="size-3 mr-1" />
                  )}
                  Copy Char
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyCode(selectedGlyph, "html")}
                >
                  <Copy className="size-3 mr-1" />
                  HTML
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyCode(selectedGlyph, "css")}
                >
                  <Copy className="size-3 mr-1" />
                  CSS
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyCode(selectedGlyph, "js")}
                >
                  <Copy className="size-3 mr-1" />
                  JS
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">HTML Entity</div>
                  <code className="font-mono">&#x{selectedGlyph.toString(16)};</code>
                </div>
                <div>
                  <div className="text-muted-foreground">CSS</div>
                  <code className="font-mono">\{selectedGlyph.toString(16)}</code>
                </div>
                <div>
                  <div className="text-muted-foreground">JavaScript</div>
                  <code className="font-mono">
                    {selectedGlyph <= 0xffff
                      ? `\\u${selectedGlyph.toString(16).padStart(4, "0")}`
                      : `\\u{${selectedGlyph.toString(16)}}`}
                  </code>
                </div>
                <div>
                  <div className="text-muted-foreground">Decimal</div>
                  <code className="font-mono">{selectedGlyph}</code>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Glyph Grid */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="font-bold">{selectedCategory}</label>
          <span className="text-sm text-muted-foreground">
            {filteredGlyphs.length} glyphs
          </span>
        </div>
        <div className="grid grid-cols-8 sm:grid-cols-12 md:grid-cols-16 lg:grid-cols-20 gap-1">
          {filteredGlyphs.slice(0, 400).map((code) => {
            const char = String.fromCodePoint(code);
            const isSelected = selectedGlyph === code;
            const isCopied = copied === char;

            return (
              <button
                key={code}
                onClick={() => setSelectedGlyph(code)}
                onDoubleClick={() => copyGlyph(code)}
                title={`U+${code.toString(16).toUpperCase().padStart(4, "0")}`}
                className={`aspect-square flex items-center justify-center text-xl rounded border transition-colors ${
                  isSelected
                    ? "bg-primary text-primary-foreground border-primary"
                    : isCopied
                    ? "bg-green-500/20 border-green-500"
                    : "bg-card hover:border-primary/50"
                }`}
              >
                {char}
              </button>
            );
          })}
        </div>
        {filteredGlyphs.length > 400 && (
          <p className="text-sm text-muted-foreground text-center">
            Showing 400 of {filteredGlyphs.length} glyphs. Use search to narrow results.
          </p>
        )}
      </div>

      {/* Instructions */}
      <div className="p-4 rounded-lg border bg-muted/30 text-sm text-muted-foreground">
        <strong className="text-foreground">Tips:</strong> Click a glyph to see details.
        Double-click to copy the character. Use the buttons to copy in different formats.
      </div>
    </div>
  );
}
