"use client";

import { useState, useMemo } from "react";
import { ArrowRight, Palette, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
      className={cn(
        "group block rounded-xl border border-border/50 bg-card overflow-hidden",
        "hover:border-primary/30 hover:shadow-lg",
        "transition-all duration-200"
      )}
    >
      {/* Color swatches */}
      <div className="flex h-20">
        {palette.colors.map((color, i) => (
          <div
            key={i}
            className="flex-1 transition-all duration-200 group-hover:first:rounded-tl-lg group-hover:last:rounded-tr-lg"
            style={{ backgroundColor: color }}
          />
        ))}
      </div>

      {/* Info */}
      <div className="p-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-medium text-sm truncate">{palette.name}</h3>
          <p className="text-xs text-muted-foreground">{palette.colors.length} colors</p>
        </div>
        <ArrowRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <p className="text-muted-foreground text-sm">
            {CURATED_PALETTES.length} curated palettes. Click any palette to open it in the generator.
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search palettes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              "h-10 w-full sm:w-64 pl-10 pr-4 rounded-lg border bg-background",
              "focus:ring-2 focus:ring-primary/20 focus:border-primary",
              "transition-all"
            )}
          />
        </div>
      </div>

      {/* Category filters */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={selectedCategory === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setSelectedCategory("all")}
          className="transition-transform hover:scale-105 active:scale-95"
        >
          All
        </Button>
        {categories.map(([key, { label }]) => (
          <Button
            key={key}
            variant={selectedCategory === key ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedCategory(key)}
            className="transition-transform hover:scale-105 active:scale-95"
          >
            {label}
          </Button>
        ))}
      </div>

      {/* Category description */}
      {selectedCategory !== "all" && (
        <div className="p-4 rounded-xl border bg-muted/30 text-sm text-muted-foreground">
          <span className="font-bold text-foreground">{COLLECTION_CATEGORIES[selectedCategory].label}:</span>{" "}
          {COLLECTION_CATEGORIES[selectedCategory].description}
        </div>
      )}

      {/* Results count */}
      {searchQuery && (
        <p className="text-sm text-muted-foreground">
          Found {filteredPalettes.length} palette{filteredPalettes.length !== 1 ? "s" : ""}
        </p>
      )}

      {/* Palette grid */}
      {filteredPalettes.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredPalettes.map((palette) => (
            <PaletteCard key={palette.id} palette={palette} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Palette className="size-12 mx-auto mb-4 opacity-50" />
          <p>No palettes found matching your search.</p>
        </div>
      )}

      {/* Link to generator */}
      <div className="pt-6 border-t text-center">
        <p className="text-sm text-muted-foreground mb-3">
          Want to create your own palette?
        </p>
        <Button asChild variant="outline" className="gap-2">
          <Link href="/tools/palette-genny">
            <Palette className="size-4" />
            Open Palette Generator
          </Link>
        </Button>
      </div>
    </div>
  );
}
