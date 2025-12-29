"use client";

import { useState, useEffect, useRef } from "react";
import { Download, Copy, Check, RefreshCw } from "lucide-react";
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
    { label: "Thumbnail", w: 300, h: 200 },
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
    <div className="space-y-8">
      {/* Size Inputs */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-3">
          <label className="font-bold block">Width</label>
          <div className="flex gap-2 items-center">
            <Input
              type="number"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              className="text-xl h-12 font-bold"
              min="1"
              max="4096"
            />
            <span className="text-muted-foreground">px</span>
          </div>
        </div>
        <div className="space-y-3">
          <label className="font-bold block">Height</label>
          <div className="flex gap-2 items-center">
            <Input
              type="number"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              className="text-xl h-12 font-bold"
              min="1"
              max="4096"
            />
            <span className="text-muted-foreground">px</span>
          </div>
        </div>
      </div>

      {/* Presets */}
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => (
          <Button
            key={preset.label}
            variant="outline"
            size="sm"
            onClick={() => applyPreset(preset)}
          >
            {preset.label}
          </Button>
        ))}
      </div>

      {/* Colors */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-3">
          <label className="font-bold block">Background</label>
          <div className="flex gap-3">
            <input
              type="color"
              value={bgColor}
              onChange={(e) => setBgColor(e.target.value)}
              className="w-12 h-12 rounded border cursor-pointer"
            />
            <Input
              value={bgColor}
              onChange={(e) => setBgColor(e.target.value)}
              className="font-mono"
            />
          </div>
        </div>
        <div className="space-y-3">
          <label className="font-bold block">Text</label>
          <div className="flex gap-3">
            <input
              type="color"
              value={textColor}
              onChange={(e) => setTextColor(e.target.value)}
              className="w-12 h-12 rounded border cursor-pointer"
            />
            <Input
              value={textColor}
              onChange={(e) => setTextColor(e.target.value)}
              className="font-mono"
            />
          </div>
        </div>
      </div>

      {/* Custom Text */}
      <div className="space-y-3">
        <label className="font-bold block">Custom Text (optional)</label>
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`${w} × ${h}`}
          className="text-lg"
        />
      </div>

      {/* Preview */}
      <div className="space-y-3">
        <label className="font-bold block">Preview</label>
        <div className="border rounded-lg p-4 bg-muted/30 overflow-auto">
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

      {/* Format & Actions */}
      <div className="space-y-4">
        <div className="flex gap-2">
          <Button
            variant={format === "png" ? "default" : "outline"}
            onClick={() => setFormat("png")}
            className="flex-1"
          >
            PNG
          </Button>
          <Button
            variant={format === "svg" ? "default" : "outline"}
            onClick={() => setFormat("svg")}
            className="flex-1"
          >
            SVG
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Button size="lg" className="h-14" onClick={download}>
            <Download className="size-5 mr-2" />
            Download {format.toUpperCase()}
          </Button>
          <Button size="lg" variant="outline" className="h-14" onClick={copyDataUrl}>
            {copied ? (
              <><Check className="size-5 mr-2" /> Copied!</>
            ) : (
              <><Copy className="size-5 mr-2" /> Copy Data URL</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
