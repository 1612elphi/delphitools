"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type FormEvent,
} from "react";
import {
  ClipboardCopy,
  Link2,
  Loader2,
  Scissors,
  Check,
  X,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  usePasteStyleImageCrop,
  PasteStyleCropOverlay,
} from "@/components/tools/paste-style-image-crop";

function resolveMediaUrl(raw: string): URL | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    return new URL(t);
  } catch {
    try {
      if (t.startsWith("//")) return new URL(`https:${t}`);
      if (t.startsWith("/")) return new URL(t, window.location.origin);
      return new URL(`https://${t}`);
    } catch {
      return null;
    }
  }
}

async function blobToPng(blob: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no ctx");
    ctx.drawImage(bmp, 0, 0);
    const out = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!out) throw new Error("toBlob failed");
    return out;
  } finally {
    bmp.close();
  }
}

async function tryDecodeAsImage(blob: Blob): Promise<void> {
  try {
    await createImageBitmap(blob);
  } catch {
    throw new Error("IMAGE_DECODE");
  }
}

export function MediaUrlToClipboardTool() {
  const [urlInput, setUrlInput] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [originalImage, setOriginalImage] = useState<string | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [copyState, setCopyState] = useState<"idle" | "ok" | "err">("idle");
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const latestBlobRef = useRef<Blob | null>(null);
  const originalBlobRef = useRef<Blob | null>(null);

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
      latestBlobRef.current = blob;
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
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
      objurlcurr.forEach((url) => URL.revokeObjectURL(url));
      objurlcurr.clear();
    };
  }, []);

  const clearLoaded = () => {
    cancelCropping();
    if (copyResetRef.current) clearTimeout(copyResetRef.current);
    setCopyState("idle");
    setLoadError(null);
    latestBlobRef.current = null;
    originalBlobRef.current = null;
    if (image) revokeSafeObjectURL(image);
    if (originalImage && originalImage !== image)
      revokeSafeObjectURL(originalImage);
    setImage(null);
    setOriginalImage(null);
  };

  const loadFromUrl = useCallback(async () => {
    setLoadError(null);
    setCopyState("idle");

    const parsed = resolveMediaUrl(urlInput);
    if (!parsed) {
      setLoadError("That address is not a valid URL.");
      return;
    }

    if (!(parsed.protocol === "http:" || parsed.protocol === "https:")) {
      setLoadError("Only http and https links are supported.");
      return;
    }

    setLoading(true);
    cancelCropping();
    try {
      const res = await fetch(parsed.href, {
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
      });

      if (!res.ok) {
        setLoadError(
          `Could not load the image (server responded with ${res.status} ${res.statusText}).`,
        );
        return;
      }

      const blob = await res.blob();

      if (!blob.size) {
        setLoadError("The response was empty.");
        return;
      }

      const type = blob.type.toLowerCase();
      const looksLikeImage =
        type.startsWith("image/") ||
        type === "application/octet-stream" ||
        type === "";

      if (!looksLikeImage) {
        setLoadError(
          "The URL did not return an image type this tool can use (check the content type).",
        );
        return;
      }

      await tryDecodeAsImage(blob);

      originalBlobRef.current = blob;

      const displayUrl = createSafeObjectURL(blob);
      latestBlobRef.current = blob;

      setImage((prev) => {
        if (prev) revokeSafeObjectURL(prev);
        return displayUrl;
      });
      setOriginalImage((prev) => {
        if (prev) revokeSafeObjectURL(prev);
        return displayUrl;
      });

      cancelCropping();
    } catch (err) {
      const msg =
        err instanceof Error && err.message === "IMAGE_DECODE"
          ? "The downloaded file cannot be decoded as an image."
          : "Could not load the image (network error, blocked by CORS, or invalid URL).";
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  }, [urlInput, createSafeObjectURL, revokeSafeObjectURL, cancelCropping]);

  const resetImage = () => {
    if (image && image !== originalImage) revokeSafeObjectURL(image);
    setImage(originalImage);
    cancelCropping();
    const ob = originalBlobRef.current;
    latestBlobRef.current = ob ?? null;
  };

  const copyImage = async () => {
    setCopyState("idle");
    if (copyResetRef.current) clearTimeout(copyResetRef.current);

    const b = latestBlobRef.current;
    if (!b) {
      setCopyState("err");
      return;
    }

    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
      setCopyState("err");
      return;
    }

    try {
      const png = await blobToPng(b);
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": png }),
      ]);
      setCopyState("ok");
      copyResetRef.current = setTimeout(() => {
        setCopyState("idle");
        copyResetRef.current = null;
      }, 2200);
    } catch {
      setCopyState("err");
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setLoadError(null);
    setCopyState("idle");
    void loadFromUrl();
  };

  return (
    <div className="space-y-4">
      <canvas ref={canvasRef} className="hidden" />

      <form onSubmit={onSubmit} className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
          <div className="flex-1 space-y-1.5">
            <label
              htmlFor="media-url"
              className="text-sm font-medium text-foreground"
            >
              Image URL
            </label>
            <div className="relative">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
              <Input
                id="media-url"
                type="url"
                placeholder="https://example.com/image.png"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="pl-9 font-mono text-sm"
                autoComplete="url"
              />
            </div>
          </div>
          <Button type="submit" disabled={loading} className="shrink-0">
            {loading ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Loading
              </>
            ) : (
              <>Load image</>
            )}
          </Button>
        </div>
      </form>

      {loadError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {loadError}
        </div>
      )}

      {image ? (
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
                <Button onClick={cancelCropping} variant="outline" size="sm">
                  Cancel
                </Button>
              </>
            )}

            {!isCropping && (
              <>
                <Button onClick={copyImage} size="sm">
                  <ClipboardCopy className="size-4 mr-2" />
                  Copy to clipboard
                </Button>
                {image !== originalImage && (
                  <Button onClick={resetImage} variant="outline" size="sm">
                    <RotateCcw className="size-4 mr-2" /> Reset
                  </Button>
                )}
                <div className="flex-1" />
                <Button onClick={clearLoaded} variant="ghost" size="sm">
                  <X className="size-4 mr-2" /> Clear
                </Button>
              </>
            )}
          </div>

          {copyState === "ok" && (
            <p className="text-sm text-muted-foreground" role="status">
              Copied to clipboard as PNG.
            </p>
          )}
          {copyState === "err" && (
            <p className="text-sm text-destructive" role="alert">
              Copy failed — try another browser, check permissions or image
              size.
            </p>
          )}

          <div className="flex justify-center bg-muted/30 rounded-xl border p-4 min-h-[50vh] overflow-hidden">
            <div
              ref={containerRef}
              className="relative inline-block touch-none select-none"
            >
              <img
                ref={imageRef}
                src={image}
                alt="Loaded from URL"
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
      ) : null}
    </div>
  );
}
