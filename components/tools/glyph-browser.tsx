"use client";

import { useState, useMemo } from "react";
import { Copy, Check, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

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
    <div className="border-2 border-border">
      {/* Search & Category row */}
      <div className="flex items-stretch border-b-2 border-border">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by character or hex code…"
            className="h-12 border-0 pl-10 text-base"
          />
        </div>
        <div className="border-l border-border">
          <Select
            value={selectedCategory}
            onValueChange={(v) => {
              setSelectedCategory(v);
              setSearch("");
              setOpenPopover(null);
            }}
          >
            <SelectTrigger className="h-12 min-w-[180px] border-0 px-4">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((cat) => (
                <SelectItem key={cat.name} value={cat.name}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Glyph Grid section */}
      <div>
        {/* Section header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <label className="font-bold">{selectedCategory}</label>
          <span className="text-sm text-muted-foreground">
            {filteredGlyphs.length} glyphs
          </span>
        </div>

        {/* Flush hairline glyph grid */}
        <div className="grid grid-cols-8 sm:grid-cols-12 md:grid-cols-16 lg:grid-cols-20 gap-px bg-border">
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
                    className={cn(
                      "aspect-square flex items-center justify-center text-xl transition-colors",
                      isOpen
                        ? "bg-primary text-primary-foreground"
                        : isCopied
                        ? "bg-primary/20 text-foreground"
                        : "bg-card hover:bg-muted text-foreground"
                    )}
                  >
                    {char}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0 border-2 border-border" side="top" align="center">
                  {/* Glyph header */}
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                    <span className="text-4xl leading-none">{char}</span>
                    <div>
                      <div
                        className="font-bold"
                        style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                      >
                        U+{code.toString(16).toUpperCase().padStart(4, "0")}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Decimal: {code}
                      </div>
                    </div>
                  </div>
                  {/* Copy format buttons as segmented 2×2 */}
                  <div className="segmented grid-cols-2 border-0">
                    <Button
                      size="sm"
                      variant={copiedFormat === "char" ? "default" : "outline"}
                      onClick={() => copyCode(code, "char")}
                      className="justify-start gap-2"
                    >
                      {copiedFormat === "char" && copiedChar === char ? (
                        <Check className="size-3" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                      Char
                    </Button>
                    <Button
                      size="sm"
                      variant={copiedFormat === "html" ? "default" : "outline"}
                      onClick={() => copyCode(code, "html")}
                      className="justify-start gap-2"
                    >
                      {copiedFormat === "html" && copiedChar === char ? (
                        <Check className="size-3" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                      HTML
                    </Button>
                    <Button
                      size="sm"
                      variant={copiedFormat === "css" ? "default" : "outline"}
                      onClick={() => copyCode(code, "css")}
                      className="justify-start gap-2"
                    >
                      {copiedFormat === "css" && copiedChar === char ? (
                        <Check className="size-3" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                      CSS
                    </Button>
                    <Button
                      size="sm"
                      variant={copiedFormat === "js" ? "default" : "outline"}
                      onClick={() => copyCode(code, "js")}
                      className="justify-start gap-2"
                    >
                      {copiedFormat === "js" && copiedChar === char ? (
                        <Check className="size-3" />
                      ) : (
                        <Copy className="size-3" />
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
          <p className="px-4 py-3 text-sm text-muted-foreground border-t border-border">
            Showing 400 of {filteredGlyphs.length} glyphs. Use search to narrow results.
          </p>
        )}
      </div>

      {/* Tip row */}
      <div className="px-4 py-3 border-t-2 border-border text-sm text-muted-foreground">
        <strong className="text-foreground">Tip:</strong> Double-click any glyph to quickly copy the character.
      </div>
    </div>
  );
}
