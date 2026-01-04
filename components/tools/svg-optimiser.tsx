"use client";

import { useState, useCallback } from "react";
import { Upload, Download, Copy, Check, Trash2 } from "lucide-react";
import { optimize } from "svgo/browser";
import { Button } from "@/components/ui/button";

export function SvgOptimiserTool() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [fileName, setFileName] = useState("");
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<{
    original: number;
    optimized: number;
    saved: number;
    percent: number;
  } | null>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type === "image/svg+xml") {
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
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setInput(content);
      optimizeSvg(content);
    };
    reader.readAsText(file);
  };

  const optimizeSvg = (svg: string) => {
    try {
      const result = optimize(svg, {
        multipass: true,
        plugins: [
          "preset-default",
          "removeDimensions",
          {
            name: "removeAttrs",
            params: {
              attrs: "(data-.*)",
            },
          },
        ],
      });

      const optimized = result.data;
      setOutput(optimized);

      const originalSize = new Blob([svg]).size;
      const optimizedSize = new Blob([optimized]).size;
      const saved = originalSize - optimizedSize;
      const percent = Math.round((saved / originalSize) * 100);

      setStats({
        original: originalSize,
        optimized: optimizedSize,
        saved,
        percent,
      });
    } catch (err) {
      console.error("SVG optimization failed:", err);
      setOutput("");
      setStats(null);
    }
  };

  const handlePaste = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const content = e.target.value;
    setInput(content);
    setFileName("");
    if (content.trim().startsWith("<svg") || content.trim().startsWith("<?xml")) {
      optimizeSvg(content);
    } else {
      setOutput("");
      setStats(null);
    }
  };

  const copyOutput = async () => {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const downloadOutput = () => {
    const blob = new Blob([output], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = fileName ? fileName.replace(".svg", "-optimized.svg") : "optimized.svg";
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  const clear = () => {
    setInput("");
    setOutput("");
    setFileName("");
    setStats(null);
  };

  return (
    <div className="space-y-6">
      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className="border-2 border-dashed rounded-xl p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
        onClick={() => document.getElementById("svg-input")?.click()}
      >
        <input
          id="svg-input"
          type="file"
          accept=".svg,image/svg+xml"
          onChange={handleFileSelect}
          className="hidden"
        />
        <Upload className="size-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-lg font-medium">Drop SVG file here</p>
        <p className="text-sm text-muted-foreground mt-1">
          or click to select, or paste SVG code below
        </p>
      </div>

      {/* Input */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="font-bold">Input SVG</label>
          {input && (
            <Button variant="ghost" size="sm" onClick={clear}>
              <Trash2 className="size-4 mr-2" /> Clear
            </Button>
          )}
        </div>
        <textarea
          value={input}
          onChange={handlePaste}
          placeholder="Paste your SVG code here..."
          className="w-full h-40 p-4 rounded-lg border bg-background font-mono text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-lg border bg-card text-center">
            <div className="text-sm text-muted-foreground">Original</div>
            <div className="text-2xl font-bold">{formatBytes(stats.original)}</div>
          </div>
          <div className="p-4 rounded-lg border bg-card text-center">
            <div className="text-sm text-muted-foreground">Optimized</div>
            <div className="text-2xl font-bold">{formatBytes(stats.optimized)}</div>
          </div>
          <div className="p-4 rounded-lg border bg-card text-center">
            <div className="text-sm text-muted-foreground">Saved</div>
            <div className="text-2xl font-bold text-primary">{formatBytes(stats.saved)}</div>
          </div>
          <div className="p-4 rounded-lg border bg-card text-center">
            <div className="text-sm text-muted-foreground">Reduction</div>
            <div className="text-2xl font-bold text-primary">{stats.percent}%</div>
          </div>
        </div>
      )}

      {/* Output */}
      {output && (
        <div className="space-y-3">
          <label className="font-bold">Optimized SVG</label>
          <textarea
            value={output}
            readOnly
            className="w-full h-40 p-4 rounded-lg border bg-muted/50 font-mono text-sm resize-y"
          />

          {/* Preview */}
          <div className="p-4 rounded-lg border bg-muted/30">
            <div className="text-sm text-muted-foreground mb-2">Preview</div>
            <div
              className="flex items-center justify-center p-4 bg-white rounded overflow-hidden [&>svg]:max-w-full [&>svg]:max-h-[200px] [&>svg]:w-auto [&>svg]:h-auto"
              dangerouslySetInnerHTML={{ __html: output }}
            />
          </div>

          {/* Actions */}
          <div className="grid gap-3 md:grid-cols-2">
            <Button size="lg" className="h-14" onClick={downloadOutput}>
              <Download className="size-5 mr-2" />
              Download Optimized SVG
            </Button>
            <Button size="lg" variant="outline" className="h-14" onClick={copyOutput}>
              {copied ? (
                <><Check className="size-5 mr-2" /> Copied!</>
              ) : (
                <><Copy className="size-5 mr-2" /> Copy SVG Code</>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
