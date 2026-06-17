"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import { Upload, Download, Trash2, GalleryHorizontal, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFilePaste } from "@/hooks/use-file-paste";

interface Tile {
  index: number;
  dataUrl: string;
}

type FillMode = "color" | "blur";

interface AspectRatio {
  name: string;
  label: string;
  value: number;
}

const aspectRatios: AspectRatio[] = [
  { name: "portrait", label: "4:5 Portrait", value: 4 / 5 },
  { name: "square", label: "1:1 Square", value: 1 },
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

  const tileInfo = useMemo(() => {
    if (!imageSize.width || !imageSize.height) {
      return { tileWidth: 0, tileHeight: 0, slideCount: 0, needsFill: false, exactFit: 0 };
    }

    const tileHeight = imageSize.height;
    const tileWidth = Math.round(tileHeight * currentRatio.value);

    const exactFit = imageSize.width / tileWidth;
    const slideCount = Math.round(exactFit);

    const needsFill = Math.abs(exactFit - slideCount) > 0.01;

    return { tileWidth, tileHeight, slideCount: Math.max(1, slideCount), needsFill, exactFit };
  }, [imageSize, currentRatio]);

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

  useFilePaste(readFile, "image/*");

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

      const totalFill = needsFill ? totalTileWidth - imageSize.width : 0;
      const fillPerSide = totalFill / 2;

      const imageStartVirtual = fillPerSide;
      const imageEndVirtual = fillPerSide + imageSize.width;

      const newTiles: Tile[] = [];

      for (let col = 0; col < slideCount; col++) {
        canvas.width = tileWidth;
        canvas.height = tileHeight;
        ctx.clearRect(0, 0, tileWidth, tileHeight);

        const tileStartVirtual = col * tileWidth;
        const tileEndVirtual = (col + 1) * tileWidth;

        const overlapStart = Math.max(tileStartVirtual, imageStartVirtual);
        const overlapEnd = Math.min(tileEndVirtual, imageEndVirtual);
        const hasImageContent = overlapEnd > overlapStart;

        const isFirst = col === 0;
        const isLast = col === slideCount - 1;

        if (needsFill && (isFirst || isLast)) {
          if (fillMode === "color") {
            ctx.fillStyle = fillColor;
            ctx.fillRect(0, 0, tileWidth, tileHeight);
          } else if (fillMode === "blur") {
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

        if (hasImageContent) {
          const drawX = overlapStart - tileStartVirtual;
          const sourceX = overlapStart - imageStartVirtual;
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
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadAll = async () => {
    for (const tile of tiles) {
      downloadTile(tile);
      await new Promise((r) => setTimeout(r, 300));
    }
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

      <div className="border-2 border-border">
        {/* Drop Zone */}
        {!sourceImage && (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="p-12 text-center hover:bg-muted/30 transition-colors cursor-pointer"
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
            <p className="text-lg font-bold">Drop panoramic image here</p>
            <p className="text-sm text-muted-foreground mt-1">
              or click to select, or paste
            </p>
          </div>
        )}

        {/* Main workspace */}
        {sourceImage && (
          <>
            {/* Source info bar */}
            <div className="flex min-h-12 items-stretch border-b-2 border-border">
              <div className="flex flex-1 items-center gap-3 px-4">
                <ImageIcon className="size-4 text-muted-foreground shrink-0" />
                <span className="text-sm truncate font-bold">{fileName}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {imageSize.width} × {imageSize.height}
                </span>
              </div>
              <Button
                variant="ghost"
                onClick={clear}
                className="h-auto self-stretch rounded-none border-l border-border px-4 gap-2"
              >
                <Trash2 className="size-4" />
                Clear
              </Button>
            </div>

            {/* Slice Preview */}
            <div className="border-b-2 border-border">
              <div className="px-4 pt-4 pb-2">
                <label className="font-bold block">Slice Preview</label>
              </div>
              <div className="relative overflow-hidden border-t border-border">
                <img
                  src={sourceImage}
                  alt="Source"
                  className="w-full max-h-80 object-contain bg-muted/20"
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
                        className="border-x border-white/40 border-dashed first:border-l-0 last:border-r-0 relative"
                      >
                        <span className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs px-2.5 py-0.5 font-medium shadow-sm">
                          {i + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Tile Shape */}
            <div className="border-b-2 border-border p-4">
              <label className="font-bold block mb-3">Tile Shape</label>
              <div className="segmented grid-cols-2 -mx-4 border-x-0">
                {aspectRatios.map((ratio, i) => (
                  <Button
                    key={ratio.name}
                    variant={selectedRatio === i ? "default" : "outline"}
                    onClick={() => { setSelectedRatio(i); setTiles([]); }}
                    size="lg"
                    className="font-bold"
                  >
                    {ratio.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Edge Fill */}
            <div className={cn("border-b-2 border-border p-4 transition-opacity", tileInfo.needsFill ? "opacity-100" : "opacity-40 pointer-events-none")}>
              <label className="font-bold block mb-3">
                Edge Fill
                {!tileInfo.needsFill && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(not needed)</span>}
              </label>
              <div className="segmented grid-cols-2 -mx-4 border-x-0 -mt-3 mb-3">
                <Button
                  variant={fillMode === "blur" ? "default" : "outline"}
                  onClick={() => { setFillMode("blur"); setTiles([]); }}
                  size="lg"
                  className="font-bold"
                >
                  Blurred
                </Button>
                <Button
                  variant={fillMode === "color" ? "default" : "outline"}
                  onClick={() => { setFillMode("color"); setTiles([]); }}
                  size="lg"
                  className="font-bold"
                >
                  Solid Colour
                </Button>
              </div>

              {fillMode === "color" && (
                <div className="border border-border -mx-4 border-x-0">
                  <div className="flex">
                    {presetColors.map((color) => (
                      <button
                        key={color}
                        onClick={() => { setFillColor(color); setTiles([]); }}
                        className={cn(
                          "flex-1 h-12 border-l border-border first:border-l-0 transition-all relative",
                          fillColor === color ? "ring-2 ring-inset ring-primary" : ""
                        )}
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                    <div className="relative flex-1 h-12 border-l border-border">
                      <div
                        className="size-full flex items-center justify-center text-muted-foreground text-xs font-bold"
                        style={{ backgroundColor: !presetColors.includes(fillColor) ? fillColor : "transparent" }}
                      >
                        {presetColors.includes(fillColor) ? "+" : ""}
                      </div>
                      <input
                        type="color"
                        value={fillColor}
                        onChange={(e) => { setFillColor(e.target.value); setTiles([]); }}
                        className="absolute inset-0 size-full cursor-pointer opacity-0"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-4 px-4 py-3 border-b-2 border-border bg-muted/30">
              <span className="font-bold text-2xl tabular-nums">{tileInfo.slideCount}</span>
              <span className="text-sm text-muted-foreground flex-1">
                slides at {tileInfo.tileWidth} × {tileInfo.tileHeight}
              </span>
              {tileInfo.needsFill ? (
                <span className="text-xs text-amber-500 font-medium">+ edge fill</span>
              ) : (
                <span className="text-xs text-primary font-medium">perfect fit</span>
              )}
            </div>

            {/* Generate primary action */}
            <Button
              size="lg"
              className="w-full h-14 text-lg font-bold rounded-none border-0"
              onClick={generateTiles}
            >
              <GalleryHorizontal className="size-5 mr-2" />
              Generate Slides
            </Button>
          </>
        )}
      </div>

      {/* Generated Tiles */}
      {tiles.length > 0 && (
        <div className="border-2 border-border">
          {/* Header bar */}
          <div className="flex min-h-12 items-stretch border-b-2 border-border">
            <div className="flex flex-1 items-center px-4">
              <label className="font-bold">{tiles.length} slides ready</label>
            </div>
            <Button
              variant="outline"
              onClick={downloadAll}
              className="h-auto self-stretch rounded-none border-0 border-l border-border px-5 gap-2"
            >
              <Download className="size-4" />
              Download All
            </Button>
          </div>

          {/* Tile strip */}
          <div className="flex gap-px overflow-x-auto bg-border p-0">
            {tiles.map((tile) => (
              <button
                key={tile.index}
                onClick={() => downloadTile(tile)}
                className="flex-shrink-0 group relative bg-card"
              >
                <img
                  src={tile.dataUrl}
                  alt={`Slide ${tile.index + 1}`}
                  className="h-64 w-auto block"
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-white text-sm font-bold">
                    Slide {tile.index + 1}
                  </span>
                  <Download className="size-5 text-white" />
                </div>
              </button>
            ))}
          </div>

          {/* Footer caption */}
          <div className="px-4 py-3 border-t-2 border-border bg-muted/30">
            <p className="text-sm text-muted-foreground text-center">
              Post these slides in order to create a seamless scrolling carousel
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
