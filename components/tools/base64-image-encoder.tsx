"use client";

import { useState, useRef } from "react";
import { UploadCloud, Copy, Check, X, ClipboardPaste } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useFilePaste } from "@/hooks/use-file-paste";

export function Base64ImageEncoderTool() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [base64String, setBase64String] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [copied, setCopied] = useState<"uri" | "raw" | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setFileName(file.name);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setImageSrc(result);
      setBase64String(result);
    };
    reader.readAsDataURL(file);
  };

  useFilePaste((file: File) => {
    processFile(file);
  }, "image/*");

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(base64String);
    setCopied("uri");
    setTimeout(() => setCopied(null), 2000);
  };

  const copyRawBase64 = async () => {
    const raw = base64String.split(",")[1];
    if (raw) {
      await navigator.clipboard.writeText(raw);
      setCopied("raw");
      setTimeout(() => setCopied(null), 2000);
    }
  };

  const clearImage = () => {
    setImageSrc(null);
    setBase64String("");
    setFileName("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-6">
      {!imageSrc ? (
        <div
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className="border-2 border-dashed rounded-xl p-12 text-center hover:border-primary/50 transition-colors flex flex-col items-center justify-center min-h-[50vh] bg-muted/10 cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*"
            onChange={handleFileChange}
          />
          <div className="flex justify-center gap-4 mb-4 text-muted-foreground">
            <UploadCloud className="size-12" />
            <ClipboardPaste className="size-12" />
          </div>
          <h2 className="text-xl font-semibold mb-2">
            Upload, Drop, or Paste an Image
          </h2>
          <p className="text-muted-foreground max-w-sm mx-auto">
            Click to browse, drop a file here, or press <kbd className="px-2 py-1 bg-muted rounded-md border font-mono text-xs">Ctrl/Cmd+V</kbd> to paste from clipboard.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex justify-between items-center flex-wrap gap-4">
            <h3 className="font-medium text-lg truncate flex-1">
              {fileName || "Pasted Image"}
            </h3>
            <Button variant="outline" size="sm" onClick={clearImage}>
              <X className="size-4 mr-2" /> Clear
            </Button>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Image Preview</span>
              <div className="border rounded-xl p-4 bg-muted/30 flex items-center justify-center min-h-[300px] max-h-[400px] overflow-hidden">
                <img
                  src={imageSrc}
                  alt="Preview"
                  className="max-w-full max-h-full object-contain rounded shadow-sm"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Base64 Output</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={copyRawBase64}>
                    {copied === "raw" ? <Check className="size-4 mr-2" /> : <Copy className="size-4 mr-2" />}
                    <span>Raw Data</span>
                  </Button>
                  <Button size="sm" onClick={copyToClipboard}>
                    {copied === "uri" ? <Check className="size-4 mr-2" /> : <Copy className="size-4 mr-2" />}
                    <span>Data URI</span>
                  </Button>
                </div>
              </div>
              <Textarea
                value={base64String}
                readOnly
                className="font-mono text-xs h-full min-h-[300px] resize-none"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
