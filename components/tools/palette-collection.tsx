"use client";

import { useState, useMemo } from "react";
import { ArrowRight, Palette, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CURATED_PALETTES,
  COLLECTION_CATEGORIES,
  getPalettesByCategory,
  type PaletteCollectionCategory,
  type CuratedPalette,
} from "@/lib/palette-collection";
import Link from "next/link";

function PaletteCard({ palette }: { palette: CuratedPalette }) {
  const colorsParam = palette.colors.join(",");

  return (
    <Link
      href={`/tools/palette-genny?colors=${encodeURIComponent(colorsParam)}`}
      className="group block border border-border overflow-hidden hover:border-primary transition-colors"
    >
      {/* Colour swatch strip */}
      <div className="flex h-16">
        {palette.colors.map((color, i) => (
          <div
            key={i}
            className="flex-1"
            style={{ backgroundColor: color }}
          />
        ))}
      </div>

      {/* Info row */}
      <div className="flex items-stretch border-t border-border">
        <div className="flex-1 px-3 py-2 min-w-0">
          <h3 className="font-bold text-sm truncate">{palette.name}</h3>
          <p className="text-xs text-muted-foreground">{palette.colors.length} colours</p>
        </div>
        <div className="flex items-center justify-center w-10 border-l border-border text-muted-foreground group-hover:bg-muted group-hover:text-foreground transition-colors">
          <ArrowRight className="size-4" />
        </div>
      </div>
    </Link>
  );
}

export function PaletteCollectionTool() {
  const [selectedCategory, setSelectedCategory] = useState<PaletteCollectionCategory | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const palettesByCategory = useMemo(() => getPalettesByCategory(), []);

  const filteredPalettes = useMemo(() => {
    let palettes = selectedCategory === "all"
      ? CURATED_PALETTES
      : palettesByCategory[selectedCategory];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      palettes = palettes.filter(p =>
        p.name.toLowerCase().includes(query) ||
        p.colors.some(c => c.toLowerCase().includes(query))
      );
    }

    return palettes;
  }, [selectedCategory, searchQuery, palettesByCategory]);

  const categories = Object.entries(COLLECTION_CATEGORIES) as [PaletteCollectionCategory, { label: string; description: string }][];

  return (
    <div className="border-2 border-border">

      {/* Search + count bar */}
      <div className="flex items-stretch border-b-2 border-border">
        <div className="flex items-center gap-2 px-4 py-3 flex-1">
          <Search className="size-4 text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="Search palettes…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent border-0 outline-none text-sm placeholder:text-muted-foreground"
          />
        </div>
        <div className="flex items-center px-4 border-l border-border text-sm text-muted-foreground whitespace-nowrap">
          {searchQuery
            ? `${filteredPalettes.length} result${filteredPalettes.length !== 1 ? "s" : ""}`
            : `${CURATED_PALETTES.length} palettes`}
        </div>
      </div>

      {/* Category filter — segmented: All (col-span-2) + 10 categories = 12 cells in grid-cols-6 */}
      <div className="border-b-2 border-border">
        <div className="segmented grid-cols-6">
          <Button
            variant={selectedCategory === "all" ? "default" : "outline"}
            onClick={() => setSelectedCategory("all")}
            className="col-span-2"
          >
            All
          </Button>
          {categories.map(([key, { label }]) => (
            <Button
              key={key}
              variant={selectedCategory === key ? "default" : "outline"}
              onClick={() => setSelectedCategory(key)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {/* Category description */}
      {selectedCategory !== "all" && (
        <div className="px-4 py-3 border-b-2 border-border bg-muted/30 text-sm text-muted-foreground">
          <span className="font-bold text-foreground">{COLLECTION_CATEGORIES[selectedCategory].label}:</span>{" "}
          {COLLECTION_CATEGORIES[selectedCategory].description}
        </div>
      )}

      {/* Palette grid */}
      <div className="p-4">
        {filteredPalettes.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-px bg-border border border-border">
            {filteredPalettes.map((palette) => (
              <div key={palette.id} className="bg-card">
                <PaletteCard palette={palette} />
              </div>
            ))}
          </div>
        ) : (
          <div className="py-12 text-center text-muted-foreground">
            <Palette className="size-12 mx-auto mb-4 opacity-50" />
            <p>No palettes found matching your search.</p>
          </div>
        )}
      </div>

      {/* Footer — link to generator */}
      <div className="flex items-stretch border-t-2 border-border">
        <div className="flex items-center px-4 py-3 flex-1 text-sm text-muted-foreground">
          Want to create your own palette?
        </div>
        <Button asChild variant="outline" className="h-auto self-stretch border-0 border-l border-border px-5 gap-2">
          <Link href="/tools/palette-genny">
            <Palette className="size-4" />
            Open Palette Generator
          </Link>
        </Button>
      </div>

    </div>
  );
}
