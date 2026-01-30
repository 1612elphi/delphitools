"use client";

import { useState, useMemo } from "react";
import { Copy, Check, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);
  const [copiedChar, setCopiedChar] = useState<string | null>(null);
  const [openPopover, setOpenPopover] = useState<number | null>(null);

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
    setCopiedChar(char);
    setCopiedFormat("grid");
    setTimeout(() => {
      setCopiedChar(null);
      setCopiedFormat(null);
    }, 1500);
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
    setCopiedChar(String.fromCodePoint(code));
    setCopiedFormat(format);
    setTimeout(() => {
      setCopiedChar(null);
      setCopiedFormat(null);
    }, 1500);
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
            setOpenPopover(null);
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
            const isOpen = openPopover === code;
            const isCopied = copiedFormat === "grid" && copiedChar === char;

            return (
              <Popover
                key={code}
                open={isOpen}
                onOpenChange={(open) => setOpenPopover(open ? code : null)}
              >
                <PopoverTrigger asChild>
                  <button
                    onDoubleClick={(e) => {
                      e.preventDefault();
                      copyGlyph(code);
                    }}
                    title={`U+${code.toString(16).toUpperCase().padStart(4, "0")}`}
                    className={`aspect-square flex items-center justify-center text-xl rounded border transition-colors ${
                      isOpen
                        ? "bg-primary text-primary-foreground border-primary"
                        : isCopied
                        ? "bg-green-500/20 border-green-500"
                        : "bg-card hover:border-primary/50"
                    }`}
                  >
                    {char}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0" side="top" align="center">
                  <div className="p-3 border-b flex items-center gap-3">
                    <span className="text-4xl">{char}</span>
                    <div>
                      <div className="font-mono font-medium">
                        U+{code.toString(16).toUpperCase().padStart(4, "0")}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Decimal: {code}
                      </div>
                    </div>
                  </div>
                  <div className="p-2 grid grid-cols-2 gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyCode(code, "char")}
                      className={`justify-start ${copiedFormat === "char" ? "text-green-500" : ""}`}
                    >
                      {copiedFormat === "char" ? (
                        <Check className="size-3 mr-2" />
                      ) : (
                        <Copy className="size-3 mr-2" />
                      )}
                      Char
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyCode(code, "html")}
                      className={`justify-start ${copiedFormat === "html" ? "text-green-500" : ""}`}
                    >
                      {copiedFormat === "html" ? (
                        <Check className="size-3 mr-2" />
                      ) : (
                        <Copy className="size-3 mr-2" />
                      )}
                      HTML
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyCode(code, "css")}
                      className={`justify-start ${copiedFormat === "css" ? "text-green-500" : ""}`}
                    >
                      {copiedFormat === "css" ? (
                        <Check className="size-3 mr-2" />
                      ) : (
                        <Copy className="size-3 mr-2" />
                      )}
                      CSS
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyCode(code, "js")}
                      className={`justify-start ${copiedFormat === "js" ? "text-green-500" : ""}`}
                    >
                      {copiedFormat === "js" ? (
                        <Check className="size-3 mr-2" />
                      ) : (
                        <Copy className="size-3 mr-2" />
                      )}
                      JS
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
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
        <strong className="text-foreground">Tip:</strong> Double-click any glyph to quickly copy the character.
      </div>
    </div>
  );
}
