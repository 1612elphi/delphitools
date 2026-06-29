"use client";

import { useEffect, useRef } from "react";
import { Canvas, Rect } from "fabric";

/**
 * Skeleton Fabric mount. Loaded ONLY through the ssr:false dynamic boundary in
 * substrata-shell.tsx — never import this statically anywhere, or Fabric leaks
 * into the static-export prerender.
 *
 * Responsibilities here are deliberately minimal: create a fabric.Canvas, keep
 * it sized to its container, draw a single placeholder artboard rect, and
 * dispose cleanly on unmount. Everything real — the doc-model→Fabric reconciler
 * (M1-3), the actual artboard + viewport pan/zoom (M1-4), raster import (M1-5),
 * tools/selection (M1-10) — is later, human-reviewed work and is NOT built here.
 */
export function FabricCanvas() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const elRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<Canvas | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const el = elRef.current;
    if (!wrap || !el) return;

    const canvas = new Canvas(el, {
      preserveObjectStacking: true,
      // No tools yet — the skeleton canvas is non-interactive.
      selection: false,
    });
    canvasRef.current = canvas;

    // Placeholder artboard so /editor renders something tangible. M1-4 replaces
    // this with a real artboard sized from the document model.
    const artboard = new Rect({
      width: 800,
      height: 600,
      fill: "#ffffff",
      stroke: "rgba(0,0,0,0.14)",
      strokeWidth: 1,
      originX: "center",
      originY: "center",
      selectable: false,
      evented: false,
    });
    canvas.add(artboard);

    const fit = () => {
      canvas.setDimensions({ width: wrap.clientWidth, height: wrap.clientHeight });
      artboard.set({ left: canvas.getWidth() / 2, top: canvas.getHeight() / 2 });
      artboard.setCoords();
      canvas.requestRenderAll();
    };
    fit();

    const ro = new ResizeObserver(fit);
    ro.observe(wrap);

    return () => {
      ro.disconnect();
      canvasRef.current = null;
      // dispose() is async in Fabric v6+; fire-and-forget on unmount.
      void canvas.dispose();
    };
  }, []);

  return (
    <div ref={wrapRef} className="relative flex-1 overflow-hidden bg-muted">
      <canvas ref={elRef} />
    </div>
  );
}
