"use client";

import { useState, useRef } from "react";
import { Copy, Check, X, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useFilePaste } from "@/hooks/use-file-paste";

interface EncodedImage {
  id: string;
  name: string;
  base64: string;
  previewUrl: string;
  size: number;
}

export function Base64ImageEncoderTool() {
  const [encodedImages, setEncodedImages] = useState<EncodedImage[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const processFile = (file: File) => {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError(`Invalid file type: ${file.name}. Please upload an image file.`);
      return;
    }
    
    // Warn/prevent if larger than 5MB
    if (file.size > 5 * 1024 * 1024) {
      setError(`File ${file.name} is too large (${formatSize(file.size)}). Max allowed size is 5MB to prevent browser freeze.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      const newImage: EncodedImage = {
        id: crypto.randomUUID(),
        name: file.name,
        base64: result,
        previewUrl: result, // For base64, data URL is the preview
        size: file.size,
      };
      setEncodedImages((prev) => [newImage, ...prev]);
    };
    reader.onerror = () => {
      setError(`Failed to read file ${file.name}`);
    };
    reader.readAsDataURL(file);
  };

  useFilePaste((file: File) => {
    processFile(file);
  }, "image/*");

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    files.forEach(processFile);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      files.forEach(processFile);
    }
    // reset input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeImage = (id: string) => {
    setEncodedImages((prev) => prev.filter((img) => img.id !== id));
  };

  const clearAll = () => {
    setEncodedImages([]);
    setError(null);
  };

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="border-2 border-destructive bg-destructive/10 text-destructive p-4 font-bold">
          {error}
        </div>
      )}

      <div className="border-2 border-border">
        {/* Drop Zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-2 border-dashed m-4 p-8 text-center transition-colors cursor-pointer ${
            isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
          }`}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
          <Upload className="size-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-lg font-medium">Drop images here</p>
          <p className="text-sm text-muted-foreground mt-1">
            or click to select files, or paste
          </p>
        </div>
      </div>

      {encodedImages.length > 0 && (
        <div className="border-2 border-border">
          <div className="flex min-h-12 items-stretch border-b-2 border-border">
            <h3 className="flex flex-1 items-center px-4 font-bold">
              {encodedImages.length} image{encodedImages.length !== 1 ? "s" : ""} encoded
            </h3>
            <Button
              variant="ghost"
              onClick={clearAll}
              className="h-auto self-stretch rounded-none border-l border-border px-4"
            >
              Clear all
            </Button>
          </div>

          <div className="divide-y-0">
            {encodedImages.map((img) => {
              const rawBase64 = img.base64.split(",")[1];
              return (
                <div key={img.id} className="border-b-2 border-border last:border-b-0">
                  <div className="flex items-stretch border-b border-border">
                    <div className="size-16 shrink-0 bg-muted flex items-center justify-center overflow-hidden border-r border-border">
                      <img
                        src={img.previewUrl}
                        alt={img.name}
                        className="size-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-center px-4 py-2">
                      <p className="font-medium truncate">{img.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatSize(img.size)}
                      </p>
                    </div>
                    <button
                      onClick={() => removeImage(img.id)}
                      className="flex w-12 items-center justify-center border-l border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      title="Remove"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  <div className="p-4 space-y-4 bg-muted/10">
                    <Textarea
                      readOnly
                      value={img.base64}
                      className="h-32 font-mono text-xs rounded-none border-2 border-border bg-background"
                      onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                    />
                    <div className="segmented grid-cols-2 -mx-4 -mb-4 border-x-0 border-b-0">
                      <Button
                        variant={copied === `raw-${img.id}` ? "default" : "outline"}
                        onClick={() => copyToClipboard(rawBase64, `raw-${img.id}`)}
                        className="font-bold h-12"
                      >
                        {copied === `raw-${img.id}` ? (
                          <>
                            <Check className="size-4 mr-2" /> Copied Raw Data
                          </>
                        ) : (
                          <>
                            <Copy className="size-4 mr-2" /> Copy Raw Base64
                          </>
                        )}
                      </Button>
                      <Button
                        variant={copied === `uri-${img.id}` ? "default" : "outline"}
                        onClick={() => copyToClipboard(img.base64, `uri-${img.id}`)}
                        className="font-bold h-12"
                      >
                        {copied === `uri-${img.id}` ? (
                          <>
                            <Check className="size-4 mr-2" /> Copied Data URI
                          </>
                        ) : (
                          <>
                            <Copy className="size-4 mr-2" /> Copy Data URI
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
