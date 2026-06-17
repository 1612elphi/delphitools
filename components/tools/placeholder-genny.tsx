"use client";

import { useState, useEffect, useRef } from "react";
import { Download, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PlaceholderGennyTool() {
  const [width, setWidth] = useState("800");
  const [height, setHeight] = useState("600");
  const [bgColor, setBgColor] = useState("#e2e2e2");
  const [textColor, setTextColor] = useState("#666666");
  const [text, setText] = useState("");
  const [format, setFormat] = useState<"png" | "svg">("png");
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  const w = parseInt(width) || 800;
  const h = parseInt(height) || 600;
  const displayText = text || `${w} × ${h}`;

  const presets = [
    { label: "HD", w: 1920, h: 1080 },
    { label: "Square", w: 1000, h: 1000 },
    { label: "Banner", w: 1200, h: 400 },
    { label: "Thumb", w: 300, h: 200 },
    { label: "Social", w: 1200, h: 630 },
    { label: "Avatar", w: 400, h: 400 },
  ];

  useEffect(() => {
    generateImage();
  }, [width, height, bgColor, textColor, text]);

  const generateImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    // Text
    const fontSize = Math.min(w, h) / 8;
    ctx.fillStyle = textColor;
    ctx.font = `bold ${fontSize}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(displayText, w / 2, h / 2);

    setDataUrl(canvas.toDataURL("image/png"));
  };

  const generateSvg = () => {
    const fontSize = Math.min(w, h) / 8;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect fill="${bgColor}" width="${w}" height="${h}"/>
  <text fill="${textColor}" font-family="monospace" font-size="${fontSize}" font-weight="bold" x="50%" y="50%" text-anchor="middle" dominant-baseline="middle">${displayText}</text>
</svg>`;
  };

  const download = () => {
    if (format === "png" && dataUrl) {
      const link = document.createElement("a");
      link.download = `placeholder-${w}x${h}.png`;
      link.href = dataUrl;
      link.click();
    } else {
      const svg = generateSvg();
      const blob = new Blob([svg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = `placeholder-${w}x${h}.svg`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  const copyDataUrl = async () => {
    if (format === "png" && dataUrl) {
      await navigator.clipboard.writeText(dataUrl);
    } else {
      const svg = generateSvg();
      const base64 = btoa(svg);
      await navigator.clipboard.writeText(`data:image/svg+xml;base64,${base64}`);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const applyPreset = (preset: { w: number; h: number }) => {
    setWidth(preset.w.toString());
    setHeight(preset.h.toString());
  };

  return (
    <div className="border-2 border-border">
      {/* Dimensions */}
      <div className="border-b-2 border-border">
        <div className="flex items-stretch">
          {/* Width */}
          <div className="flex-1 border-r border-border p-4">
            <label className="font-bold block mb-2">Width</label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                className="text-xl h-12 font-bold border-border"
                min="1"
                max="4096"
              />
              <span className="text-muted-foreground shrink-0">px</span>
            </div>
          </div>
          {/* Height */}
          <div className="flex-1 p-4">
            <label className="font-bold block mb-2">Height</label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                className="text-xl h-12 font-bold border-border"
                min="1"
                max="4096"
              />
              <span className="text-muted-foreground shrink-0">px</span>
            </div>
          </div>
        </div>

        {/* Presets — 6 items, 6 cols, bleed to panel edges */}
        <div className="segmented grid-cols-6 -mx-0 border-t border-border border-x-0 -mb-0">
          {presets.map((preset) => (
            <Button
              key={preset.label}
              variant="outline"
              onClick={() => applyPreset(preset)}
              className="flex flex-col gap-0.5 h-auto py-2"
            >
              <span className="font-bold text-sm">{preset.label}</span>
              <span className="text-muted-foreground text-xs leading-none">
                {preset.w}×{preset.h}
              </span>
            </Button>
          ))}
        </div>
      </div>

      {/* Colours table */}
      <div className="border-b-2 border-border">
        <div className="px-4 pt-4 pb-2">
          <label className="font-bold">Colours</label>
        </div>
        {/* Background row */}
        <div className="flex items-stretch border-t border-border">
          <div className="flex items-center px-4 py-3 w-28 shrink-0 text-sm text-muted-foreground border-r border-border">
            Background
          </div>
          <div className="relative w-12 shrink-0 border-r border-border">
            <div className="size-full" style={{ backgroundColor: bgColor }} aria-hidden />
            <input
              type="color"
              value={bgColor}
              onChange={(e) => setBgColor(e.target.value)}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
            />
          </div>
          <Input
            value={bgColor}
            onChange={(e) => setBgColor(e.target.value)}
            className="flex-1 border-0 bg-transparent"
            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
          />
        </div>
        {/* Text colour row */}
        <div className="flex items-stretch border-t border-border">
          <div className="flex items-center px-4 py-3 w-28 shrink-0 text-sm text-muted-foreground border-r border-border">
            Text
          </div>
          <div className="relative w-12 shrink-0 border-r border-border">
            <div className="size-full" style={{ backgroundColor: textColor }} aria-hidden />
            <input
              type="color"
              value={textColor}
              onChange={(e) => setTextColor(e.target.value)}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
            />
          </div>
          <Input
            value={textColor}
            onChange={(e) => setTextColor(e.target.value)}
            className="flex-1 border-0 bg-transparent"
            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
          />
        </div>
      </div>

      {/* Custom text */}
      <div className="border-b-2 border-border p-4">
        <label className="font-bold block mb-2">Custom Text <span className="font-normal text-muted-foreground">(optional)</span></label>
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`${w} × ${h}`}
          className="text-lg"
        />
      </div>

      {/* Preview */}
      <div className="border-b-2 border-border">
        <div className="p-4 pb-0">
          <label className="font-bold block mb-3">Preview</label>
        </div>
        <div className="bg-muted/30 overflow-auto -mx-0 border-t border-border flex items-center justify-center p-4">
          <canvas
            ref={canvasRef}
            style={{
              maxWidth: "100%",
              height: "auto",
              maxHeight: 300,
            }}
          />
        </div>
      </div>

      {/* Format selector */}
      <div className="border-b border-border">
        <div className="segmented grid-cols-2 border-x-0">
          <Button
            variant={format === "png" ? "default" : "outline"}
            onClick={() => setFormat("png")}
          >
            PNG
          </Button>
          <Button
            variant={format === "svg" ? "default" : "outline"}
            onClick={() => setFormat("svg")}
          >
            SVG
          </Button>
        </div>
      </div>

      {/* Actions bar */}
      <div className="flex items-stretch min-h-14">
        <Button
          size="lg"
          className="flex-1 h-auto self-stretch rounded-none border-0 text-lg font-bold"
          onClick={download}
        >
          <Download className="size-5 mr-2" />
          Download {format.toUpperCase()}
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="h-auto self-stretch rounded-none border-0 border-l border-border px-6"
          onClick={copyDataUrl}
        >
          {copied ? (
            <><Check className="size-5 mr-2" /> Copied!</>
          ) : (
            <><Copy className="size-5 mr-2" /> Copy URL</>
          )}
        </Button>
      </div>
    </div>
  );
}
