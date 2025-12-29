"use client";

import { useState, useCallback } from "react";
import { Upload, Trash2, Type, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface FontMetadata {
  fontFamily: string;
  fullName: string;
  postScriptName: string;
  version: string;
  copyright: string;
  license: string;
  designer: string;
  manufacturer: string;
  description: string;
  glyphCount: number;
  unitsPerEm: number;
}

export function FontExplorerTool() {
  const [fontUrl, setFontUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [metadata, setMetadata] = useState<FontMetadata | null>(null);
  const [previewText, setPreviewText] = useState("The quick brown fox jumps over the lazy dog");
  const [previewSize, setPreviewSize] = useState(48);
  const [error, setError] = useState<string | null>(null);
  const [fontLoaded, setFontLoaded] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".ttf") || file.name.endsWith(".otf") || file.name.endsWith(".woff") || file.name.endsWith(".woff2"))) {
      readFile(file);
    } else {
      setError("Please upload a font file (.ttf, .otf, .woff, .woff2)");
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      readFile(file);
    }
  };

  const readFile = async (file: File) => {
    setError(null);
    setFontLoaded(false);
    setFileName(file.name);

    const url = URL.createObjectURL(file);
    setFontUrl(url);

    // Create a unique font family name
    const fontFamilyName = `preview-${Date.now()}`;

    try {
      // Load font using FontFace API
      const fontFace = new FontFace(fontFamilyName, `url(${url})`);
      await fontFace.load();
      document.fonts.add(fontFace);
      setFontLoaded(true);

      // Try to extract metadata from the font
      // Note: Full metadata extraction requires parsing font tables
      // This is a simplified version using what the browser exposes
      setMetadata({
        fontFamily: fontFamilyName,
        fullName: file.name.replace(/\.(ttf|otf|woff2?)$/i, ""),
        postScriptName: file.name.replace(/\.(ttf|otf|woff2?)$/i, "").replace(/\s+/g, "-"),
        version: "Unknown",
        copyright: "Not available",
        license: "Not available",
        designer: "Not available",
        manufacturer: "Not available",
        description: "Font metadata requires specialized parsing",
        glyphCount: 0,
        unitsPerEm: 1000,
      });
    } catch (err) {
      setError("Failed to load font. The file may be corrupted or invalid.");
      console.error(err);
    }
  };

  const clear = () => {
    if (fontUrl) {
      URL.revokeObjectURL(fontUrl);
    }
    setFontUrl(null);
    setFileName("");
    setMetadata(null);
    setError(null);
    setFontLoaded(false);
  };

  const PREVIEW_SIZES = [12, 14, 16, 18, 24, 32, 48, 64, 72, 96];
  const SAMPLE_TEXTS = [
    "The quick brown fox jumps over the lazy dog",
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    "abcdefghijklmnopqrstuvwxyz",
    "0123456789",
    "!@#$%^&*()_+-=[]{}|;':\",./<>?",
    "Sphinx of black quartz, judge my vow",
    "Pack my box with five dozen liquor jugs",
  ];

  return (
    <div className="space-y-6">
      {/* Drop Zone */}
      {!fontUrl && (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed rounded-xl p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
          onClick={() => document.getElementById("font-input")?.click()}
        >
          <input
            id="font-input"
            type="file"
            accept=".ttf,.otf,.woff,.woff2"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Upload className="size-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-lg font-medium">Drop font file here</p>
          <p className="text-sm text-muted-foreground mt-1">
            TTF, OTF, WOFF, or WOFF2
          </p>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-lg border border-destructive/50 bg-destructive/10 text-destructive">
          {error}
        </div>
      )}

      {fontUrl && metadata && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-lg">{metadata.fullName}</h3>
              <p className="text-sm text-muted-foreground">{fileName}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={clear}>
              <Trash2 className="size-4 mr-2" /> Clear
            </Button>
          </div>

          {/* Preview */}
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <label className="font-bold">Preview</label>
              <select
                value={previewSize}
                onChange={(e) => setPreviewSize(parseInt(e.target.value))}
                className="h-8 px-3 rounded border bg-background text-sm"
              >
                {PREVIEW_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}px
                  </option>
                ))}
              </select>
            </div>
            <Input
              value={previewText}
              onChange={(e) => setPreviewText(e.target.value)}
              placeholder="Type to preview..."
              className="h-12"
            />
            <div
              className="p-6 rounded-lg border bg-card min-h-[120px] break-words"
              style={{
                fontFamily: fontLoaded ? metadata.fontFamily : "inherit",
                fontSize: previewSize,
                lineHeight: 1.4,
              }}
            >
              {previewText || "Type something to preview..."}
            </div>
          </div>

          {/* Sample Texts */}
          <div className="space-y-3">
            <label className="font-bold">Sample Texts</label>
            <div className="grid gap-3">
              {SAMPLE_TEXTS.map((text, i) => (
                <div
                  key={i}
                  className="p-4 rounded-lg border bg-card"
                  style={{
                    fontFamily: fontLoaded ? metadata.fontFamily : "inherit",
                    fontSize: i < 2 ? 24 : 18,
                  }}
                >
                  {text}
                </div>
              ))}
            </div>
          </div>

          {/* Size Waterfall */}
          <div className="space-y-3">
            <label className="font-bold">Size Waterfall</label>
            <div className="space-y-2">
              {[12, 14, 16, 18, 24, 32, 48, 64].map((size) => (
                <div
                  key={size}
                  className="flex items-baseline gap-4"
                >
                  <span className="text-xs text-muted-foreground w-10 text-right">
                    {size}px
                  </span>
                  <span
                    style={{
                      fontFamily: fontLoaded ? metadata.fontFamily : "inherit",
                      fontSize: size,
                    }}
                  >
                    Aa Bb Cc Dd Ee Ff Gg
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Font Info */}
          <div className="space-y-3">
            <label className="font-bold flex items-center gap-2">
              <Info className="size-4" /> Font Information
            </label>
            <div className="p-4 rounded-lg border bg-muted/30">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-sm text-muted-foreground">File Name</div>
                  <div className="font-mono">{fileName}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">PostScript Name</div>
                  <div className="font-mono">{metadata.postScriptName}</div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mt-4">
                Note: Full font metadata extraction requires specialized font parsing libraries.
                This tool provides basic font preview functionality.
              </p>
            </div>
          </div>

          {/* CSS Usage */}
          <div className="space-y-3">
            <label className="font-bold">CSS Usage</label>
            <pre className="p-4 rounded-lg border bg-muted/50 text-sm font-mono overflow-x-auto">
{`@font-face {
  font-family: '${metadata.fullName}';
  src: url('${fileName}') format('${fileName.endsWith('.woff2') ? 'woff2' : fileName.endsWith('.woff') ? 'woff' : fileName.endsWith('.otf') ? 'opentype' : 'truetype'}');
  font-weight: normal;
  font-style: normal;
}

.my-text {
  font-family: '${metadata.fullName}', sans-serif;
}`}
            </pre>
          </div>
        </>
      )}
    </div>
  );
}
