"use client";

import { useState, useCallback, useEffect } from "react";
import { Upload, Download, Copy, Check, Trash2 } from "lucide-react";
import { optimize } from "svgo/browser";
import { Button } from "@/components/ui/button";
import { useFilePaste } from "@/hooks/use-file-paste";

export function SvgOptimiserTool() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<{
    original: number;
    optimized: number;
    saved: number;
    percent: number;
  } | null>(null);

  // Render preview via a blob URL + <img> so user-supplied SVG can't execute
  // scripts or reach cross-origin in the main document.
  useEffect(() => {
    if (!output) {
      setPreviewUrl("");
      return;
    }
    const blob = new Blob([output], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [output]);

  useEffect(() => {
    const incoming = sessionStorage.getItem("svg-optimiser-input")
    if (incoming) {
      sessionStorage.removeItem("svg-optimiser-input")
      setInput(incoming)
      setFileName("traced.svg")
      optimizeSvg(incoming)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  useFilePaste(readFile, ".svg,image/svg+xml");

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
      <div className="border-2 border-border">

        {/* Drop Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border-b-2 border-border border-dashed p-8 text-center hover:bg-muted/30 transition-colors cursor-pointer"
          onClick={() => document.getElementById("svg-input")?.click()}
        >
          <input
            id="svg-input"
            type="file"
            accept=".svg,image/svg+xml"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Upload className="size-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-base font-bold">Drop SVG file here</p>
          <p className="text-sm text-muted-foreground mt-1">
            or click to select, or paste SVG code below
          </p>
        </div>

        {/* Input SVG */}
        <div className="border-b-2 border-border">
          <div className="flex min-h-12 items-stretch border-b border-border">
            <label className="flex flex-1 items-center px-4 font-bold">Input SVG</label>
            {input && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clear}
                className="h-auto self-stretch rounded-none border-l border-border px-4 gap-2"
              >
                <Trash2 className="size-4" />
                Clear
              </Button>
            )}
          </div>
          <textarea
            value={input}
            onChange={handlePaste}
            placeholder="Paste your SVG code here..."
            className="w-full h-40 p-4 bg-transparent border-0 text-sm resize-y focus:outline-none focus:ring-0"
            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
          />
        </div>

        {/* Stats — flush table */}
        {stats && (
          <div className="border-b-2 border-border">
            <div className="px-4 py-3 border-b border-border">
              <label className="font-bold">Results</label>
            </div>
            <div className="flex items-stretch border-b border-border last:border-b-0">
              <div className="flex-1 p-4 border-r border-border">
                <div className="text-xs text-muted-foreground mb-1">Original</div>
                <div className="text-xl font-bold" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{formatBytes(stats.original)}</div>
              </div>
              <div className="flex-1 p-4 border-r border-border">
                <div className="text-xs text-muted-foreground mb-1">Optimised</div>
                <div className="text-xl font-bold" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{formatBytes(stats.optimized)}</div>
              </div>
              <div className="flex-1 p-4 border-r border-border">
                <div className="text-xs text-muted-foreground mb-1">Saved</div>
                <div className="text-xl font-bold text-primary" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{formatBytes(stats.saved)}</div>
              </div>
              <div className="flex-1 p-4">
                <div className="text-xs text-muted-foreground mb-1">Reduction</div>
                <div className="text-xl font-bold text-primary" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{stats.percent}%</div>
              </div>
            </div>
          </div>
        )}

        {/* Output + Preview + Actions */}
        {output && (
          <>
            {/* Optimised SVG output */}
            <div className="border-b-2 border-border">
              <div className="px-4 py-3 border-b border-border">
                <label className="font-bold">Optimised SVG</label>
              </div>
              <textarea
                value={output}
                readOnly
                className="w-full h-40 p-4 bg-muted/30 border-0 text-sm resize-y focus:outline-none focus:ring-0"
                style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
              />
            </div>

            {/* Preview */}
            <div className="border-b-2 border-border">
              <div className="px-4 py-3 border-b border-border">
                <label className="font-bold">Preview</label>
              </div>
              <div className="flex items-center justify-center p-6 bg-white">
                {previewUrl && (
                  <img
                    src={previewUrl}
                    alt="Optimised SVG preview"
                    className="max-w-full max-h-[200px] w-auto h-auto"
                  />
                )}
              </div>
            </div>

            {/* Primary actions flush bar */}
            <div className="flex items-stretch min-h-14">
              <Button
                onClick={downloadOutput}
                className="flex-1 h-auto self-stretch rounded-none border-0 text-base font-bold gap-2"
              >
                <Download className="size-5" />
                Download Optimised SVG
              </Button>
              <Button
                variant="outline"
                onClick={copyOutput}
                className="flex-1 h-auto self-stretch rounded-none border-0 border-l border-border text-base font-semibold gap-2"
              >
                {copied ? (
                  <><Check className="size-5" /> Copied!</>
                ) : (
                  <><Copy className="size-5" /> Copy SVG Code</>
                )}
              </Button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
