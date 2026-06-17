"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, Download, Trash2, Grid3X3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFilePaste } from "@/hooks/use-file-paste";

interface Tile {
  row: number;
  col: number;
  dataUrl: string;
}

export function ImageSplitterTool() {
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);

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

  useFilePaste(readFile, "image/*");

  const splitImage = () => {
    if (!sourceImage) return;

    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const tileWidth = Math.floor(img.width / cols);
      const tileHeight = Math.floor(img.height / rows);
      const newTiles: Tile[] = [];

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          canvas.width = tileWidth;
          canvas.height = tileHeight;
          ctx.clearRect(0, 0, tileWidth, tileHeight);
          ctx.drawImage(
            img,
            col * tileWidth,
            row * tileHeight,
            tileWidth,
            tileHeight,
            0,
            0,
            tileWidth,
            tileHeight
          );
          newTiles.push({
            row,
            col,
            dataUrl: canvas.toDataURL("image/png"),
          });
        }
      }

      setTiles(newTiles);
    };
    img.src = sourceImage;
  };

  const downloadTile = (tile: Tile) => {
    const link = document.createElement("a");
    link.download = `${fileName}-${tile.row + 1}-${tile.col + 1}.png`;
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

  const tileWidth = imageSize.width ? Math.floor(imageSize.width / cols) : 0;
  const tileHeight = imageSize.height ? Math.floor(imageSize.height / rows) : 0;

  return (
    <div className="space-y-6">
      <canvas ref={canvasRef} className="hidden" />

      <div className="border-2 border-border">
        {/* Drop Zone */}
        {!sourceImage && (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="p-8 text-center cursor-pointer hover:bg-muted/30 transition-colors"
            onClick={() => document.getElementById("splitter-input")?.click()}
          >
            <input
              id="splitter-input"
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Upload className="size-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Drop image here</p>
            <p className="text-sm text-muted-foreground mt-1">
              PNG, JPG, or any image format, or paste
            </p>
          </div>
        )}

        {/* Source Preview & Settings */}
        {sourceImage && (
          <>
            {/* Header bar */}
            <div className="flex min-h-14 items-stretch border-b-2 border-border">
              <span className="flex flex-1 items-center px-4 font-bold">Source Image</span>
              <Button
                variant="ghost"
                onClick={clear}
                className="h-auto gap-2 self-stretch rounded-none border-l border-border px-5"
              >
                <Trash2 className="size-4" />
                Clear
              </Button>
            </div>

            {/* Preview with grid overlay */}
            <div className="border-b-2 border-border bg-muted/30 p-4 flex justify-center">
              <div className="relative inline-block">
                <img
                  src={sourceImage}
                  alt="Source"
                  className="max-w-full max-h-80"
                />
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${cols}, 1fr)`,
                    gridTemplateRows: `repeat(${rows}, 1fr)`,
                  }}
                >
                  {Array.from({ length: rows * cols }).map((_, i) => (
                    <div
                      key={i}
                      className="border border-primary/50 border-dashed"
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Grid Settings */}
            <div className="border-b-2 border-border">
              <div className="flex border-b border-border">
                {/* Columns */}
                <div className="flex-1 border-r border-border">
                  <div className="px-4 pt-3 pb-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Columns</label>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={cols}
                    onChange={(e) => {
                      setCols(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)));
                      setTiles([]);
                    }}
                    className="h-12 border-0 border-t border-border text-lg font-bold bg-transparent"
                  />
                </div>
                {/* Rows */}
                <div className="flex-1 border-r border-border">
                  <div className="px-4 pt-3 pb-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Rows</label>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={rows}
                    onChange={(e) => {
                      setRows(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)));
                      setTiles([]);
                    }}
                    className="h-12 border-0 border-t border-border text-lg font-bold bg-transparent"
                  />
                </div>
                {/* Tile Size */}
                <div className="flex-1 border-r border-border">
                  <div className="px-4 pt-3 pb-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Tile Size</label>
                  </div>
                  <div className="h-12 flex items-center px-3 border-t border-border text-muted-foreground" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                    {tileWidth} × {tileHeight} px
                  </div>
                </div>
                {/* Total Tiles */}
                <div className="flex-1">
                  <div className="px-4 pt-3 pb-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Total</label>
                  </div>
                  <div className="h-12 flex items-center px-3 border-t border-border text-muted-foreground" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                    {rows * cols} tiles
                  </div>
                </div>
              </div>
            </div>

            {/* Split Button */}
            <Button
              size="lg"
              className="w-full h-14 text-lg font-bold rounded-none border-0"
              onClick={splitImage}
            >
              <Grid3X3 className="size-5 mr-2" />
              Split Image into {rows * cols} Tiles
            </Button>
          </>
        )}
      </div>

      {/* Generated Tiles */}
      {tiles.length > 0 && (
        <div className="border-2 border-border">
          {/* Header bar */}
          <div className="flex min-h-14 items-stretch border-b-2 border-border">
            <span className="flex flex-1 items-center px-4 font-bold">Generated Tiles</span>
            <Button
              onClick={downloadAll}
              className="h-auto gap-2 self-stretch rounded-none border-l border-border px-6 font-semibold"
            >
              <Download className="size-4" />
              Download All
            </Button>
          </div>

          {/* Tile grid — 1px gap via segmented pattern */}
          <div
            className="grid bg-border gap-px"
            style={{
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
            }}
          >
            {tiles.map((tile) => (
              <button
                key={`${tile.row}-${tile.col}`}
                onClick={() => downloadTile(tile)}
                className="bg-card hover:bg-muted transition-colors overflow-hidden group relative"
              >
                <img
                  src={tile.dataUrl}
                  alt={`Tile ${tile.row + 1}-${tile.col + 1}`}
                  className="w-full h-auto"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-white text-sm font-medium" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                    {tile.row + 1}-{tile.col + 1}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
