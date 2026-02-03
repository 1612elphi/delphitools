"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, Download, Copy, Check, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  convertPdfToMarkdown,
  ConversionOptions,
  ConversionStats,
} from "@/lib/pdf-to-markdown";

export function PdfToMarkdownTool() {
  const [file, setFile] = useState<File | null>(null);
  const [markdown, setMarkdown] = useState<string>("");
  const [stats, setStats] = useState<ConversionStats | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Options
  const [headingSensitivity, setHeadingSensitivity] = useState<
    ConversionOptions["headingSensitivity"]
  >("medium");
  const [detectLists, setDetectLists] = useState(true);
  const [addPageBreaks, setAddPageBreaks] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    async (selectedFile: File) => {
      if (!selectedFile.type.includes("pdf")) {
        setError("Please select a PDF file");
        return;
      }

      setFile(selectedFile);
      setError(null);
      setIsConverting(true);
      setProgress({ current: 0, total: 0 });

      try {
        const arrayBuffer = await selectedFile.arrayBuffer();
        const result = await convertPdfToMarkdown(
          arrayBuffer,
          {
            headingSensitivity,
            detectLists,
            addPageBreaks,
          },
          (current, total) => {
            setProgress({ current, total });
          }
        );

        setMarkdown(result.markdown);
        setStats(result.stats);
      } catch (err) {
        console.error("PDF conversion failed:", err);
        setError(
          err instanceof Error ? err.message : "Failed to convert PDF"
        );
        setMarkdown("");
        setStats(null);
      } finally {
        setIsConverting(false);
      }
    },
    [headingSensitivity, detectLists, addPageBreaks]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) {
        handleFileSelect(droppedFile);
      }
    },
    [handleFileSelect]
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (selectedFile) {
        handleFileSelect(selectedFile);
      }
    },
    [handleFileSelect]
  );

  const reconvert = useCallback(async () => {
    if (!file) return;
    handleFileSelect(file);
  }, [file, handleFileSelect]);

  const copyToClipboard = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [markdown]);

  const downloadMarkdown = useCallback(() => {
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const baseName = file?.name.replace(/\.pdf$/i, "") || "document";
    link.download = `${baseName}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }, [markdown, file]);

  const clearFile = useCallback(() => {
    setFile(null);
    setMarkdown("");
    setStats(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* Options Panel */}
      <div className="flex flex-wrap gap-6 items-end p-4 bg-muted/50 rounded-lg">
        <div className="space-y-2">
          <Label className="font-bold">Heading Detection</Label>
          <Select
            value={headingSensitivity}
            onValueChange={(v) =>
              setHeadingSensitivity(v as ConversionOptions["headingSensitivity"])
            }
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low (larger text)</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High (subtle)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-3 h-10">
          <Switch
            id="detect-lists"
            checked={detectLists}
            onCheckedChange={setDetectLists}
          />
          <Label htmlFor="detect-lists" className="cursor-pointer">
            Detect lists
          </Label>
        </div>

        <div className="flex items-center gap-3 h-10">
          <Switch
            id="page-breaks"
            checked={addPageBreaks}
            onCheckedChange={setAddPageBreaks}
          />
          <Label htmlFor="page-breaks" className="cursor-pointer">
            Page breaks
          </Label>
        </div>

        {file && (
          <Button
            variant="outline"
            onClick={reconvert}
            disabled={isConverting}
            className="ml-auto"
          >
            Re-convert
          </Button>
        )}
      </div>

      {/* Upload Zone */}
      {!file && (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer",
            "hover:border-primary/50 hover:bg-muted/30",
            error && "border-destructive"
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={handleFileInputChange}
          />
          <Upload className="size-12 mx-auto text-muted-foreground mb-4" />
          <p className="font-medium text-lg">Drop a PDF here</p>
          <p className="text-sm text-muted-foreground mt-2">
            or click to select a file
          </p>
          {error && (
            <p className="text-sm text-destructive mt-4">{error}</p>
          )}
        </div>
      )}

      {/* Converting Progress */}
      {isConverting && (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <Loader2 className="size-10 animate-spin text-primary" />
          <p className="text-muted-foreground">
            Converting page {progress.current} of {progress.total}...
          </p>
        </div>
      )}

      {/* Results */}
      {file && !isConverting && markdown && (
        <div className="space-y-4">
          {/* File Info & Stats */}
          <div className="flex flex-wrap items-center gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-3">
              <FileText className="size-5 text-muted-foreground" />
              <span className="font-medium">{file.name}</span>
            </div>

            {stats && (
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground ml-auto">
                <span>
                  <strong className="text-foreground">{stats.pages}</strong> pages
                </span>
                <span>
                  <strong className="text-foreground">{stats.words.toLocaleString()}</strong> words
                </span>
                <span>
                  <strong className="text-foreground">{stats.headings}</strong> headings
                </span>
                <span>
                  <strong className="text-foreground">{stats.lists}</strong> list items
                </span>
              </div>
            )}

            <Button variant="ghost" size="sm" onClick={clearFile}>
              Clear
            </Button>
          </div>

          {/* Tabs: Preview / Raw */}
          <Tabs defaultValue="preview" className="w-full">
            <div className="flex items-center justify-between mb-4">
              <TabsList>
                <TabsTrigger value="preview">Preview</TabsTrigger>
                <TabsTrigger value="raw">Raw Markdown</TabsTrigger>
              </TabsList>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyToClipboard}
                  disabled={!markdown}
                >
                  {copied ? (
                    <>
                      <Check className="size-4 mr-2" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="size-4 mr-2" />
                      Copy
                    </>
                  )}
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={downloadMarkdown}
                  disabled={!markdown}
                >
                  <Download className="size-4 mr-2" />
                  Download .md
                </Button>
              </div>
            </div>

            <TabsContent value="preview" className="mt-0">
              <div className="border rounded-lg p-6 bg-card max-h-[600px] overflow-auto">
                <article className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {markdown}
                  </ReactMarkdown>
                </article>
              </div>
            </TabsContent>

            <TabsContent value="raw" className="mt-0">
              <textarea
                value={markdown}
                readOnly
                className={cn(
                  "w-full h-[600px] p-4 font-mono text-sm",
                  "border rounded-lg bg-card resize-none",
                  "focus:outline-none focus:ring-2 focus:ring-ring"
                )}
              />
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* Empty state after clearing or error */}
      {file && !isConverting && !markdown && error && (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <p className="text-destructive">{error}</p>
          <Button variant="outline" onClick={clearFile}>
            Try another file
          </Button>
        </div>
      )}
    </div>
  );
}
