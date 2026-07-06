"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
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
import { getActiveLayerId, subscribeSelection } from "@/lib/substrata/selection";
import {
  EXPORT_FORMATS,
  formatMeta,
  resolveExportDims,
  type ExportFormat,
  type ExportScale,
  type ExportScope,
} from "@/lib/substrata/export-core";
import { formatBytes } from "@/lib/format-bytes";
import { jxlAvailable } from "@/lib/substrata/export-encode";
import { estimateExportBytes, runExport } from "@/lib/substrata/export-run";

/**
 * Export modal (M6 — LIVE). Format / scale / scope / quality over the export
 * orchestrator (export-run): render → encode → verify → shrink-retry →
 * download. The Output strip previews the CLAMPED dimensions (area budget,
 * export-core) plus a debounced background size estimate off a proxy render.
 *
 * Renders its own <DialogContent>; the host (`ModalHost`) supplies the Radix
 * <Dialog> wrapper (overlay, focus trap, Esc/✕ close). Dense/flush styling per
 * DESIGN.md. Copy: format acronyms + chrome words (Export · Format · Scale ·
 * Artboard · Layer) are functional chrome; the downscale warning and failure
 * notice are ∑CG gaps.
 */

const SCALES: ExportScale[] = [1, 2, 3];

export function ExportModal() {
  const doc = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const activeLayerId = useSyncExternalStore(subscribeSelection, getActiveLayerId, () => null);
  const [format, setFormat] = useState<ExportFormat>("png");
  const [scale, setScale] = useState<ExportScale>(1);
  const [quality, setQuality] = useState(90);
  const [scope, setScope] = useState<ExportScope>("artboard");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<number | null>(null);
  // Workers need a secure context; over file:// the JXL encoder is unavailable.
  const jxlOk = jxlAvailable();

  const lossy = formatMeta(format).lossy;
  const layerScope = scope === "layer" && activeLayerId !== null;
  if (scope === "layer" && activeLayerId === null && !busy) setScope("artboard");

  const ab = doc?.artboard;
  const dims = ab ? resolveExportDims(ab.width, ab.height, scale) : null;

  // Debounced live size estimate — proxy render + encode with the live options.
  useEffect(() => {
    let stale = false;
    const t = setTimeout(() => {
      setEstimate(null);
      void estimateExportBytes({ format, scale, quality, scope }).then((bytes) => {
        if (!stale) setEstimate(bytes);
      });
    }, 250);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [format, scale, quality, scope, doc]);

  async function handleExport() {
    setBusy(true);
    setFailed(null);
    const outcome = await runExport({ format, scale, quality, scope });
    setBusy(false);
    if (outcome.ok) closeModal();
    else setFailed(outcome.reason);
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
          <div className="segmented grid-cols-4 -mx-4 border-x-0">
            {EXPORT_FORMATS.map((f) => {
              // JXL needs the worker; a layer solo needs alpha the format can carry.
              const disabled = (f.id === "jxl" && !jxlOk) || (!f.alpha && layerScope);
              return (
                <Button
                  key={f.id}
                  type="button"
                  size="sm"
                  variant={format === f.id ? "default" : "outline"}
                  disabled={disabled}
                  onClick={() => setFormat(f.id)}
                >
                  {f.label}
                </Button>
              );
            })}
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

        {/* Scope — whole artboard vs the selected layer soloed (transparent). */}
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Scope
          </Label>
          <div className="segmented grid-cols-2 -mx-4 border-x-0">
            <Button
              type="button"
              size="sm"
              variant={scope === "artboard" ? "default" : "outline"}
              onClick={() => setScope("artboard")}
            >
              Artboard
            </Button>
            <Button
              type="button"
              size="sm"
              variant={scope === "layer" ? "default" : "outline"}
              disabled={activeLayerId === null}
              onClick={() => {
                setScope("layer");
                // a solo export is transparent by contract — needs an alpha format
                if (!formatMeta(format).alpha) setFormat("png");
              }}
            >
              Layer
            </Button>
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
              min={1}
              max={100}
              step={1}
            />
          </div>
        )}

        {/* Downscale notice — the area budget reduced the requested scale. */}
        {dims?.downscaled && (
          <div className="-mx-4 border-t border-border bg-muted px-4 py-2 text-xs text-muted-foreground">
            {/* ∑CG: warning that the requested scale exceeded the safe canvas
                area budget and the export will render smaller. One short line;
                the real numbers are in the Output row below.
                sample: "Reduced to fit device limits" */}
            ∑CG
          </div>
        )}

        {/* Failure notice — encode/verify gave up (rare; SPEC §5 guard). */}
        {failed && (
          <div className="-mx-4 border-t border-border bg-muted px-4 py-2 text-xs text-destructive">
            {/* ∑CG: export-failed notice shown above the Output strip. One
                short line; the mono suffix is the internal reason code (data).
                sample: "Export failed — try a smaller scale" */}
            ∑CG <span className="font-mono">({failed})</span>
          </div>
        )}

        {/* Output dimensions + live size estimate (data) — flush status strip
            meeting the footer divider; clamped dims × scale. */}
        <div className="-mx-4 -mb-4 flex items-center justify-between gap-4 border-t border-border bg-muted px-4 py-2.5 text-xs">
          <span className="text-muted-foreground">Output</span>
          <span className="tabular-nums">
            {dims ? `${dims.outW} × ${dims.outH} px` : "—"}
            {estimate !== null && ` · ~${formatBytes(estimate)}`}
          </span>
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
            disabled={busy || !doc}
            className="col-span-2 h-12 text-sm font-bold"
          >
            Export
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  );
}
