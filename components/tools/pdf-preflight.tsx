"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, X, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PdfFile {
  name: string;
  size: number;
  buffer: ArrayBuffer;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PdfPreflightTool() {
  const [file, setFile] = useState<PdfFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateAndLoadFile = useCallback((candidate: File) => {
    setError(null);

    // Validate MIME type
    if (candidate.type && candidate.type !== "application/pdf") {
      setError("Please upload a PDF file.");
      return;
    }

    // Validate extension
    if (!candidate.name.toLowerCase().endsWith(".pdf")) {
      setError("Please upload a file with a .pdf extension.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const buffer = reader.result as ArrayBuffer;

      // Validate PDF magic bytes (%PDF)
      const header = new Uint8Array(buffer.slice(0, 5));
      const magic = String.fromCharCode(...header);
      if (!magic.startsWith("%PDF")) {
        setError("The file does not appear to be a valid PDF.");
        return;
      }

      setFile({
        name: candidate.name,
        size: candidate.size,
        buffer,
      });
    };
    reader.onerror = () => {
      setError("Failed to read the file. Please try again.");
    };
    reader.readAsArrayBuffer(candidate);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragActive(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) {
        validateAndLoadFile(dropped);
      }
    },
    [validateAndLoadFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (selected) {
        validateAndLoadFile(selected);
      }
      // Reset so the same file can be re-selected
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [validateAndLoadFile]
  );

  const handleClear = useCallback(() => {
    setFile(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* Drop Zone */}
      {!file ? (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer",
            isDragActive
              ? "border-primary bg-primary/5"
              : "hover:border-primary/50"
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Upload className="size-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-lg font-medium">Drop a PDF here</p>
          <p className="text-sm text-muted-foreground mt-1">
            or click to select a file
          </p>
        </div>
      ) : (
        /* File Info */
        <div className="border rounded-xl p-6">
          <div className="flex items-center gap-4">
            <FileText className="size-10 text-muted-foreground shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{file.name}</p>
              <p className="text-sm text-muted-foreground">
                {formatSize(file.size)}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={handleClear}>
              <X className="size-4" />
              <span className="sr-only">Remove file</span>
            </Button>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
