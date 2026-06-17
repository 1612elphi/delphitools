"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Upload, Download, Trash2, Loader2, AlertCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFilePaste } from "@/hooks/use-file-paste";

type QualityMode = "fast" | "precise";

// Set to true when briaai/RMBG-2.0 becomes publicly available
const ENABLE_PRECISE_MODE = false;

interface ProcessingState {
  status: "idle" | "downloading" | "processing" | "done" | "error";
  message?: string;
  progress?: number; // 0-100
}

export function BackgroundRemoverTool() {
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [qualityMode, setQualityMode] = useState<QualityMode>("fast");

  const [processing, setProcessing] = useState<ProcessingState>({ status: "idle" });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pipelineRef = useRef<any>(null);
  const loadedModeRef = useRef<QualityMode | null>(null);
  const mountedRef = useRef(true);

  // Dispose ML pipeline on unmount to free model memory
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (pipelineRef.current?.dispose) {
        pipelineRef.current.dispose();
        pipelineRef.current = null;
      }
    };
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      readFile(file);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      readFile(file);
    }
  };

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setSourceImage(dataUrl);
      setResultImage(null);
      setProcessing({ status: "idle" });
    };
    reader.readAsDataURL(file);
  };

  useFilePaste(readFile, "image/*");

  const removeBackground = async () => {
    if (!sourceImage) return;

    try {
      if (!pipelineRef.current || loadedModeRef.current !== qualityMode) {
        setProcessing({ status: "downloading", message: "Downloading...", progress: 0 });

        const { pipeline, env } = await import("@huggingface/transformers");

        env.allowLocalModels = false;
        // Disable Transformers.js Cache API - use browser's HTTP cache instead
        // Cache API is unreliable on iOS Safari
        env.useBrowserCache = false;

        const modelId = qualityMode === "precise" ? "briaai/RMBG-2.0" : "briaai/RMBG-1.4";

        // Track download progress
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const progressCallback = (event: any) => {
          if (event.status === "progress" && event.progress !== undefined) {
            setProcessing({
              status: "downloading",
              message: "Downloading...",
              progress: Math.round(event.progress),
            });
          }
        };

        try {
          pipelineRef.current = await pipeline("image-segmentation", modelId, {
            device: "webgpu",
            dtype: "fp32",
            progress_callback: progressCallback,
          });
        } catch {
          pipelineRef.current = await pipeline("image-segmentation", modelId, {
            device: "wasm",
            dtype: "fp32",
            progress_callback: progressCallback,
          });
        }

        // If the component unmounted while the model was downloading/building,
        // free the pipeline that was just built and bail out.
        if (!mountedRef.current) {
          pipelineRef.current?.dispose?.();
          pipelineRef.current = null;
          return;
        }

        loadedModeRef.current = qualityMode;
      }

      setProcessing({ status: "processing", message: "Removing background..." });

      const result = await pipelineRef.current(sourceImage);

      if (!mountedRef.current) return;

      if (result && result.length > 0 && result[0].mask) {
        const maskImage = result[0].mask;

        let maskDataUrl: string;
        let isBlobUrl = false;
        if (typeof maskImage.toDataURL === "function") {
          maskDataUrl = maskImage.toDataURL();
        } else if (maskImage instanceof Blob) {
          maskDataUrl = URL.createObjectURL(maskImage);
          isBlobUrl = true;
        } else if (typeof maskImage === "string") {
          maskDataUrl = maskImage;
        } else {
          const tempCanvas = document.createElement("canvas");
          tempCanvas.width = maskImage.width;
          tempCanvas.height = maskImage.height;
          const tempCtx = tempCanvas.getContext("2d")!;
          const imageData = tempCtx.createImageData(maskImage.width, maskImage.height);

          const maskData = maskImage.data;
          for (let i = 0; i < maskData.length; i++) {
            const val = maskData[i];
            imageData.data[i * 4] = val;
            imageData.data[i * 4 + 1] = val;
            imageData.data[i * 4 + 2] = val;
            imageData.data[i * 4 + 3] = 255;
          }
          tempCtx.putImageData(imageData, 0, 0);
          maskDataUrl = tempCanvas.toDataURL();
        }

        try {
          const finalImage = await applyMaskToImage(sourceImage, maskDataUrl);
          if (!mountedRef.current) return;
          setResultImage(finalImage);
          setProcessing({ status: "done" });
        } finally {
          if (isBlobUrl) {
            URL.revokeObjectURL(maskDataUrl);
          }
        }
      } else {
        throw new Error("Processing failed");
      }

    } catch (error) {
      console.error("Background removal failed:", error);
      if (!mountedRef.current) return;
      setProcessing({
        status: "error",
        message: error instanceof Error ? error.message : "Failed to process image",
      });
    }
  };

  const applyMaskToImage = async (imageUrl: string, maskUrl: string): Promise<string> => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    const [img, mask] = await Promise.all([
      loadImage(imageUrl),
      loadImage(maskUrl),
    ]);

    canvas.width = img.width;
    canvas.height = img.height;

    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = img.width;
    maskCanvas.height = img.height;
    const maskCtx = maskCanvas.getContext("2d")!;
    maskCtx.drawImage(mask, 0, 0, img.width, img.height);
    const maskData = maskCtx.getImageData(0, 0, img.width, img.height);

    for (let i = 0; i < imageData.data.length; i += 4) {
      imageData.data[i + 3] = maskData.data[i];
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL("image/png");
  };

  const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  };

  const downloadResult = () => {
    if (!resultImage) return;
    const link = document.createElement("a");
    link.download = "background-removed.png";
    link.href = resultImage;
    link.click();
  };

  const clearImage = () => {
    setSourceImage(null);
    setResultImage(null);
    setProcessing({ status: "idle" });
  };

  const isProcessing = processing.status === "downloading" || processing.status === "processing";

  return (
    <div className="space-y-6">
      <div className="border-2 border-border">
        {/* Quality Selection - only show when precise mode is available */}
        {ENABLE_PRECISE_MODE && (
          <div className="space-y-3 border-b-2 border-border p-4">
            <label className="font-bold block">Quality</label>
            <div className="segmented grid-cols-2 -mx-4 border-x-0">
              <Button
                variant={qualityMode === "fast" ? "default" : "outline"}
                onClick={() => setQualityMode("fast")}
                className="font-bold"
                size="lg"
                disabled={isProcessing}
              >
                Fast
              </Button>
              <Button
                variant={qualityMode === "precise" ? "default" : "outline"}
                onClick={() => setQualityMode("precise")}
                className="font-bold"
                size="lg"
                disabled={isProcessing}
              >
                Precise
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {qualityMode === "precise"
                ? "Better edge detection for hair, fur, and complex shapes. Slower."
                : "Good for most images with clean edges. Faster processing."}
            </p>
          </div>
        )}

        {/* Drop Zone or Image Preview */}
        {!sourceImage ? (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed m-4 p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
            onClick={() => document.getElementById("bg-drop-input")?.click()}
          >
            <input
              id="bg-drop-input"
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Upload className="size-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Drop an image here</p>
            <p className="text-sm text-muted-foreground mt-1">
              or click to select a file, or paste
            </p>
          </div>
        ) : !resultImage ? (
          /* Source image only (before processing) */
          <div>
            <div className="flex items-center justify-between p-4">
              <h3 className="font-bold">Your Image</h3>
              <Button variant="ghost" size="sm" onClick={clearImage} disabled={isProcessing}>
                <Trash2 className="size-4 mr-2" />
                Clear
              </Button>
            </div>
            <div
              className="relative overflow-hidden bg-muted cursor-pointer border-t border-border"
              onClick={() => !isProcessing && document.getElementById("bg-source-input")?.click()}
            >
              <input
                id="bg-source-input"
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
              <img
                src={sourceImage}
                alt="Source"
                className="max-w-full max-h-80 mx-auto object-contain"
              />
            </div>
          </div>
        ) : (
          /* Side by side comparison (after processing) */
          <div>
            <div className="flex min-h-14 items-stretch">
              <h3 className="flex flex-1 items-center px-4 font-bold">Result</h3>
              <Button
                variant="ghost"
                onClick={clearImage}
                className="h-auto gap-2 self-stretch rounded-none border-l border-border px-5"
              >
                <Trash2 className="size-4" />
                Clear
              </Button>
              <Button
                onClick={downloadResult}
                className="h-auto gap-2 self-stretch rounded-none border-l border-border px-6 font-semibold"
              >
                <Download className="size-4" />
                Download PNG
              </Button>
            </div>
            <div className="grid grid-cols-2 border-t border-border">
              <div className="border-r border-border">
                <p className="text-sm text-muted-foreground text-center p-2 border-b border-border">Original</p>
                <div className="relative overflow-hidden bg-muted aspect-square flex items-center justify-center">
                  <img
                    src={sourceImage}
                    alt="Original"
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground text-center p-2 border-b border-border">Background Removed</p>
                <div
                  className="relative overflow-hidden aspect-square flex items-center justify-center"
                  style={{
                    backgroundImage:
                      "linear-gradient(45deg, #e0e0e0 25%, transparent 25%), linear-gradient(-45deg, #e0e0e0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e0e0e0 75%), linear-gradient(-45deg, transparent 75%, #e0e0e0 75%)",
                    backgroundSize: "16px 16px",
                    backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
                  }}
                >
                  <img
                    src={resultImage}
                    alt="Background removed"
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Process Button */}
        {sourceImage && !resultImage && (
          <div className="border-t-2 border-border">
            <Button
              size="lg"
              className="w-full h-14 text-lg font-bold"
              onClick={removeBackground}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="size-5 mr-2 animate-spin" />
                  {processing.message}
                  {processing.status === "downloading" && processing.progress !== undefined && (
                    <span className="ml-1">{processing.progress}%</span>
                  )}
                </>
              ) : (
                "Remove Background"
              )}
            </Button>
            {processing.status === "downloading" && processing.progress !== undefined && (
              <div className="w-full h-2 bg-muted overflow-hidden border-t border-border">
                <div
                  className="h-full bg-primary transition-all duration-300 ease-out"
                  style={{ width: `${processing.progress}%` }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error State */}
      {processing.status === "error" && (
        <div className="flex items-start gap-3 p-4 border border-red-500/50 bg-red-500/10">
          <AlertCircle className="size-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-500">Error</p>
            <p className="text-sm text-muted-foreground">{processing.message}</p>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="flex items-start gap-2 p-3 border border-border bg-muted/50">
        <Info className="size-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          Processing happens entirely in your browser. On first use, a ~180MB processing engine is downloaded and cached.
        </p>
      </div>

      {/* Hidden canvas for processing */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
