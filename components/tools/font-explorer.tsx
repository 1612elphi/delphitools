"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Upload, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFilePaste } from "@/hooks/use-file-paste";

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

  // Refs holding the current object URL and FontFace so we can revoke/delete
  // the previous ones when a new font loads, when clearing, or on unmount.
  const fontUrlRef = useRef<string | null>(null);
  const fontFaceRef = useRef<FontFace | null>(null);

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

    // Revoke/delete the previously loaded font before replacing it.
    if (fontUrlRef.current) {
      URL.revokeObjectURL(fontUrlRef.current);
    }
    if (fontFaceRef.current) {
      document.fonts.delete(fontFaceRef.current);
      fontFaceRef.current = null;
    }

    const url = URL.createObjectURL(file);
    fontUrlRef.current = url;
    setFontUrl(url);

    // Create a unique font family name
    const fontFamilyName = `preview-${Date.now()}`;

    try {
      // Load font using FontFace API
      const fontFace = new FontFace(fontFamilyName, `url(${url})`);
      await fontFace.load();
      document.fonts.add(fontFace);
      fontFaceRef.current = fontFace;
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

  useFilePaste(readFile, ".ttf,.otf,.woff,.woff2");

  const clear = () => {
    if (fontUrlRef.current) {
      URL.revokeObjectURL(fontUrlRef.current);
      fontUrlRef.current = null;
    }
    if (fontFaceRef.current) {
      document.fonts.delete(fontFaceRef.current);
      fontFaceRef.current = null;
    }
    setFontUrl(null);
    setFileName("");
    setMetadata(null);
    setError(null);
    setFontLoaded(false);
  };

  // Clean up the current object URL and FontFace on unmount (e.g. navigating away).
  useEffect(() => {
    return () => {
      if (fontUrlRef.current) {
        URL.revokeObjectURL(fontUrlRef.current);
      }
      if (fontFaceRef.current) {
        document.fonts.delete(fontFaceRef.current);
      }
    };
  }, []);

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
    <div className="space-y-0">
      {/* Drop Zone — shown when no font loaded */}
      {!fontUrl && (
        <div className="border-2 border-border">
          {error && (
            <div className="border-b border-border p-4 text-sm text-destructive">
              {error}
            </div>
          )}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="flex min-h-48 cursor-pointer flex-col items-center justify-center gap-3 p-8 text-center transition-colors hover:bg-muted/30"
            onClick={() => document.getElementById("font-input")?.click()}
          >
            <input
              id="font-input"
              type="file"
              accept=".ttf,.otf,.woff,.woff2"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Upload className="size-10 text-muted-foreground" />
            <div>
              <p className="font-bold">Drop font file here</p>
              <p className="mt-1 text-sm text-muted-foreground">
                TTF, OTF, WOFF, or WOFF2, or paste
              </p>
            </div>
          </div>
        </div>
      )}

      {fontUrl && metadata && (
        <div className="border-2 border-border">
          {/* ── Header bar ─────────────────────────────────────────────── */}
          <div className="flex items-stretch border-b-2 border-border">
            <div className="flex flex-1 flex-col justify-center px-4 py-3">
              <span className="font-bold">{metadata.fullName}</span>
              <span
                className="text-sm text-muted-foreground"
                style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
              >
                {fileName}
              </span>
            </div>
            <Button
              variant="ghost"
              onClick={clear}
              className="h-auto self-stretch border-l border-border px-4"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>

          {/* ── Preview section ─────────────────────────────────────────── */}
          <div className="border-b-2 border-border">
            {/* Preview controls bar */}
            <div className="flex items-stretch border-b border-border">
              <span className="flex items-center px-4 font-bold">Preview</span>
              <div className="flex flex-1 items-stretch border-l border-border">
                <Input
                  value={previewText}
                  onChange={(e) => setPreviewText(e.target.value)}
                  placeholder="Type to preview…"
                  className="flex-1 border-0 bg-transparent"
                />
              </div>
              <div className="flex items-stretch border-l border-border">
                <Select value={String(previewSize)} onValueChange={(v) => setPreviewSize(parseInt(v))}>
                  <SelectTrigger className="h-auto w-24 self-stretch border-0 bg-transparent">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PREVIEW_SIZES.map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size}px
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Live preview canvas */}
            <div
              className="min-h-28 px-4 py-6 text-foreground"
              style={{
                fontFamily: fontLoaded ? metadata.fontFamily : "inherit",
                fontSize: previewSize,
                lineHeight: 1.4,
              }}
            >
              {previewText || "Type something to preview…"}
            </div>
          </div>

          {/* ── Sample texts ────────────────────────────────────────────── */}
          <div className="border-b-2 border-border">
            <div className="border-b border-border px-4 py-3">
              <label className="font-bold">Sample Texts</label>
            </div>
            {SAMPLE_TEXTS.map((text, i) => (
              <div
                key={text}
                className="border-b border-border px-4 py-3 last:border-b-0"
                style={{
                  fontFamily: fontLoaded ? metadata.fontFamily : "inherit",
                  fontSize: i < 2 ? 24 : 18,
                }}
              >
                {text}
              </div>
            ))}
          </div>

          {/* ── Size waterfall ──────────────────────────────────────────── */}
          <div className="border-b-2 border-border">
            <div className="border-b border-border px-4 py-3">
              <label className="font-bold">Size Waterfall</label>
            </div>
            {[12, 14, 16, 18, 24, 32, 48, 64].map((size) => (
              <div
                key={size}
                className="flex items-baseline border-b border-border last:border-b-0"
              >
                <span
                  className="flex w-14 shrink-0 items-center self-stretch border-r border-border px-4 text-xs text-muted-foreground"
                  style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                >
                  {size}px
                </span>
                <span
                  className="px-4 py-2"
                  style={{
                    fontFamily: fontLoaded ? metadata.fontFamily : "inherit",
                    fontSize: size,
                    lineHeight: size > 40 ? 1.2 : 1.5,
                  }}
                >
                  Aa Bb Cc Dd Ee Ff Gg
                </span>
              </div>
            ))}
          </div>

          {/* ── Font information ────────────────────────────────────────── */}
          <div className="border-b-2 border-border">
            <div className="border-b border-border px-4 py-3">
              <label className="font-bold">Font Information</label>
            </div>
            {/* Flush info table */}
            <div className="flex items-stretch border-b border-border">
              <span className="flex w-40 shrink-0 items-center px-4 py-3 text-sm text-muted-foreground">
                File Name
              </span>
              <span
                className="flex flex-1 items-center border-l border-border px-4 py-3 text-sm"
                style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
              >
                {fileName}
              </span>
            </div>
            <div className="flex items-stretch border-b border-border">
              <span className="flex w-40 shrink-0 items-center px-4 py-3 text-sm text-muted-foreground">
                PostScript Name
              </span>
              <span
                className="flex flex-1 items-center border-l border-border px-4 py-3 text-sm"
                style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
              >
                {metadata.postScriptName}
              </span>
            </div>
            <div className="px-4 py-3 text-sm text-muted-foreground">
              Note: Full font metadata extraction requires specialised font parsing libraries.
              This tool provides basic font preview functionality.
            </div>
          </div>

          {/* ── CSS Usage ───────────────────────────────────────────────── */}
          <div>
            <div className="border-b border-border px-4 py-3">
              <label className="font-bold">CSS Usage</label>
            </div>
            <pre
              className="overflow-x-auto p-4 text-sm"
              style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
            >
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
        </div>
      )}

      {/* Error shown after a failed load attempt when fontUrl is already set */}
      {fontUrl && error && (
        <div className="mt-0 border-2 border-border border-destructive/50 p-4 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}
