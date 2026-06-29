"use client";

import { useEffect, useRef } from "react";
import { Canvas } from "fabric";
import { getSnapshot, subscribe, setDoc } from "@/lib/substrata/doc-store";
import { createEmptyDoc } from "@/lib/substrata/doc-model";
import type { Artboard } from "@/lib/substrata/doc-model";
import { createReconcileState, reconcile } from "@/lib/substrata/sync";
import { initSubstrataFilterBackend } from "@/lib/substrata/filter-backend";
import { importImageFile } from "@/lib/substrata/import-raster";
import { useFilePaste } from "@/hooks/use-file-paste";

/**
 * Fabric mount + the doc→Fabric render loop (M1). Loaded ONLY through the
 * ssr:false dynamic boundary in substrata-shell.tsx. The canvas is a render
 * target driven entirely by the document store — it subscribes and reconciles on
 * every doc change (M1-3). Raster import (drop/paste) mutates the doc, never the
 * canvas directly.
 *
 * Still skeleton-grade: viewport just fits the artboard to the container (real
 * pan/zoom is M1-4); no tool interaction yet (MOVE is M1-10).
 */

/** Fit the artboard within the viewport with a little padding, centred. */
function fitView(canvas: Canvas, artboard: Artboard): void {
  const pad = 0.92;
  const z = Math.min(canvas.getWidth() / artboard.width, canvas.getHeight() / artboard.height) * pad;
  const tx = (canvas.getWidth() - artboard.width * z) / 2;
  const ty = (canvas.getHeight() - artboard.height * z) / 2;
  canvas.setViewportTransform([z, 0, 0, z, tx, ty]);
}

export function FabricCanvas() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const elRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const el = elRef.current;
    if (!wrap || !el) return;

    const canvas = new Canvas(el, { selection: false, preserveObjectStacking: true });
    initSubstrataFilterBackend();
    const state = createReconcileState();

    if (!getSnapshot()) setDoc(createEmptyDoc());

    const render = () => {
      const doc = getSnapshot();
      if (doc) reconcile(canvas, doc, state);
    };

    const fit = () => {
      canvas.setDimensions({ width: wrap.clientWidth, height: wrap.clientHeight });
      const doc = getSnapshot();
      if (doc) fitView(canvas, doc.artboard);
      canvas.requestRenderAll();
    };

    const unsubscribe = subscribe(render);
    render();
    fit();

    const ro = new ResizeObserver(fit);
    ro.observe(wrap);

    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const files = e.dataTransfer?.files;
      if (!files) return;
      for (const f of Array.from(files)) {
        if (f.type.startsWith("image/")) void importImageFile(f);
      }
    };
    wrap.addEventListener("dragover", onDragOver);
    wrap.addEventListener("drop", onDrop);

    return () => {
      unsubscribe();
      ro.disconnect();
      wrap.removeEventListener("dragover", onDragOver);
      wrap.removeEventListener("drop", onDrop);
      void canvas.dispose();
    };
  }, []);

  useFilePaste((file) => void importImageFile(file), "image/*");

  return (
    <div ref={wrapRef} className="relative flex-1 overflow-hidden bg-muted">
      <canvas ref={elRef} />
    </div>
  );
}
