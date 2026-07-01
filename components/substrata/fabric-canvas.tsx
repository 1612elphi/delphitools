"use client";

import { useEffect, useRef } from "react";
import { Canvas, Point } from "fabric";
import { getSnapshot, subscribe, setDoc } from "@/lib/substrata/doc-store";
import { registerViewportController, reportZoom } from "@/lib/substrata/viewport";
import { createEmptyDoc } from "@/lib/substrata/doc-model";
import type { Artboard, SubstrataDoc } from "@/lib/substrata/doc-model";
import { createReconcileState, reconcile, getLayerIdForObject } from "@/lib/substrata/sync";
import { initSubstrataFilterBackend } from "@/lib/substrata/filter-backend";
import { importImageFile } from "@/lib/substrata/import-raster";
import { setTransform } from "@/lib/substrata/layer-ops";
import { getActiveLayerId, setActiveLayer, subscribeSelection } from "@/lib/substrata/selection";
import { loadLatestProject, startAutosave, persistAll, clearPersistedData } from "@/lib/substrata/autosave";
import { getPersistenceEnabled, subscribePersistence } from "@/lib/substrata/persistence-pref";
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

    const canvas = new Canvas(el, {
      selection: false,
      preserveObjectStacking: true,
      // Draw selection controls AFTER the artboard clipPath so a layer's handles
      // stay visible even when its content is dragged off the canvas (clipped).
      controlsAboveOverlay: true,
    });
    initSubstrataFilterBackend();
    const state = createReconcileState();

    // Apply the selection store onto the canvas. Runs both on selection change
    // AND after every reconcile, so a layer selected the instant it's created
    // (e.g. on import) gets its controls once its Fabric object exists — the
    // post-update subscriber alone can race object creation.
    const applySelection = () => {
      const id = getActiveLayerId();
      const current = canvas.getActiveObject();
      if (id === null) {
        if (current) {
          canvas.discardActiveObject();
          canvas.requestRenderAll();
        }
        return;
      }
      const obj = state.byId.get(id);
      if (obj && current !== obj) {
        canvas.setActiveObject(obj);
        canvas.requestRenderAll();
      }
      // obj not created yet → a later reconcile's applySelection picks it up.
    };

    const render = () => {
      const doc = getSnapshot();
      if (!doc) return;
      reconcile(canvas, doc, state);
      // Drop selection if its layer is gone (e.g. undoing an import).
      const sel = getActiveLayerId();
      if (sel && !doc.layers.some((l) => l.id === sel)) setActiveLayer(null);
      applySelection();
    };

    // Zoom-% cycle state: 100% → fit → last manual zoom. Reset by any manual zoom.
    let cycleStep = -1;
    let cycleAnchor = 1;
    const resetCycle = () => {
      cycleStep = -1;
    };

    const fit = () => {
      canvas.setDimensions({ width: wrap.clientWidth, height: wrap.clientHeight });
      const doc = getSnapshot();
      if (doc) fitView(canvas, doc.artboard);
      canvas.requestRenderAll();
      resetCycle();
      reportZoom(canvas.getZoom());
    };

    const setCanvasCursor = (c: string) => {
      canvas.defaultCursor = c || "default";
      if (canvas.upperCanvasEl) canvas.upperCanvasEl.style.cursor = c;
    };

    // ── viewport: zoom + pan ──────────────────────────────────────────────────
    const ZMIN = 0.02;
    const ZMAX = 64;
    const clampZoom = (z: number) => Math.max(ZMIN, Math.min(ZMAX, z));
    const centre = () => new Point(canvas.getWidth() / 2, canvas.getHeight() / 2);
    const zoomAtCentre = (factor: number) => {
      resetCycle();
      canvas.zoomToPoint(centre(), clampZoom(canvas.getZoom() * factor));
      reportZoom(canvas.getZoom());
    };
    registerViewportController({
      zoomIn: () => zoomAtCentre(1.2),
      zoomOut: () => zoomAtCentre(1 / 1.2),
      fit,
      setZoom: (z) => {
        resetCycle();
        canvas.zoomToPoint(centre(), clampZoom(z));
        reportZoom(canvas.getZoom());
      },
      reset: () => {
        resetCycle();
        canvas.zoomToPoint(centre(), 1);
        reportZoom(canvas.getZoom());
      },
      cycle: () => {
        // 100% → fit → the zoom that was active before cycling began.
        if (cycleStep === -1) cycleAnchor = canvas.getZoom();
        cycleStep = (cycleStep + 1) % 3;
        if (cycleStep === 0) {
          canvas.zoomToPoint(centre(), 1);
        } else if (cycleStep === 1) {
          const doc = getSnapshot();
          if (doc) fitView(canvas, doc.artboard);
        } else {
          canvas.zoomToPoint(centre(), clampZoom(cycleAnchor));
        }
        reportZoom(canvas.getZoom());
      },
    });

    // Wheel: ⌘/Ctrl (or trackpad pinch) zooms to the cursor; plain wheel pans.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        resetCycle();
        const r = wrap.getBoundingClientRect();
        const p = new Point(e.clientX - r.left, e.clientY - r.top);
        canvas.zoomToPoint(p, clampZoom(canvas.getZoom() * Math.pow(0.999, e.deltaY)));
        reportZoom(canvas.getZoom());
      } else {
        canvas.relativePan(new Point(-e.deltaX, -e.deltaY));
      }
    };
    wrap.addEventListener("wheel", onWheel, { passive: false });

    // Space-drag to pan.
    const isInteractive = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (el.isContentEditable || /^(BUTTON|INPUT|TEXTAREA|SELECT|A)$/.test(el.tagName));
    };
    let spaceHeld = false;
    let panning = false;
    let panX = 0;
    let panY = 0;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !spaceHeld && !isInteractive(e.target)) {
        spaceHeld = true;
        canvas.skipTargetFind = true; // pan cleanly without grabbing objects
        setCanvasCursor("grab");
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceHeld = false;
        panning = false;
        canvas.skipTargetFind = false;
        setCanvasCursor("");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas.on("mouse:down", (opt) => {
      if (!spaceHeld) return;
      panning = true;
      setCanvasCursor("grabbing");
      const ev = opt.e as MouseEvent;
      panX = ev.clientX;
      panY = ev.clientY;
    });
    canvas.on("mouse:move", (opt) => {
      if (!panning) return;
      const ev = opt.e as MouseEvent;
      canvas.relativePan(new Point(ev.clientX - panX, ev.clientY - panY));
      panX = ev.clientX;
      panY = ev.clientY;
    });
    canvas.on("mouse:up", () => {
      panning = false;
      if (spaceHeld) setCanvasCursor("grab");
    });

    // Canvas → store: reflect the active Fabric object into the selection store.
    const syncSelectionToStore = () => {
      const obj = canvas.getActiveObject();
      setActiveLayer(obj ? getLayerIdForObject(obj) ?? null : null);
    };
    canvas.on("selection:created", syncSelectionToStore);
    canvas.on("selection:updated", syncSelectionToStore);
    canvas.on("selection:cleared", () => setActiveLayer(null));

    // The one controlled Fabric → doc path: commit a transform after a drag/
    // scale/rotate ends. The doc stays authoritative; reconcile re-syncs.
    canvas.on("object:modified", (e) => {
      const obj = e.target;
      if (!obj) return;
      const id = getLayerIdForObject(obj);
      if (!id) return;
      setTransform(id, {
        x: obj.left,
        y: obj.top,
        scaleX: obj.scaleX,
        scaleY: obj.scaleY,
        angle: obj.angle,
        flipX: obj.flipX,
        flipY: obj.flipY,
      });
    });

    // Layers move freely; the canvas clipPath (set in reconcile) hides anything
    // past the artboard edge, so no position constraint is needed here.

    // Store → canvas: reflect the selection store onto the canvas. id-equality
    // guards on both sides keep this from looping with the events above.
    const unsubscribeSelection = subscribeSelection(applySelection);

    const unsubscribe = subscribe(render);
    render();
    fit();

    // Restore the last autosaved project ONLY if the user opted into local
    // storage; otherwise start a fresh scene. Async — the canvas shows the void
    // for a few ms until the doc resolves.
    let cancelled = false;
    void (async () => {
      if (getSnapshot()) return;
      let doc: SubstrataDoc | null = null;
      if (getPersistenceEnabled()) {
        try {
          doc = await loadLatestProject();
        } catch {
          doc = null;
        }
      }
      if (cancelled || getSnapshot()) return;
      setDoc(doc ?? createEmptyDoc());
      fit();
    })();

    // Autosave lifecycle follows the opt-in preference: enabling persists the
    // current scene + its rasters and starts autosaving; disabling stops and
    // purges the local copy (privacy hangup — off means no trace).
    let stopAutosave: (() => void) | null = null;
    const syncPersistence = () => {
      const on = getPersistenceEnabled();
      if (on && !stopAutosave) {
        stopAutosave = startAutosave();
        const doc = getSnapshot();
        if (doc) void persistAll(doc);
      } else if (!on && stopAutosave) {
        stopAutosave();
        stopAutosave = null;
        void clearPersistedData();
      }
    };
    const unsubscribePersistence = subscribePersistence(syncPersistence);
    syncPersistence();

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
      cancelled = true;
      stopAutosave?.();
      unsubscribePersistence();
      unsubscribe();
      unsubscribeSelection();
      registerViewportController(null);
      ro.disconnect();
      wrap.removeEventListener("dragover", onDragOver);
      wrap.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
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
