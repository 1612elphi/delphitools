"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Download,
  Scissors,
  RotateCcw,
  X,
  ClipboardPaste,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFilePaste } from "@/hooks/use-file-paste";
import {
  usePasteStyleImageCrop,
  PasteStyleCropOverlay,
} from "@/components/tools/paste-style-image-crop";

export function PasteImageTool() {
  const [image, setImage] = useState<string | null>(null);
  const [originalImage, setOriginalImage] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const objectUrls = useRef<Set<string>>(new Set());

  const createSafeObjectURL = useCallback((blob: Blob | MediaSource) => {
    const url = URL.createObjectURL(blob);
    objectUrls.current.add(url);
    return url;
  }, []);

  const revokeSafeObjectURL = useCallback((url: string | null) => {
    if (url && objectUrls.current.has(url)) {
      URL.revokeObjectURL(url);
      objectUrls.current.delete(url);
    }
  }, []);

  const handleCroppedBlob = useCallback(
    (blob: Blob) => {
      const url = createSafeObjectURL(blob);
      setImage((prev) => {
        if (prev && prev !== originalImage) revokeSafeObjectURL(prev);
        return url;
      });
    },
    [createSafeObjectURL, revokeSafeObjectURL, originalImage],
  );

  const {
    isCropping,
    cropArea,
    imageScale,
    startCropping,
    cancelCropping,
    applyCrop,
    handleDragStart,
  } = usePasteStyleImageCrop({
    imageRef,
    canvasRef,
    onCroppedBlob: handleCroppedBlob,
  });

  useEffect(() => {
    const objurlcurr = objectUrls.current;
    return () => {
      objurlcurr.forEach((url) => URL.revokeObjectURL(url));
      objurlcurr.clear();
    };
  }, []);

  useFilePaste((file: File) => {
    const url = createSafeObjectURL(file);

    setImage((prev) => {
      if (prev) revokeSafeObjectURL(prev);
      return url;
    });
    setOriginalImage((prev) => {
      if (prev && prev !== url) revokeSafeObjectURL(prev);
      return url;
    });

    cancelCropping();
  }, "image/*");

  const downloadImage = () => {
    if (!image) return;
    const dateStamp = new Date().toLocaleDateString("en-CA");
    const link = document.createElement("a");
    link.href = image;
    link.download = `delphitools-paste-image-${dateStamp}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const resetImage = () => {
    if (image && image !== originalImage) revokeSafeObjectURL(image);
    setImage(originalImage);
    cancelCropping();
  };

  const clearImage = () => {
    cancelCropping();
    if (image) revokeSafeObjectURL(image);
    if (originalImage && originalImage !== image)
      revokeSafeObjectURL(originalImage);

    setImage(null);
    setOriginalImage(null);
  };

  return (
    <div className="space-y-4">
      <canvas ref={canvasRef} className="hidden" />

      {!image ? (
        <div className="border-2 border-dashed rounded-xl p-12 text-center hover:border-primary/50 transition-colors flex flex-col items-center justify-center min-h-[50vh] bg-muted/10">
          <ClipboardPaste className="size-16 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">
            Press <kbd className="px-2 py-1 mx-1 bg-muted rounded-md border font-mono text-sm">Ctrl</kbd>/<kbd className="px-2 py-1 mx-1 bg-muted rounded-md border font-mono text-sm">Cmd</kbd> + <kbd className="px-2 py-1 mx-1 bg-muted rounded-md border font-mono text-sm">V</kbd> to paste
          </h2>
          <p className="text-muted-foreground">
            Copy any image to your clipboard and paste it directly here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {!isCropping ? (
              <Button onClick={startCropping} variant="secondary" size="sm">
                <Scissors className="size-4 mr-2" /> Crop
              </Button>
            ) : (
              <>
                <Button onClick={applyCrop} size="sm">
                  <Check className="size-4 mr-2" /> Apply Crop
                </Button>
                <Button
                  onClick={cancelCropping}
                  variant="outline"
                  size="sm"
                >
                  Cancel
                </Button>
              </>
            )}

            {!isCropping && (
              <>
                {image !== originalImage && (
                  <Button onClick={resetImage} variant="outline" size="sm">
                    <RotateCcw className="size-4 mr-2" /> Reset
                  </Button>
                )}
                <Button onClick={downloadImage} size="sm">
                  <Download className="size-4 mr-2" /> Download PNG
                </Button>
                <div className="flex-1" />
                <Button onClick={clearImage} variant="ghost" size="sm">
                  <X className="size-4 mr-2" /> Clear
                </Button>
              </>
            )}
          </div>

          <div className="flex justify-center bg-muted/30 rounded-xl border p-4 min-h-[50vh] overflow-hidden">
            <div
              ref={containerRef}
              className="relative inline-block touch-none select-none"
            >
              <img
                ref={imageRef}
                src={image}
                alt="Pasted content"
                className="max-w-full max-h-[70vh] rounded shadow-sm pointer-events-none"
                draggable={false}
              />

              <PasteStyleCropOverlay
                isCropping={isCropping}
                cropArea={cropArea}
                imageScale={imageScale}
                onDragStart={handleDragStart}
              />
            </div>
          </div>
        </div>
      )}

      <p className="text-center text-sm text-muted-foreground">
        Contributed by{" "}
        <a href="https://github.com/himanshubalani" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
          @himanshubalani
        </a>
      </p>
    </div>
  );
}
