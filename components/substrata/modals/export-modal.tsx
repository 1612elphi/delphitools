"use client";

import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { closeModal } from "@/lib/substrata/modal";
import { getSnapshot, subscribe } from "@/lib/substrata/doc-store";

/**
 * Export modal (SHELL — M5 chrome only). Lets the user pick a raster format,
 * pixel scale, and (for lossy formats) quality, and previews the resulting
 * output dimensions read off the live artboard. The actual encode/download
 * pipeline is NOT wired here — see `handleExport` (lands in M6).
 *
 * Renders its own <DialogContent>; the host (`ModalHost`) supplies the Radix
 * <Dialog> wrapper (overlay, focus trap, Esc/✕ close). Dense/flush styling per
 * DESIGN.md: title + labels breathe, the option groups + footer bleed flush to
 * the frame, hairline dividers, tabular-nums for numbers.
 *
 * Copy is functional chrome only (Export · Format · Scale · Quality · PNG …);
 * a11y description is opted out via aria-describedby={undefined} since the title
 * is self-describing.
 */

type FormatId = "png" | "jpeg" | "webp";
type Scale = 1 | 2 | 3;

// `lossy` gates the Quality slider (PNG is lossless → no quality control).
const FORMATS: { id: FormatId; label: string; lossy: boolean }[] = [
  { id: "png", label: "PNG", lossy: false },
  { id: "jpeg", label: "JPEG", lossy: true },
  { id: "webp", label: "WebP", lossy: true },
];

const SCALES: Scale[] = [1, 2, 3];

export function ExportModal() {
  const doc = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const [format, setFormat] = useState<FormatId>("png");
  const [scale, setScale] = useState<Scale>(1);
  const [quality, setQuality] = useState(90);

  const lossy = FORMATS.find((f) => f.id === format)?.lossy ?? false;

  const ab = doc?.artboard;
  const outDims = ab ? `${ab.width * scale} × ${ab.height * scale} px` : "—";

  function handleExport() {
    // STUB — no export pipeline yet. Encoding the artboard to PNG/JPEG/WebP at
    // the chosen scale/quality and triggering the download lands in M6. Until
    // then this only dismisses the modal; it does NOT produce a file.
    closeModal();
  }

  return (
    <DialogContent
      aria-describedby={undefined}
      className="gap-0 border-2 border-border p-0 sm:max-w-md"
    >
      <DialogHeader className="gap-0 border-b-2 border-border px-4 py-3 text-left">
        <DialogTitle className="text-sm font-bold uppercase tracking-wide">
          Export
        </DialogTitle>
      </DialogHeader>

      {/* Body — text/labels breathe (px-4); option groups bleed flush (§6/§7). */}
      <div className="space-y-4 px-4 py-4">
        {/* Format */}
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Format
          </Label>
          <div className="segmented grid-cols-3 -mx-4 border-x-0">
            {FORMATS.map((f) => (
              <Button
                key={f.id}
                type="button"
                size="sm"
                variant={format === f.id ? "default" : "outline"}
                onClick={() => setFormat(f.id)}
              >
                {f.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Scale */}
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Scale
          </Label>
          <div className="segmented grid-cols-3 -mx-4 border-x-0">
            {SCALES.map((s) => (
              <Button
                key={s}
                type="button"
                size="sm"
                variant={scale === s ? "default" : "outline"}
                onClick={() => setScale(s)}
                className="tabular-nums"
              >
                {s}×
              </Button>
            ))}
          </div>
        </div>

        {/* Quality — lossy formats only (PNG has none). */}
        {lossy && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Quality
              </Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {quality}
              </span>
            </div>
            <Slider
              value={[quality]}
              onValueChange={([v]) => setQuality(v)}
              min={0}
              max={100}
              step={1}
            />
          </div>
        )}

        {/* Output dimensions readout (data) — flush status strip meeting the
            footer divider; artboard dims × scale. */}
        <div className="-mx-4 -mb-4 flex items-center justify-between gap-4 border-t border-border bg-muted px-4 py-2.5 text-xs">
          <span className="text-muted-foreground">Output</span>
          <span className="tabular-nums">{outDims}</span>
        </div>
      </div>

      {/* Footer — flush action bar; primary Export dominates (2 of 3 cols),
          Cancel behind a 1px hairline. 2px major divider on top (§5/§9). */}
      <DialogFooter className="gap-0 border-t-2 border-border p-0">
        <div className="segmented grid-cols-3 w-full border-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => closeModal()}
            className="h-12 text-sm"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleExport}
            className="col-span-2 h-12 text-sm font-bold"
          >
            Export
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  );
}
