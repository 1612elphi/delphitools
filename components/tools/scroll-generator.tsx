"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import { Upload, Download, Trash2, GalleryHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Tile {
  index: number;
  dataUrl: string;
}

type FillMode = "color" | "blur";

interface AspectRatio {
  name: string;
  label: string;
  value: number; // width / height
}

const aspectRatios: AspectRatio[] = [
  { name: "portrait", label: "Portrait (4:5)", value: 4 / 5 },
  { name: "square", label: "Square (1:1)", value: 1 },
];

const presetColors = [
  "#ffffff",
  "#000000",
  "#f5f5f5",
  "#1a1a1a",
];

export function ScrollGeneratorTool() {
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [selectedRatio, setSelectedRatio] = useState(0);
  const [fillMode, setFillMode] = useState<FillMode>("blur");
  const [fillColor, setFillColor] = useState("#000000");
  const [tiles, setTiles] = useState<Tile[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const currentRatio = aspectRatios[selectedRatio];

  // Calculate number of slides and if fill is needed
  const tileInfo = useMemo(() => {
    if (!imageSize.width || !imageSize.height) {
      return { tileWidth: 0, tileHeight: 0, slideCount: 0, needsFill: false, exactFit: 0 };
    }

    const tileHeight = imageSize.height;
    const tileWidth = Math.round(tileHeight * currentRatio.value);

    // How many tiles fit exactly?
    const exactFit = imageSize.width / tileWidth;
    const slideCount = Math.round(exactFit);

    // Does it fit perfectly? (within 1% tolerance)
    const needsFill = Math.abs(exactFit - slideCount) > 0.01;

    return { tileWidth, tileHeight, slideCount: Math.max(1, slideCount), needsFill, exactFit };
  }, [imageSize, currentRatio]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      readFile(file);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      readFile(file);
    }
  };

  const readFile = (file: File) => {
    setFileName(file.name.replace(/\.[^.]+$/, ""));
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        setImageSize({ width: img.width, height: img.height });
        setSourceImage(dataUrl);
        setTiles([]);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const generateTiles = () => {
    if (!sourceImage) return;

    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const { tileWidth, tileHeight, slideCount, needsFill } = tileInfo;
      const totalTileWidth = tileWidth * slideCount;

      // Calculate the fill needed on edges only
      const totalFill = needsFill ? totalTileWidth - imageSize.width : 0;
      const fillPerSide = totalFill / 2; // Left edge of first, right edge of last

      // Virtual canvas layout:
      // [0, fillPerSide): left fill
      // [fillPerSide, fillPerSide + imageWidth): image
      // [fillPerSide + imageWidth, totalTileWidth): right fill
      const imageStartVirtual = fillPerSide;
      const imageEndVirtual = fillPerSide + imageSize.width;

      const newTiles: Tile[] = [];

      for (let col = 0; col < slideCount; col++) {
        canvas.width = tileWidth;
        canvas.height = tileHeight;
        ctx.clearRect(0, 0, tileWidth, tileHeight);

        // This tile covers virtual positions [tileStartVirtual, tileEndVirtual)
        const tileStartVirtual = col * tileWidth;
        const tileEndVirtual = (col + 1) * tileWidth;

        // Calculate overlap between this tile and the image region
        const overlapStart = Math.max(tileStartVirtual, imageStartVirtual);
        const overlapEnd = Math.min(tileEndVirtual, imageEndVirtual);
        const hasImageContent = overlapEnd > overlapStart;

        const isFirst = col === 0;
        const isLast = col === slideCount - 1;

        // Draw fill background on first/last tiles if needed
        if (needsFill && (isFirst || isLast)) {
          if (fillMode === "color") {
            ctx.fillStyle = fillColor;
            ctx.fillRect(0, 0, tileWidth, tileHeight);
          } else if (fillMode === "blur") {
            // Draw blurred background using the portion of image visible in this tile
            ctx.filter = "blur(30px)";
            if (hasImageContent) {
              const sourceX = overlapStart - imageStartVirtual;
              const sourceWidth = overlapEnd - overlapStart;
              const scale = Math.max(tileWidth / sourceWidth, tileHeight / img.height) * 1.2;
              const blurWidth = sourceWidth * scale;
              const blurHeight = img.height * scale;
              ctx.drawImage(
                img,
                sourceX,
                0,
                sourceWidth,
                img.height,
                (tileWidth - blurWidth) / 2,
                (tileHeight - blurHeight) / 2,
                blurWidth,
                blurHeight
              );
            }
            ctx.filter = "none";
          }
        }

        // Draw the image slice
        if (hasImageContent) {
          const drawX = overlapStart - tileStartVirtual; // Where to draw on tile canvas
          const sourceX = overlapStart - imageStartVirtual; // Where to read from source image
          const drawWidth = overlapEnd - overlapStart;

          ctx.drawImage(
            img,
            sourceX,
            0,
            drawWidth,
            img.height,
            drawX,
            0,
            drawWidth,
            tileHeight
          );
        }

        newTiles.push({
          index: col,
          dataUrl: canvas.toDataURL("image/png"),
        });
      }

      setTiles(newTiles);
    };
    img.src = sourceImage;
  };

  const downloadTile = (tile: Tile) => {
    const link = document.createElement("a");
    link.download = `${fileName}-scroll-${tile.index + 1}.png`;
    link.href = tile.dataUrl;
    link.click();
  };

  const downloadAll = () => {
    tiles.forEach((tile, i) => {
      setTimeout(() => downloadTile(tile), i * 100);
    });
  };

  const clear = () => {
    setSourceImage(null);
    setFileName("");
    setTiles([]);
    setImageSize({ width: 0, height: 0 });
  };

  return (
    <div className="space-y-6">
      <canvas ref={canvasRef} className="hidden" />

      {/* Drop Zone */}
      {!sourceImage && (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed rounded-xl p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
          onClick={() => document.getElementById("scroll-input")?.click()}
        >
          <input
            id="scroll-input"
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Upload className="size-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-lg font-medium">Drop panoramic image here</p>
          <p className="text-sm text-muted-foreground mt-1">
            Wide images work best for seamless scrolls
          </p>
        </div>
      )}

      {/* Source Preview & Settings */}
      {sourceImage && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <label className="font-bold">Source Image</label>
            <Button variant="ghost" size="sm" onClick={clear}>
              <Trash2 className="size-4 mr-2" /> Clear
            </Button>
          </div>

          {/* Preview with grid overlay */}
          <div className="relative inline-block">
            <img
              src={sourceImage}
              alt="Source"
              className="max-w-full max-h-80 rounded border"
            />
            {tileInfo.slideCount > 0 && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${tileInfo.slideCount}, 1fr)`,
                }}
              >
                {Array.from({ length: tileInfo.slideCount }).map((_, i) => (
                  <div
                    key={i}
                    className="border-x border-primary/50 border-dashed first:border-l-0 last:border-r-0 relative"
                  >
                    <span className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded">
                      {i + 1}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="text-sm text-muted-foreground">
            {imageSize.width} × {imageSize.height} px
          </div>

          {/* Aspect Ratio Selection */}
          <div className="space-y-2">
            <label className="font-bold text-sm">Tile Aspect Ratio</label>
            <div className="flex flex-wrap gap-2">
              {aspectRatios.map((ratio, i) => (
                <button
                  key={ratio.name}
                  onClick={() => {
                    setSelectedRatio(i);
                    setTiles([]);
                  }}
                  className={cn(
                    "px-4 py-2 rounded-lg border transition-colors",
                    selectedRatio === i
                      ? "bg-primary text-primary-foreground border-primary"
                      : "hover:border-primary/50"
                  )}
                >
                  {ratio.label}
                </button>
              ))}
            </div>
          </div>

          {/* Calculated Result */}
          <div className="p-4 rounded-lg border bg-muted/30">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1">
                <label className="font-bold text-sm">Slides</label>
                <div className="text-2xl font-bold">{tileInfo.slideCount}</div>
              </div>
              <div className="space-y-1">
                <label className="font-bold text-sm">Tile Size</label>
                <div className="text-muted-foreground">
                  {tileInfo.tileWidth} × {tileInfo.tileHeight} px
                </div>
              </div>
              <div className="space-y-1">
                <label className="font-bold text-sm">Fit</label>
                <div className="text-muted-foreground">
                  {tileInfo.needsFill ? (
                    <span className="text-amber-500">Needs fill</span>
                  ) : (
                    <span className="text-green-500">Perfect fit</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Fill Settings - only show if needed */}
          {tileInfo.needsFill && (
            <div className="space-y-4 p-4 rounded-lg border border-dashed">
              <div className="space-y-2">
                <label className="font-bold text-sm">Fill Style</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { mode: "blur" as const, label: "Blurred Background" },
                    { mode: "color" as const, label: "Solid Colour" },
                  ].map((option) => (
                    <button
                      key={option.mode}
                      onClick={() => {
                        setFillMode(option.mode);
                        setTiles([]);
                      }}
                      className={cn(
                        "px-4 py-2 rounded-lg border transition-colors",
                        fillMode === option.mode
                          ? "bg-primary text-primary-foreground border-primary"
                          : "hover:border-primary/50"
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {fillMode === "color" && (
                <div className="space-y-2">
                  <label className="font-bold text-sm">Fill Colour</label>
                  <div className="flex flex-wrap gap-2 items-center">
                    {presetColors.map((color) => (
                      <button
                        key={color}
                        onClick={() => {
                          setFillColor(color);
                          setTiles([]);
                        }}
                        className={cn(
                          "size-10 rounded-lg border-2 transition-all",
                          fillColor === color
                            ? "border-primary ring-2 ring-primary ring-offset-2"
                            : "border-muted hover:border-primary/50"
                        )}
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                    <div className="relative">
                      <input
                        type="color"
                        value={fillColor}
                        onChange={(e) => {
                          setFillColor(e.target.value);
                          setTiles([]);
                        }}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                      <div
                        className="size-10 rounded-lg border-2 border-dashed border-muted flex items-center justify-center text-muted-foreground hover:border-primary/50 transition-colors"
                        title="Custom colour"
                      >
                        +
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <Button size="lg" className="w-full h-14" onClick={generateTiles}>
            <GalleryHorizontal className="size-5 mr-2" />
            Generate {tileInfo.slideCount} Carousel Slides
          </Button>
        </div>
      )}

      {/* Generated Tiles */}
      {tiles.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="font-bold">Generated Slides</label>
            <Button onClick={downloadAll}>
              <Download className="size-4 mr-2" /> Download All
            </Button>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-4">
            {tiles.map((tile) => (
              <button
                key={tile.index}
                onClick={() => downloadTile(tile)}
                className="flex-shrink-0 rounded border bg-card hover:border-primary/50 transition-colors overflow-hidden group relative"
              >
                <img
                  src={tile.dataUrl}
                  alt={`Slide ${tile.index + 1}`}
                  className="h-64 w-auto"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-white text-sm font-medium">
                    Slide {tile.index + 1}
                  </span>
                </div>
              </button>
            ))}
          </div>

          <p className="text-sm text-muted-foreground text-center">
            Post these slides in order to create a seamless scrolling carousel
          </p>
        </div>
      )}
    </div>
  );
}
