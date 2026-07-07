"use client";

import { useEffect, useRef } from "react";
import {
  ActiveSelection,
  Canvas,
  FitContentLayout,
  InteractiveFabricObject,
  LayoutManager,
  Point,
  controlsUtils,
  util as fabricUtil,
} from "fabric";
import type { FabricObject, LayoutStrategyResult, StrictLayoutContext } from "fabric";
import { getSnapshot, subscribe, setDoc, beginTransient, commitTransient } from "@/lib/substrata/doc-store";
import { registerViewportController, reportZoom } from "@/lib/substrata/viewport";
import { createEmptyDoc, createFreehandLayer, createShapeLayer, createTextLayer, identityTransform } from "@/lib/substrata/doc-model";
import type { Artboard, ShapeLayer, SubstrataDoc, Transform } from "@/lib/substrata/doc-model";
import { bakeLayerObject, createReconcileState, reconcile, getLayerIdForObject, renderExport } from "@/lib/substrata/sync";
import { registerExportRenderer } from "@/lib/substrata/export-source";
import { runExport, type ExportOutcome } from "@/lib/substrata/export-run";
import { resolveExportDims, type ExportOptions } from "@/lib/substrata/export-core";
import { initSubstrataFilterBackend } from "@/lib/substrata/filter-backend";
import { importImageFile } from "@/lib/substrata/import-raster";
import { deleteLayers, groupLayers, moveLayer, setOpacity, setShapeParams, setTextProps, setTransform, setTransforms } from "@/lib/substrata/layer-ops";
import { SubstrataText } from "@/lib/substrata/text-object";
import { styleFields } from "@/lib/substrata/text-style";
import { addFx, setFxParam } from "@/lib/substrata/fx-ops";
import { collectIds, findLayer, leafLayers, leafRenderList, parentIdOf } from "@/lib/substrata/layer-tree";
import {
  getActiveLayerId,
  getSelectedLayerIds,
  pruneSelection,
  setSelection,
  subscribeSelection,
} from "@/lib/substrata/selection";
import { loadLatestProject, startAutosave, persistAll, clearPersistedData } from "@/lib/substrata/autosave";
import { getPersistenceEnabled, subscribePersistence } from "@/lib/substrata/persistence-pref";
import { GRID_SIZE, getGuides, subscribeGuides, toggleGuide } from "@/lib/substrata/guides-pref";
import { addGuide, removeGuide, setGuidePos } from "@/lib/substrata/guide-ops";
import { presetShape } from "@/lib/substrata/preset-shapes";
import { packSubstrata, unpackSubstrata } from "@/lib/substrata/substrata-file";
import { registerLayerBaker, rasterizeLayer } from "@/lib/substrata/rasterize-ops";
import {
  floodMask,
  globalMask,
  maskArea,
  polygonMask,
  rectMask,
  snapToEdge,
  sobelField,
} from "@/lib/substrata/select-mask";
import {
  clearPixelSelection,
  getPixelSelection,
  setPixelSelectionMask,
  subscribePixelSelection,
} from "@/lib/substrata/pixel-selection";
import { cutSelection, extractSelection, growSelection, invertSelection, shrinkSelection } from "@/lib/substrata/select-ops";
import { reportSelectionAnchor } from "@/components/substrata/selection-popup";
import { toast } from "@/lib/substrata/toast";
import { subscribeLuts } from "@/lib/substrata/lut-data";
import { getLayerMenu, openCanvasMenu, openLayerMenu } from "@/lib/substrata/context-menu";
import {
  getToolSettings,
  setTransformAsGroup,
  subscribeToolSettings,
  updateToolSettings,
} from "@/lib/substrata/tool-settings";
import {
  getActiveSubs,
  getActiveTool,
  setActiveSub,
  setActiveTool,
  subscribeTool,
  type ToolId,
} from "@/lib/substrata/tool";
import {
  appendLayer,
  buildDraggedShape,
  FREEHAND_NAMES,
  freehandOptions,
  SHAPE_NAMES,
  strokeForNewShape,
  upsertLayerTransient,
  type FreehandSub,
  type Pt,
} from "@/lib/substrata/draw-shape";
import { centreRawPoints, outlineToPathD, strokeOutline, type RawPoint } from "@/lib/substrata/freehand";
import { startColourSink } from "@/lib/substrata/colour-sink";
import { setHex } from "@/lib/substrata/colour-store";
import { buildSnapField, computeSnap, type SnapBox } from "@/lib/substrata/snap-engine";
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

/**
 * Layout strategy for "transform separately" selections (Affinity-style): the
 * ActiveSelection's box fits ONLY the ANCHOR child (index 0 — the first id in
 * the selection store), so Fabric's native border + handles sit on the anchor
 * object while the other members get lightweight overlay boxes. Because the
 * box centre == the anchor's centre, the own-centre separate-rotation keeps
 * the anchor glued to its handles through rotations.
 */
// (inherits FitContentLayout's static `type` — it's only a serialisation key,
// and this layout manager is never persisted)
class AnchorBoxLayout extends FitContentLayout {
  calcBoundingBox(
    objects: FabricObject[],
    context: StrictLayoutContext,
  ): LayoutStrategyResult | undefined {
    return super.calcBoundingBox(objects.length > 0 ? [objects[0]] : objects, context);
  }
}

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
      // Native multi-select (M2): shift-click membership + rubber-band box.
      selection: true,
      preserveObjectStacking: true,
      // Draw selection controls AFTER the artboard clipPath so a layer's handles
      // stay visible even when its content is dragged off the canvas (clipped).
      controlsAboveOverlay: true,
    });
    initSubstrataFilterBackend();
    const state = createReconcileState();
    let maskDocId: string | null = null;

    // ── selection chrome (backdrop-sketch parity) ─────────────────────────────
    // Square 8px paper-filled handles with a primary 1.5px border, primary
    // selection border, and a CIRCULAR rotate handle on Fabric's stem. Controls
    // are shared through ownDefaults (Fabric's documented pattern for one
    // shared control set) — NOTE for M2 text: Textbox needs its own control
    // set, so this shared record must become per-kind then.
    const sharedControls = controlsUtils.createObjectDefaultControls();
    sharedControls.mtr.render = controlsUtils.renderCircleControl;
    const applySelectionChrome = () => {
      const css = getComputedStyle(document.documentElement);
      const primary = css.getPropertyValue("--primary").trim();
      const paper = css.getPropertyValue("--background").trim();
      const chrome = {
        transparentCorners: false,
        cornerStyle: "rect" as const,
        cornerSize: 8,
        cornerColor: paper,
        cornerStrokeColor: primary,
        borderColor: primary,
        borderScaleFactor: 1.5,
      };
      Object.assign(InteractiveFabricObject.ownDefaults, chrome, { controls: sharedControls });
      // recolour objects that already exist (theme flips re-run this)
      for (const [id, obj] of state.byId) {
        if (id !== "__artboard__") obj.set(chrome);
      }
      canvas.selectionColor = `color-mix(in oklch, ${primary} 10%, transparent)`;
      canvas.selectionBorderColor = primary;
      canvas.selectionLineWidth = 1;
      canvas.requestRenderAll();
    };
    applySelectionChrome();
    const themeObserver = new MutationObserver(applySelectionChrome);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    // Suppresses the canvas→store echo while WE drive the canvas selection
    // programmatically (store→canvas apply, commit-time rebuild). Without it, a
    // group id selected in the panel would bounce back as its leaf ids.
    let squelchSelectionEvents = false;

    /** Store ids → the SELECTABLE leaf objects they cover (group ids expand to
     *  their visible, unlocked leaf members — groups are folders). Flags are
     *  composed from the DOC ROOT, so a hidden/locked ancestor above the
     *  selected node excludes its leaves (matching the reconciler). */
    const selectedLeafObjects = (): FabricObject[] => {
      const doc = getSnapshot();
      if (!doc) return [];
      const effective = new Map(leafRenderList(doc.layers).map((e) => [e.layer.id, e]));
      const out: FabricObject[] = [];
      for (const id of getSelectedLayerIds()) {
        const layer = findLayer(doc.layers, id);
        if (!layer) continue;
        for (const leaf of leafLayers(layer)) {
          const entry = effective.get(leaf.id);
          if (!entry || !entry.visible || entry.locked) continue;
          const obj = state.byId.get(leaf.id);
          if (obj && !out.includes(obj)) out.push(obj);
        }
      }
      return out;
    };

    // ActiveSelections WE built in separate mode (anchor-box layout) — the
    // overlay and the rebuild guard key off membership here.
    const anchorStyled = new WeakSet<ActiveSelection>();

    // Apply the selection store onto the canvas. Runs on selection change AND
    // after every reconcile, so a layer selected the instant it's created
    // (e.g. on import) gets its controls once its Fabric object exists — the
    // post-update subscriber alone can race object creation.
    const applySelection = () => {
      const objs = selectedLeafObjects();
      const current = canvas.getActiveObjects();
      const active = canvas.getActiveObject();
      const separate = !getToolSettings().transformAsGroup;
      const sameSet = objs.length === current.length && objs.every((o) => current.includes(o));
      // A live multi-selection must also match the CURRENT transform mode.
      // CRUCIAL: convert IN PLACE (swap the layout manager + re-layout), never
      // discard/rebuild — applySelection runs synchronously inside Fabric's
      // own mouse handlers (selection events → store → here), and swapping the
      // active object out from under a mid-flight mousedown leaves Fabric
      // driving a zombie selection (ghost chrome, garbage child coords).
      if (sameSet && active instanceof ActiveSelection && anchorStyled.has(active) !== separate) {
        active.layoutManager = new LayoutManager(separate ? new AnchorBoxLayout() : new FitContentLayout());
        if (separate) anchorStyled.add(active);
        else anchorStyled.delete(active);
        active.triggerLayout();
        active.setCoords();
        canvas.requestRenderAll();
        return;
      }
      // Same object set + right mode → leave the live selection alone (breaks
      // the loop with the canvas events; never rebuilds an AS mid-use).
      if (sameSet) return;
      squelchSelectionEvents = true;
      try {
        if (objs.length === 0) {
          if (active) canvas.discardActiveObject();
        } else if (objs.length === 1) {
          canvas.setActiveObject(objs[0]);
        } else {
          const as = new ActiveSelection(objs, {
            canvas,
            ...(separate ? { layoutManager: new LayoutManager(new AnchorBoxLayout()) } : {}),
          });
          if (separate) anchorStyled.add(as);
          canvas.setActiveObject(as);
        }
      } finally {
        squelchSelectionEvents = false;
      }
      canvas.requestRenderAll();
    };

    const render = () => {
      const doc = getSnapshot();
      if (!doc) return;
      // A live ActiveSelection holds its children in selection-RELATIVE coords,
      // while reconcile writes doc-ABSOLUTE transforms — running it into grouped
      // children corrupts their positions (visibly, and a later drag would then
      // commit garbage). Tear the selection down first (squelched; Fabric bakes
      // coords back), reconcile onto ungrouped objects, rebuild from the store.
      if (canvas.getActiveObject() instanceof ActiveSelection) {
        squelchSelectionEvents = true;
        try {
          canvas.discardActiveObject();
        } finally {
          squelchSelectionEvents = false;
        }
      }
      reconcile(canvas, doc, state);
      // Drop selected ids whose layers are gone (e.g. undoing an import).
      pruneSelection(new Set(collectIds(doc.layers)));
      // A pixel mask is scene-space at artboard resolution — a resized
      // artboard OR a different document invalidates it (undo/redo keeps the
      // doc id, so masks correctly survive history moves).
      const pxSel = getPixelSelection();
      if (
        pxSel &&
        (pxSel.mask.width !== doc.artboard.width ||
          pxSel.mask.height !== doc.artboard.height ||
          doc.id !== maskDocId)
      ) {
        clearPixelSelection();
      }
      maskDocId = doc.id;
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

    // M6: export renders through the reconciler's fabric scene (export-source
    // bridge — the orchestrator/estimate call renderForExport, we own fabric).
    registerExportRenderer((opts) => {
      const doc = getSnapshot();
      return doc ? renderExport(canvas, state, doc, opts) : null;
    });
    // M3-15: rasterize bakes through the reconciler's live objects
    registerLayerBaker((id) => {
      const doc = getSnapshot();
      const layer = doc ? findLayer(doc.layers, id) : null;
      return layer ? bakeLayerObject(state, layer) : null;
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
      // pixel selection: Escape deselects, Enter fires the DEFAULT action
      // (extract — the ratified popup default)
      if (!isInteractive(e.target) && getPixelSelection()) {
        if (e.code === "Escape") {
          clearPixelSelection();
          e.preventDefault();
        } else if (e.code === "Enter") {
          void extractSelection();
          e.preventDefault();
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceHeld = false;
        panning = false;
        applyToolMode(); // restore the ACTIVE tool's targeting/cursor, not MOVE's
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // ── tool modes ────────────────────────────────────────────────────────────
    // PIECES' Primitives/Brush/Pencil subs are DRAWING modes: pointer drags
    // author layers instead of grabbing objects (skipTargetFind) or
    // rubber-banding (selection=false). Every other tool keeps MOVE-style
    // interaction (stub tools set state only).
    const shapeModeActive = () =>
      getActiveTool() === "pieces" &&
      (getActiveSubs().pieces === "primitives" || getActiveSubs().pieces === "pieces");
    // the Pieces HEAD sub is the preset-shapes gallery — it always draws the
    // picked symbol, whatever the primitives bloom last set shape to
    const effectivePieces = () => {
      const s = getToolSettings().pieces;
      return getActiveSubs().pieces === "pieces" ? { ...s, shape: "symbol" as const } : s;
    };
    const freehandSub = (): FreehandSub | null => {
      const sub = getActiveSubs().pieces;
      return getActiveTool() === "pieces" && (sub === "brush" || sub === "pencil") ? sub : null;
    };
    const textModeActive = () => getActiveTool() === "text" && getActiveSubs().text === "text";
    const selectSub = (): "select" | "lasso" | "wand" | null => {
      const sub = getActiveSubs().select;
      return getActiveTool() === "select" && (sub === "select" || sub === "lasso" || sub === "wand")
        ? sub
        : null;
    };
    const applyToolMode = () => {
      // pixel-SELECT subtools are drawing-style modes too: gestures author a
      // mask, never grab objects. Leaving SELECT drops the selection (v1).
      if (getActiveTool() !== "select" && getPixelSelection()) clearPixelSelection();
      const draw = shapeModeActive() || freehandSub() !== null || selectSub() !== null;
      canvas.skipTargetFind = draw || spaceHeld;
      canvas.selection = !draw;
      // TEXT keeps normal targeting (click selects, dbl-click edits) but an
      // I-beam signals click-to-type on empty canvas.
      setCanvasCursor(draw ? "crosshair" : spaceHeld ? "grab" : textModeActive() ? "text" : "");
    };
    const unsubscribeTool = subscribeTool(applyToolMode);
    applyToolMode();

    // ── PIECES drag-to-draw (M2-7) ────────────────────────────────────────────
    // One transient gesture per drag: the layer is created on the first move
    // past the threshold, reshaped live, committed as ONE undo step on release.
    // A click without a drag creates nothing (commitTransient sees no change).
    let draft: { start: Pt; layer: ShapeLayer | null } | null = null;
    canvas.on("mouse:down", (opt) => {
      if (spaceHeld || panning || !shapeModeActive()) return;
      draft = { start: canvas.getScenePoint(opt.e), layer: null };
      beginTransient();
    });
    canvas.on("mouse:move", (opt) => {
      if (!draft) return;
      const s = effectivePieces();
      const built = buildDraggedShape(
        s,
        draft.start,
        canvas.getScenePoint(opt.e),
        (opt.e as MouseEvent).shiftKey,
      );
      if (!built) return;
      draft.layer = draft.layer
        ? { ...draft.layer, params: built.params, transform: built.transform }
        : createShapeLayer({
            // symbol layers name themselves after their preset (Heart, Cog, …)
            name:
              built.params.shape === "symbol"
                ? (presetShape(built.params.symbolId)?.name ?? SHAPE_NAMES.symbol)
                : SHAPE_NAMES[s.shape],
            params: built.params,
            fill: s.fill,
            stroke: strokeForNewShape(s),
            transform: built.transform,
          });
      upsertLayerTransient(draft.layer);
    });
    canvas.on("mouse:up", () => {
      if (!draft) return;
      const drawn = draft.layer;
      draft = null;
      commitTransient();
      if (drawn) setSelection([drawn.id]);
    });

    // ── TEXT (M2) ─────────────────────────────────────────────────────────────
    // Click empty canvas → create a text layer (current settings + style
    // preset, ONE undo step) and drop straight into editing — no placeholder
    // wording ever renders (the layer starts empty; abandoning it deletes it).
    // Clicking an object falls through to normal select / dbl-click edit.
    canvas.on("mouse:down", (opt) => {
      if (spaceHeld || panning || opt.target || !textModeActive()) return;
      const p = canvas.getScenePoint(opt.e);
      const ts = getToolSettings();
      const style = styleFields(ts.text.style, ts.pieces.fill, ts.text.fontSize);
      const layer = createTextLayer({
        name: "Text", // standard vocabulary default — replaced by the typed content on exit
        text: "",
        fontFamily: ts.text.fontFamily,
        fontSize: ts.text.fontSize,
        ...style,
        align: ts.text.align,
        transform: { ...identityTransform(), x: p.x, y: p.y },
      });
      appendLayer(layer);
      setSelection([layer.id]);
      // enter editing once the reconciler has created the object
      requestAnimationFrame(() => {
        const obj = state.byId.get(layer.id);
        if (obj instanceof SubstrataText) {
          canvas.setActiveObject(obj);
          obj.enterEditing();
        }
      });
    });

    // The second controlled Fabric→doc path (after object:modified): commit
    // the typed text when in-canvas editing ends. Empty text = an abandoned
    // layer — remove it. The layer NAME follows the content (data, not copy).
    canvas.on("text:editing:exited", (e) => {
      const obj = e.target;
      if (!(obj instanceof SubstrataText)) return;
      const id = getLayerIdForObject(obj);
      if (!id) return;
      const text = (obj.text ?? "").trim();
      if (text === "") {
        deleteLayers([id]);
        return;
      }
      // Fabric anchors the LEFT edge while typing (it mutates `left` as the
      // text grows) — adopt the visual centre into the doc transform or the
      // text snaps back to the click point when the reconciler re-syncs.
      const doc = getSnapshot();
      const layer = doc ? findLayer(doc.layers, id) : null;
      const c = obj.getCenterPoint();
      setTextProps(id, {
        text: obj.text,
        name: obj.text.slice(0, 24),
        ...(layer ? { transform: { ...layer.transform, x: c.x, y: c.y } } : {}),
      });
    });

    // ── Brush/Pencil freehand (M2-2) ──────────────────────────────────────────
    // The live stroke previews on the TOP CONTEXT (drawn in the after:render
    // overlay below) and hits the doc exactly ONCE on release — no transient
    // machinery, one undo step by construction. Raw points are collected from
    // coalesced pointer events; real pressure only from a pen (SPEC §Pieces —
    // Firefox reports pressure 0 on pointerup, so non-positive values fall
    // back too).
    const pressureOf = (e: Event): number => {
      const pe = e as PointerEvent;
      return pe.pointerType === "pen" && pe.pressure > 0 ? pe.pressure : 0.5;
    };
    let liveStroke: { sub: FreehandSub; pts: RawPoint[]; simulate: boolean } | null = null;
    canvas.on("mouse:down", (opt) => {
      const sub = freehandSub();
      if (spaceHeld || panning || !sub) return;
      const e = opt.e as PointerEvent;
      const p = canvas.getScenePoint(opt.e);
      liveStroke = { sub, simulate: e.pointerType !== "pen", pts: [[p.x, p.y, pressureOf(e)]] };
    });
    canvas.on("mouse:move", (opt) => {
      if (!liveStroke) return;
      const e = opt.e as PointerEvent;
      const events: PointerEvent[] =
        typeof e.getCoalescedEvents === "function" && e.getCoalescedEvents().length > 0
          ? e.getCoalescedEvents()
          : [e];
      for (const ce of events) {
        const p = canvas.getScenePoint(ce);
        liveStroke.pts.push([p.x, p.y, pressureOf(ce)]);
      }
      canvas.requestRenderAll(); // preview renders in the after:render overlay
    });
    canvas.on("mouse:up", () => {
      if (!liveStroke) return;
      const { sub, pts, simulate } = liveStroke;
      liveStroke = null;
      canvas.requestRenderAll(); // clear the preview
      if (pts.length < 2) return; // a tap draws nothing
      const s = getToolSettings().pieces;
      const options = freehandOptions(sub, s, simulate);
      const { points, cx, cy } = centreRawPoints(pts, options);
      const layer = createFreehandLayer({
        name: FREEHAND_NAMES[sub],
        rawPoints: points,
        strokeOptions: options,
        fill: s.fill,
        transform: { ...identityTransform(), x: cx, y: cy },
      });
      appendLayer(layer);
      setSelection([layer.id]);
    });
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

    // ── SELECT: pixel selections (M2-10, ratified 2026-07-07) ─────────────────
    // Marquee drags a rect, lasso collects a polygon (optionally edge-snapped),
    // wand click flood-fills the ACTIVE layer's solo render (global mode =
    // "superflood" colour select). Gestures author a scene-space mask into the
    // transient pixel-selection store; the ants + drafts draw in after:render.
    let marqueeDraft: { x0: number; y0: number; x1: number; y1: number } | null = null;
    let lassoDraft: {
      pts: { x: number; y: number }[];
      field: ReturnType<typeof sobelField> | null;
    } | null = null;

    // wrap-relative screen px → scene coords (unrounded)
    const sceneXY = (px: number, py: number): { x: number; y: number } => {
      const vpt = canvas.viewportTransform;
      return { x: (px - vpt[4]) / vpt[0], y: (py - vpt[5]) / vpt[3] };
    };
    // Solo-render the active layer at artboard scale for pixel sampling (the
    // M6 renderExport path — filters/effects included, checker excluded).
    const sampleActiveLayer = (): ImageData | null => {
      const doc = getSnapshot();
      const id = getActiveLayerId();
      if (!doc || !id) return null;
      const el = renderExport(canvas, state, doc, { scale: 1, soloLayerId: id });
      const c = el.getContext("2d", { willReadFrequently: true });
      return c ? c.getImageData(0, 0, el.width, el.height) : null;
    };
    const snapLassoPt = (
      field: ReturnType<typeof sobelField> | null,
      p: { x: number; y: number },
    ): { x: number; y: number } => {
      if (!field) return { x: p.x, y: p.y };
      const s = getToolSettings().select;
      // search radius scales with the sensitivity setting (4–20 scene px)
      return snapToEdge(field, p.x, p.y, 4 + (s.sensitivity / 100) * 16);
    };

    // SELECT gestures are claimed at DOM CAPTURE phase (the guides pattern,
    // wired into the same wrap listeners below): Fabric's own mousedown-on-
    // empty DISCARDS the active object before canvas events fire, which would
    // drop the layer selection the wand samples and the extract/cut gate reads
    // — pixel selections must never disturb the layer selection (PS semantics).
    const selectPointerDown = (px: number, py: number): boolean => {
      const sub = selectSub();
      if (!sub) return false;
      const p = sceneXY(px, py);
      if (sub === "select") {
        marqueeDraft = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
      } else if (sub === "lasso") {
        const s = getToolSettings().select;
        // magnetic: one Sobel field per gesture, over the active layer's pixels
        const field = s.magnetic ? ((img) => (img ? sobelField(img) : null))(sampleActiveLayer()) : null;
        lassoDraft = { pts: [snapLassoPt(field, p)], field };
      } else {
        // wand: click selects — no drag phase
        const doc = getSnapshot();
        if (!doc) return true;
        const img = sampleActiveLayer();
        if (!img) {
          toast("wand-needs-layer");
          return true;
        }
        const s = getToolSettings().select;
        // pixels cover [i, i+1) and the mask fns floor their seed — rounding
        // here would shift right/bottom-half clicks into the NEXT pixel and
        // push edge clicks out of bounds (review-caught)
        const mask =
          s.wandMode === "global"
            ? globalMask(img, p.x, p.y, s.tolerance)
            : floodMask(img, p.x, p.y, s.tolerance);
        setPixelSelectionMask(mask);
      }
      canvas.requestRenderAll();
      return true;
    };
    const selectPointerMove = (px: number, py: number): void => {
      if (!marqueeDraft && !lassoDraft) return;
      if (!selectSub()) {
        // tool switched mid-drag (keyboard) — the gesture dies with it
        marqueeDraft = null;
        lassoDraft = null;
        canvas.requestRenderAll();
        return;
      }
      const p = sceneXY(px, py);
      if (marqueeDraft) marqueeDraft = { ...marqueeDraft, x1: p.x, y1: p.y };
      else if (lassoDraft) lassoDraft.pts.push(snapLassoPt(lassoDraft.field, p));
      canvas.requestRenderAll();
    };
    const selectPointerUp = (): void => {
      if (!marqueeDraft && !lassoDraft) return;
      if (!selectSub()) {
        marqueeDraft = null;
        lassoDraft = null;
        canvas.requestRenderAll();
        return;
      }
      const doc = getSnapshot();
      if (marqueeDraft) {
        const d = marqueeDraft;
        marqueeDraft = null;
        if (doc) {
          // a bare click (no meaningful drag) clears instead of selecting dust
          if (Math.abs(d.x1 - d.x0) < 2 || Math.abs(d.y1 - d.y0) < 2) clearPixelSelection();
          else {
            setPixelSelectionMask(
              rectMask(doc.artboard.width, doc.artboard.height, d.x0, d.y0, d.x1, d.y1),
            );
          }
        }
      } else if (lassoDraft) {
        const d = lassoDraft;
        lassoDraft = null;
        if (doc) {
          if (d.pts.length < 3) clearPixelSelection();
          else setPixelSelectionMask(polygonMask(doc.artboard.width, doc.artboard.height, d.pts));
        }
      }
      canvas.requestRenderAll();
    };

    // Marching-ant crawl: a slow phase tick that only runs while a selection
    // exists (the after:render pass draws the dashes with this offset).
    let antPhase = 0;
    let antTimer: number | null = null;
    const syncAntTimer = () => {
      const has = getPixelSelection() !== null;
      if (has && antTimer === null) {
        antTimer = window.setInterval(() => {
          antPhase = (antPhase + 1) % 8;
          canvas.requestRenderAll();
        }, 100);
      } else if (!has && antTimer !== null) {
        window.clearInterval(antTimer);
        antTimer = null;
      }
    };
    const unsubscribePixelSelection = subscribePixelSelection(() => {
      syncAntTimer();
      canvas.requestRenderAll();
    });
    syncAntTimer(); // the store outlives the component — a remount must resume the crawl

    // Canvas → store: reflect the user's canvas selection (leaf ids — clicking
    // the canvas selects layers, not their groups; group selection comes from
    // the Layers panel). Squelched while WE drive the canvas programmatically.
    const syncSelectionToStore = () => {
      if (squelchSelectionEvents) return;
      const ids = canvas
        .getActiveObjects()
        .map((o) => getLayerIdForObject(o))
        .filter((id): id is string => !!id);
      setSelection(ids);
    };
    canvas.on("selection:created", syncSelectionToStore);
    canvas.on("selection:updated", syncSelectionToStore);
    canvas.on("selection:cleared", syncSelectionToStore);

    /** Absolute doc transform read off an object's COMPOSED matrix — correct
     *  even while the object sits inside an ActiveSelection (whose transform it
     *  includes). qrDecompose folds flips into scale signs; split them back
     *  out. translateX/Y is the absolute centre (our x/y convention). Skew from
     *  scaling a mixed-rotation selection is dropped — accepted v1 limit. */
    const absoluteTransformOf = (obj: FabricObject): Transform => {
      const d = fabricUtil.qrDecompose(obj.calcTransformMatrix());
      return {
        x: d.translateX,
        y: d.translateY,
        scaleX: Math.abs(d.scaleX),
        scaleY: Math.abs(d.scaleY),
        angle: d.angle,
        flipX: d.scaleX < 0,
        flipY: d.scaleY < 0,
      };
    };

    // The one controlled Fabric → doc path: commit transforms after a drag/
    // scale/rotate ends. The doc stays authoritative; reconcile re-syncs.
    canvas.on("object:modified", (e) => {
      const target = e.target;
      if (!target) return;

      if (target instanceof ActiveSelection) {
        // Multi-selection gesture: read every child's ABSOLUTE transform from
        // its composed matrix and commit them as ONE undo step. NEVER discard
        // the selection in here — _discardActiveObject sees the discarded
        // object as the still-current transform target and re-runs
        // endCurrentTransform → re-fires object:modified → infinite recursion
        // (SelectableCanvas.ts:1295; the stack overflow also aborts Fabric's
        // `_currentTransform = null`, leaving the bbox glued to the cursor).
        // The commit defers one microtask so the doc-emit → render() →
        // selection teardown/rebuild runs after Fabric's mouseup has fully
        // completed and the transform is closed.
        const entries = target.getObjects().flatMap((obj) => {
          const id = getLayerIdForObject(obj);
          return id ? [{ id, transform: absoluteTransformOf(obj) }] : [];
        });
        queueMicrotask(() => setTransforms(entries));
        return;
      }

      const id = getLayerIdForObject(target);
      if (!id) return;
      setTransform(id, {
        x: target.left,
        y: target.top,
        scaleX: target.scaleX,
        scaleY: target.scaleY,
        angle: target.angle,
        flipX: target.flipX,
        flipY: target.flipY,
      });
    });

    // Layers move freely; the canvas clipPath (set in reconcile) hides anything
    // past the artboard edge, so no position constraint is needed here.

    // ── snapping + smart guides + grid (M2-12) ────────────────────────────────
    // object:moving gets a scene-space correction against the artboard edges/
    // centre, sibling bboxes, and (when on) the grid; matched lines draw on the
    // top context. Threshold FEELS in screen px, so it divides by zoom.
    // Unrotated-bbox approximation (documented in snap-engine.ts).
    const SNAP_SCREEN_PX = 6;
    let activeGuides: { v: number[]; h: number[] } | null = null;

    // ── transform separately (the shared MOVE/SELECT setting) ────────────────
    // With "Separate" on, rotating/scaling a multi-selection transforms each
    // child about its OWN centre: per frame, the child's selection-local matrix
    // is rewritten to G⁻¹ · T(cᵢ) · D · T(-cᵢ) · Wᵢ — Wᵢ its world matrix at
    // gesture start, cᵢ its centre, D the gesture's rotation/scale delta, G the
    // live selection matrix. The commit path composes G · local, so it needs no
    // special casing. Translation is identical either way (not intercepted).
    let separateBase: {
      world: Map<FabricObject, ReturnType<FabricObject["calcTransformMatrix"]>>;
      angle: number;
      scaleX: number;
      scaleY: number;
    } | null = null;

    canvas.on("before:transform", (e) => {
      const t = e.transform?.target;
      separateBase =
        t instanceof ActiveSelection
          ? {
              world: new Map(t.getObjects().map((o) => [o, o.calcTransformMatrix()])),
              angle: t.angle,
              scaleX: t.scaleX,
              scaleY: t.scaleY,
            }
          : null;
    });

    const transformSeparately = (target: FabricObject, kind: "rotate" | "scale") => {
      if (!separateBase || getToolSettings().transformAsGroup || !(target instanceof ActiveSelection)) {
        return;
      }
      const th = fabricUtil.degreesToRadians(target.angle - separateBase.angle);
      const D =
        kind === "rotate"
          ? ([Math.cos(th), Math.sin(th), -Math.sin(th), Math.cos(th), 0, 0] as const)
          : ([target.scaleX / separateBase.scaleX, 0, 0, target.scaleY / separateBase.scaleY, 0, 0] as const);
      const Ginv = fabricUtil.invertTransform(target.calcTransformMatrix());
      for (const child of target.getObjects()) {
        const W = separateBase.world.get(child);
        if (!W) continue;
        const cx = W[4]; // a world matrix's translation is the child's centre
        const cy = W[5];
        // T(c) · D · T(-c), collapsed
        const about: [number, number, number, number, number, number] = [
          D[0],
          D[1],
          D[2],
          D[3],
          cx - D[0] * cx - D[2] * cy,
          cy - D[1] * cx - D[3] * cy,
        ];
        const local = fabricUtil.multiplyTransformMatrices(
          Ginv,
          fabricUtil.multiplyTransformMatrices(about, W),
        );
        fabricUtil.applyTransformToObject(child, local);
        child.setCoords();
      }
    };

    // Live drag read-out (the sketch's dimbadge): move → X/Y · scale → W × H ·
    // rotate → angle. Rides in MOUSE vicinity (Ruby's call), not under the
    // bbox. px/py are viewport coords. Values are data (numbers + units).
    let dragBadge: {
      target: FabricObject;
      kind: "move" | "scale" | "rotate";
      px: number;
      py: number;
    } | null = null;
    canvas.on("object:scaling", (e) => {
      const p = canvas.getViewportPoint(e.e);
      dragBadge = e.target ? { target: e.target, kind: "scale", px: p.x, py: p.y } : null;
      if (e.target) transformSeparately(e.target, "scale");
      canvas.requestRenderAll();
    });
    canvas.on("object:rotating", (e) => {
      const target = e.target;
      // ⇧ snaps rotation to 45° steps — applied BEFORE the separate-mode
      // correction and the badge, so both read the snapped angle. Objects and
      // selections use centre origins, so a plain angle write spins in place.
      if (target && "shiftKey" in e.e && e.e.shiftKey) {
        target.set({ angle: Math.round(target.angle / 45) * 45 });
        target.setCoords();
      }
      const p = canvas.getViewportPoint(e.e);
      dragBadge = target ? { target, kind: "rotate", px: p.x, py: p.y } : null;
      if (target) transformSeparately(target, "rotate");
      canvas.requestRenderAll();
    });

    const boxOf = (obj: FabricObject): SnapBox => {
      const c = obj.getCenterPoint();
      return { x: c.x, y: c.y, w: obj.getScaledWidth(), h: obj.getScaledHeight() };
    };

    canvas.on("object:moving", (e) => {
      if (e.target) {
        const p = canvas.getViewportPoint(e.e);
        dragBadge = { target: e.target, kind: "move", px: p.x, py: p.y };
      }
      const g = getGuides();
      const target = e.target;
      const doc = getSnapshot();
      if (!target || !doc || (!g.snap && !g.grid)) {
        activeGuides = null;
        return;
      }
      const moving = new Set(target instanceof ActiveSelection ? target.getObjects() : [target]);
      const others: SnapBox[] = [];
      if (g.snap) {
        for (const [id, obj] of state.byId) {
          if (id === "__artboard__" || moving.has(obj) || !obj.visible) continue;
          others.push(boxOf(obj));
        }
      }
      const field = g.snap
        ? buildSnapField(doc.artboard, others)
        : { v: [] as number[], h: [] as number[] };
      // dragged-out guidelines are first-class snap targets (when visible)
      if (g.snap && g.guides) {
        for (const gd of doc.guides) (gd.axis === "x" ? field.v : field.h).push(gd.pos);
      }
      const res = computeSnap(
        boxOf(target),
        field,
        g.grid ? GRID_SIZE : null,
        SNAP_SCREEN_PX / canvas.getZoom(),
      );
      if (res.dx || res.dy) {
        const c = target.getCenterPoint();
        target.setPositionByOrigin(new Point(c.x + res.dx, c.y + res.dy), "center", "center");
        target.setCoords();
      }
      activeGuides = res.v.length || res.h.length ? { v: res.v, h: res.h } : null;
      canvas.requestRenderAll();
    });

    const clearGuides = () => {
      if (activeGuides || dragBadge) {
        activeGuides = null;
        dragBadge = null;
        canvas.requestRenderAll();
      }
    };
    canvas.on("mouse:up", clearGuides);

    // ── rulers + drag-out guides (2026-07-07 ratification) ────────────────────
    // Rulers are 22px screen-space bands (backdrop sketch) drawn at the END of
    // the after:render pass; guides are DOC content (doc.guides) drawn with the
    // overlay. Gestures are claimed with a CAPTURE-phase pointerdown on the
    // wrap div — it runs before Fabric's own upper-canvas listeners, so ruler
    // drag-outs and guide grabs never fight tool guards or object targeting.
    const RULER_PX = 22;
    const GUIDE_GRAB_PX = 4; // screen-px slop for grabbing an existing guide
    // Pick a "nice" scene step (1/2/5 × 10^n) at least `min` scene units wide.
    const niceStep = (min: number): number => {
      const pow = 10 ** Math.floor(Math.log10(min));
      for (const m of [1, 2, 5]) if (m * pow >= min) return m * pow;
      return 10 * pow;
    };
    // id === null → a new guide being dragged out (doc write happens on drop);
    // id set → an existing guide moving via the transient path (ONE undo step).
    // `cross` = the pointer's OTHER-axis wrap px — the gap-pills ride it.
    let guideDrag: { id: string | null; axis: "x" | "y"; pos: number; cross: number } | null = null;
    let guideHover = false;

    const wrapPoint = (e: PointerEvent) => {
      const r = wrap.getBoundingClientRect();
      return { px: e.clientX - r.left, py: e.clientY - r.top };
    };
    const scenePos = (axis: "x" | "y", px: number, py: number): number => {
      const vt = canvas.viewportTransform;
      return Math.round(axis === "x" ? (px - vt[4]) / vt[0] : (py - vt[5]) / vt[3]);
    };
    const guideAt = (px: number, py: number): { id: string; axis: "x" | "y" } | null => {
      const doc = getSnapshot();
      if (!doc || !getGuides().guides) return null;
      const vt = canvas.viewportTransform;
      // last added wins (drawn on top)
      for (let i = doc.guides.length - 1; i >= 0; i--) {
        const g = doc.guides[i];
        const screen = g.axis === "x" ? g.pos * vt[0] + vt[4] : g.pos * vt[3] + vt[5];
        if (Math.abs(screen - (g.axis === "x" ? px : py)) <= GUIDE_GRAB_PX) {
          return { id: g.id, axis: g.axis };
        }
      }
      return null;
    };

    // One pointer owns a claimed gesture at a time (review-hardened): a second
    // touch can't overwrite an in-flight drag, moves/ups from other pointers
    // are ignored, and pointercancel (touch handoff to scroll/pinch, pen out
    // of range) ends the gesture instead of gluing it to a buttonless pointer.
    let claimedPointerId: number | null = null;
    const onGuidePointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || spaceHeld || panning || claimedPointerId !== null) return;
      const { px, py } = wrapPoint(e);
      const g = getGuides();
      const inH = py < RULER_PX; // top band → horizontal guide (axis "y")
      const inV = px < RULER_PX; // left band → vertical guide (axis "x")
      if (g.rulers && (inH || inV)) {
        if (inH && inV) return; // corner box: no drag origin
        const axis: "x" | "y" = inV ? "x" : "y";
        guideDrag = { id: null, axis, pos: scenePos(axis, px, py), cross: axis === "x" ? py : px };
      } else if (selectSub()) {
        // pixel-SELECT gestures claim here too — Fabric's own mousedown would
        // discard the active object (the layer the wand/extract path needs)
        if (selectPointerDown(px, py)) {
          claimedPointerId = e.pointerId;
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      } else if (getActiveTool() === "move") {
        const hit = guideAt(px, py);
        if (!hit) return;
        guideDrag = { id: hit.id, axis: hit.axis, pos: 0, cross: hit.axis === "x" ? py : px };
        beginTransient();
      } else {
        return;
      }
      claimedPointerId = e.pointerId;
      guideHover = false; // the drag cursor owns the affordance now
      e.preventDefault();
      e.stopPropagation(); // Fabric never sees this press
      setCanvasCursor(guideDrag.axis === "x" ? "ew-resize" : "ns-resize");
      canvas.requestRenderAll();
    };
    const onGuidePointerMove = (e: PointerEvent) => {
      if (claimedPointerId !== null) {
        if (e.pointerId !== claimedPointerId) return;
        if (marqueeDraft || lassoDraft) {
          const { px, py } = wrapPoint(e);
          selectPointerMove(px, py);
          return;
        }
        if (guideDrag) {
          const { px, py } = wrapPoint(e);
          const pos = scenePos(guideDrag.axis, px, py);
          guideDrag = { ...guideDrag, pos, cross: guideDrag.axis === "x" ? py : px };
          if (guideDrag.id !== null) setGuidePos(guideDrag.id, pos, { transient: true });
          canvas.requestRenderAll();
        }
        return;
      }
      // hover affordance: resize cursor near a grabbable guide (MOVE tool)
      if (getActiveTool() !== "move" || spaceHeld || panning) return;
      const { px, py } = wrapPoint(e);
      const hit = px >= RULER_PX || py >= RULER_PX ? guideAt(px, py) : null;
      if (hit && !guideHover) {
        guideHover = true;
        setCanvasCursor(hit.axis === "x" ? "ew-resize" : "ns-resize");
      } else if (!hit && guideHover) {
        guideHover = false;
        applyToolMode(); // restores the tool's cursor + targeting state
      }
    };
    const onGuidePointerUp = (e: PointerEvent) => {
      if (e.pointerId !== claimedPointerId) return;
      claimedPointerId = null;
      if (marqueeDraft || lassoDraft) {
        selectPointerUp();
        return;
      }
      if (!guideDrag) return; // wand click: claimed, no drag phase
      const drag = guideDrag;
      guideDrag = null;
      const { px, py } = wrapPoint(e);
      // dropping back onto the origin ruler (or its parallel band) deletes
      const inBand = drag.axis === "x" ? px < RULER_PX : py < RULER_PX;
      if (drag.id === null) {
        if (!inBand) {
          addGuide(drag.axis, scenePos(drag.axis, px, py)); // one undo step
          // dragging a guide out while guides are hidden would write invisible
          // doc content — auto-show them instead (the PS convention)
          if (!getGuides().guides) toggleGuide("guides");
        }
      } else {
        if (inBand) removeGuide(drag.id, { transient: true });
        commitTransient(); // one undo step for the whole move (or removal)
      }
      applyToolMode();
      canvas.requestRenderAll();
    };
    const onGuidePointerCancel = (e: PointerEvent) => {
      if (e.pointerId !== claimedPointerId) return;
      claimedPointerId = null;
      marqueeDraft = null;
      lassoDraft = null;
      if (guideDrag) {
        const wasMove = guideDrag.id !== null;
        guideDrag = null;
        // keep the position the move reached — still exactly one undo step
        if (wasMove) commitTransient();
      }
      applyToolMode();
      canvas.requestRenderAll();
    };
    wrap.addEventListener("pointerdown", onGuidePointerDown, { capture: true });
    window.addEventListener("pointermove", onGuidePointerMove);
    window.addEventListener("pointerup", onGuidePointerUp);
    window.addEventListener("pointercancel", onGuidePointerCancel);

    // Draw pass: grid (when on) + the matched smart guides, in viewport space
    // on the top context. Skipped entirely when there's nothing to draw so the
    // top context stays fabric's own (rubber-band selector etc.).
    canvas.on("after:render", () => {
      const g = getGuides();
      const showGrid = g.grid;
      // separate-mode members (beyond the anchor, which wears the real chrome)
      // each get an independent overlay box, Affinity-style
      const activeObj = canvas.getActiveObject();
      const sepMembers =
        activeObj instanceof ActiveSelection && anchorStyled.has(activeObj)
          ? activeObj.getObjects().slice(1)
          : null;
      const ctx = canvas.contextTop;
      if (!ctx) return;
      // ALWAYS clear before deciding whether to draw — an early return here
      // leaves the previous frame's chrome as a frozen stain on the top canvas
      // (member boxes that "don't move", accumulating per deselect).
      canvas.clearContext(ctx);
      const doc = getSnapshot();
      const showRulers = g.rulers;
      const userGuides = doc && g.guides ? doc.guides : [];
      const pixelSel = getPixelSelection();
      if (
        !showGrid &&
        !activeGuides &&
        !dragBadge &&
        !sepMembers &&
        !liveStroke &&
        !showRulers &&
        !userGuides.length &&
        !guideDrag &&
        !pixelSel &&
        !marqueeDraft &&
        !lassoDraft
      ) {
        return;
      }
      if (!doc) return;
      const vt = canvas.viewportTransform;
      const z = vt[0];
      const sx = (x: number) => x * z + vt[4];
      const sy = (y: number) => y * z + vt[5];
      const css = getComputedStyle(document.documentElement);

      // Live freehand stroke — the exact outline the commit will produce,
      // filled in scene space under the viewport transform.
      if (liveStroke) {
        const s = getToolSettings().pieces;
        const d = outlineToPathD(
          strokeOutline(liveStroke.pts, freehandOptions(liveStroke.sub, s, liveStroke.simulate)),
        );
        if (d) {
          ctx.save();
          ctx.transform(z, 0, 0, z, vt[4], vt[5]);
          ctx.fillStyle = s.fill;
          ctx.fill(new Path2D(d));
          ctx.restore();
        }
      }

      if (showGrid) {
        ctx.save();
        ctx.strokeStyle = css.getPropertyValue("--foreground").trim() || "#000";
        ctx.globalAlpha = 0.12;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= doc.artboard.width; x += GRID_SIZE) {
          ctx.moveTo(sx(x), sy(0));
          ctx.lineTo(sx(x), sy(doc.artboard.height));
        }
        for (let y = 0; y <= doc.artboard.height; y += GRID_SIZE) {
          ctx.moveTo(sx(0), sy(y));
          ctx.lineTo(sx(doc.artboard.width), sy(y));
        }
        ctx.stroke();
        ctx.restore();
      }

      // Pixel selection: marching ants (white underlay + crawling black dash)
      // and the live marquee/lasso drafts, all in scene space under the
      // viewport transform so they track pan/zoom exactly.
      if (pixelSel || marqueeDraft || lassoDraft) {
        ctx.save();
        ctx.transform(z, 0, 0, z, vt[4], vt[5]);
        ctx.lineWidth = 1 / z;
        if (pixelSel) {
          ctx.strokeStyle = "#ffffff";
          ctx.stroke(pixelSel.outline);
          ctx.strokeStyle = "#000000";
          ctx.setLineDash([4 / z, 4 / z]);
          ctx.lineDashOffset = -antPhase / z;
          ctx.stroke(pixelSel.outline);
          ctx.setLineDash([]);
        }
        if (marqueeDraft || lassoDraft) {
          ctx.strokeStyle = css.getPropertyValue("--primary").trim() || "#3a7";
          ctx.setLineDash([4 / z, 4 / z]);
          if (marqueeDraft) {
            ctx.strokeRect(
              Math.min(marqueeDraft.x0, marqueeDraft.x1),
              Math.min(marqueeDraft.y0, marqueeDraft.y1),
              Math.abs(marqueeDraft.x1 - marqueeDraft.x0),
              Math.abs(marqueeDraft.y1 - marqueeDraft.y0),
            );
          }
          if (lassoDraft && lassoDraft.pts.length > 1) {
            ctx.beginPath();
            ctx.moveTo(lassoDraft.pts[0].x, lassoDraft.pts[0].y);
            for (const pt of lassoDraft.pts) ctx.lineTo(pt.x, pt.y);
            ctx.stroke();
          }
        }
        ctx.restore();
        // anchor the contextual popup under the selection bbox (wrap-relative)
        if (pixelSel) {
          const b = pixelSel.bounds;
          reportSelectionAnchor(
            Math.min(Math.max(sx(b.x + b.w / 2), 60), canvas.getWidth() - 60),
            Math.min(Math.max(sy(b.y + b.h) + 10, 30), canvas.getHeight() - 44),
          );
        }
      }

      // User guidelines — solid primary, full viewport span (smart guides stay
      // dashed-destructive so the two never read as the same thing). A guide
      // mid-drag over its delete band (the origin ruler) dims to signal it.
      if (userGuides.length || guideDrag) {
        const lines: { axis: "x" | "y"; pos: number; dragging: boolean }[] = userGuides.map(
          (gd) => ({ axis: gd.axis, pos: gd.pos, dragging: guideDrag?.id === gd.id }),
        );
        if (guideDrag && guideDrag.id === null) {
          lines.push({ axis: guideDrag.axis, pos: guideDrag.pos, dragging: true });
        }
        ctx.save();
        ctx.strokeStyle = css.getPropertyValue("--primary").trim() || "#3a7";
        ctx.lineWidth = 1;
        for (const line of lines) {
          const screen = Math.round(line.axis === "x" ? sx(line.pos) : sy(line.pos)) + 0.5;
          const overBand = line.dragging && screen < RULER_PX + GUIDE_GRAB_PX;
          ctx.globalAlpha = overBand ? 0.35 : line.dragging ? 0.8 : 1;
          ctx.beginPath();
          if (line.axis === "x") {
            ctx.moveTo(screen, 0);
            ctx.lineTo(screen, canvas.getHeight());
          } else {
            ctx.moveTo(0, screen);
            ctx.lineTo(canvas.getWidth(), screen);
          }
          ctx.stroke();
        }
        ctx.restore();

        // Gap-pills (backdrop sketch): while a guide drags, unit-less px
        // distances to its nearest neighbours (same-axis guides + artboard
        // edges) ride the pointer's cross-axis position — solid destructive
        // pills, white 9.5px bold tabular numerals (numbers = data).
        if (guideDrag) {
          const axis = guideDrag.axis;
          const pos = Math.round(guideDrag.pos);
          const extent = axis === "x" ? doc.artboard.width : doc.artboard.height;
          const cands = [0, extent, ...doc.guides.filter((gd) => gd.axis === axis && gd.id !== guideDrag?.id).map((gd) => gd.pos)];
          const below = Math.max(...cands.filter((c) => c < pos), -Infinity);
          const above = Math.min(...cands.filter((c) => c > pos), Infinity);
          const toScreen = axis === "x" ? sx : sy;
          const cross = Math.min(
            Math.max(guideDrag.cross, RULER_PX + 16),
            (axis === "x" ? canvas.getHeight() : canvas.getWidth()) - 16,
          );
          ctx.save();
          ctx.font = 'bold 9.5px "iA Writer Quattro", ui-monospace, monospace';
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          for (const neighbour of [below, above]) {
            if (!Number.isFinite(neighbour)) continue;
            const gap = Math.abs(pos - neighbour);
            if (gap < 1) continue;
            const text = String(gap);
            const mid = (toScreen(pos) + toScreen(neighbour)) / 2;
            const w = ctx.measureText(text).width + 10;
            const h = 14;
            const bx = axis === "x" ? mid : cross;
            const by = axis === "x" ? cross : mid;
            ctx.fillStyle = css.getPropertyValue("--destructive").trim() || "#c33";
            ctx.fillRect(bx - w / 2, by - h / 2, w, h);
            ctx.fillStyle = "#ffffff";
            ctx.fillText(text, bx, by + 0.5);
          }
          ctx.restore();
        }
      }

      if (activeGuides) {
        // smart guides read dashed-destructive per the backdrop sketch
        ctx.save();
        ctx.strokeStyle = css.getPropertyValue("--destructive").trim() || "#c33";
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const x of activeGuides.v) {
          ctx.moveTo(sx(x), 0);
          ctx.lineTo(sx(x), canvas.getHeight());
        }
        for (const y of activeGuides.h) {
          ctx.moveTo(0, sy(y));
          ctx.lineTo(canvas.getWidth(), sy(y));
        }
        ctx.stroke();
        ctx.restore();
      }

      if (sepMembers) {
        // fresh corners each frame (calcACoords skips the setCoords cache, so
        // the boxes track mid-gesture without extra bookkeeping). NOTE: a
        // grouped object's aCoords live in its PARENT plane (v7 coordinate
        // model) — i.e. selection-relative here — so compose with the
        // selection's matrix to reach scene coords, or the boxes render as
        // origin-anchored phantoms.
        const selMatrix = (activeObj as ActiveSelection).calcTransformMatrix();
        ctx.save();
        ctx.strokeStyle = css.getPropertyValue("--primary").trim() || "#3a7";
        ctx.lineWidth = 1;
        for (const child of sepMembers) {
          const c = child.calcACoords();
          const pts = [c.tl, c.tr, c.br, c.bl].map((p) => fabricUtil.transformPoint(p, selMatrix));
          // a member fully OUTSIDE the artboard renders as nothing (the canvas
          // clip) — dash + dim its box so it reads as "selected, but off-canvas"
          // instead of a phantom rectangle
          const xs2 = pts.map((p) => p.x);
          const ys2 = pts.map((p) => p.y);
          const offCanvas =
            Math.max(...xs2) < 0 ||
            Math.min(...xs2) > doc.artboard.width ||
            Math.max(...ys2) < 0 ||
            Math.min(...ys2) > doc.artboard.height;
          ctx.setLineDash(offCanvas ? [3, 3] : []);
          ctx.globalAlpha = offCanvas ? 0.5 : 1;
          ctx.beginPath();
          ctx.moveTo(sx(pts[0].x), sy(pts[0].y));
          ctx.lineTo(sx(pts[1].x), sy(pts[1].y));
          ctx.lineTo(sx(pts[2].x), sy(pts[2].y));
          ctx.lineTo(sx(pts[3].x), sy(pts[3].y));
          ctx.closePath();
          ctx.stroke();
        }
        ctx.restore();
      }

      if (dragBadge) {
        // the sketch's dimbadge as a cursor-following pill (offset below-right,
        // flipping inside the viewport at the edges)
        const t = dragBadge.target;
        let text: string;
        if (dragBadge.kind === "move") {
          const c = t.getCenterPoint();
          text = `X ${Math.round(c.x)}  Y ${Math.round(c.y)}`;
        } else if (dragBadge.kind === "scale") {
          text = `${Math.round(t.getScaledWidth())} × ${Math.round(t.getScaledHeight())}`;
        } else {
          text = `${Math.round(((t.angle % 360) + 360) % 360)}°`;
        }
        ctx.save();
        ctx.font = '10.5px "iA Writer Quattro", ui-monospace, monospace';
        const w = ctx.measureText(text).width + 14;
        const h = 17;
        let bx = dragBadge.px + 14;
        let by = dragBadge.py + 18;
        if (bx + w > canvas.getWidth() - 2) bx = dragBadge.px - 14 - w;
        if (by + h > canvas.getHeight() - 2) by = dragBadge.py - 18 - h;
        ctx.fillStyle = css.getPropertyValue("--primary").trim() || "#3a7";
        ctx.fillRect(bx, by, w, h);
        ctx.fillStyle = css.getPropertyValue("--primary-foreground").trim() || "#fff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, bx + w / 2, by + h / 2 + 1);
        ctx.restore();
      }

      // Rulers — LAST so they overpaint guide/grid ends. 22px cream bands with
      // hairline inner edges (backdrop sketch); ticks + labels are scene units
      // through the live viewport (nice 1/2/5 steps, majors labelled). The
      // sketch's static strip has no labels; muted 9px Quattro tabular-nums is
      // its documented headroom convention.
      if (showRulers) {
        const W = canvas.getWidth();
        const H = canvas.getHeight();
        const bg = css.getPropertyValue("--background").trim() || "#fff";
        const border = css.getPropertyValue("--border").trim() || "#ccc";
        const muted = css.getPropertyValue("--muted-foreground").trim() || "#888";
        ctx.save();
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, RULER_PX);
        ctx.fillRect(0, 0, RULER_PX, H);
        const major = niceStep(60 / z);
        const minor = major / 5;
        ctx.strokeStyle = border;
        ctx.lineWidth = 1;
        ctx.beginPath();
        // horizontal ruler (scene x): ticks grow up from the band's inner edge
        const iX0 = Math.ceil((RULER_PX - vt[4]) / z / minor);
        const iX1 = Math.floor((W - vt[4]) / z / minor);
        for (let i = iX0; i <= iX1; i++) {
          const px = Math.round(sx(i * minor)) + 0.5;
          const isMajor = i % 5 === 0;
          ctx.moveTo(px, RULER_PX);
          ctx.lineTo(px, RULER_PX - (isMajor ? 12 : 6));
        }
        // vertical ruler (scene y)
        const iY0 = Math.ceil((RULER_PX - vt[5]) / z / minor);
        const iY1 = Math.floor((H - vt[5]) / z / minor);
        for (let i = iY0; i <= iY1; i++) {
          const py = Math.round(sy(i * minor)) + 0.5;
          const isMajor = i % 5 === 0;
          ctx.moveTo(RULER_PX, py);
          ctx.lineTo(RULER_PX - (isMajor ? 12 : 6), py);
        }
        // inner hairlines + corner box
        ctx.moveTo(0, RULER_PX - 0.5);
        ctx.lineTo(W, RULER_PX - 0.5);
        ctx.moveTo(RULER_PX - 0.5, 0);
        ctx.lineTo(RULER_PX - 0.5, H);
        ctx.stroke();
        // labels on majors (numbers = data, not copy)
        ctx.fillStyle = muted;
        ctx.font = '9px "iA Writer Quattro", ui-monospace, monospace';
        ctx.textBaseline = "top";
        ctx.textAlign = "left";
        // majors are integer multiples of `major` — round away i*minor float dust
        for (let i = Math.ceil(iX0 / 5) * 5; i <= iX1; i += 5) {
          ctx.fillText(String(Math.round(i * minor)), Math.round(sx(i * minor)) + 3, 2);
        }
        for (let i = Math.ceil(iY0 / 5) * 5; i <= iY1; i += 5) {
          const py = Math.round(sy(i * minor));
          ctx.save();
          ctx.translate(2, py - 3);
          ctx.rotate(-Math.PI / 2);
          ctx.fillText(String(Math.round(i * minor)), 0, 0);
          ctx.restore();
        }
        ctx.restore();
      }
    });

    // Toggling grid/snap re-renders immediately (grid shows/hides).
    const unsubscribeGuides = subscribeGuides(() => canvas.requestRenderAll());
    // Toggling Group/Separate swaps a live multi-selection's layout + overlay.
    const unsubscribeToolSettings = subscribeToolSettings(() => {
      applySelection();
      canvas.requestRenderAll();
    });

    // Store → canvas: reflect the selection store onto the canvas. id-equality
    // guards on both sides keep this from looping with the events above.
    const unsubscribeSelection = subscribeSelection(applySelection);

    // M4: picked colours flow to the pieces fill setting + the active
    // shape/freehand layer's fill (one-way; see colour-sink.ts).
    const stopColourSink = startColourSink();

    // Dev-only debug rig for selection-chrome bugs — console + automation.
    // window.__substrata.{selection, layers, select, setSeparate} (dev builds only).
    if (process.env.NODE_ENV !== "production") {
      const toScreen = (x: number, y: number) => {
        const vt = canvas.viewportTransform;
        return { x: x * vt[0] + vt[4], y: y * vt[3] + vt[5] };
      };
      (window as unknown as Record<string, unknown>).__substrata = {
        selection: () => {
          const a = canvas.getActiveObject();
          return {
            active: a?.constructor.name,
            box: a && { left: a.left, top: a.top, width: a.width, height: a.height, angle: a.angle },
            children:
              a instanceof ActiveSelection
                ? a.getObjects().map((o) => ({
                    id: getLayerIdForObject(o),
                    left: o.left,
                    top: o.top,
                    angle: o.angle,
                    scaleX: o.scaleX,
                    scaleY: o.scaleY,
                    skewX: o.skewX,
                    aCoords: o.calcACoords(),
                  }))
                : null,
          };
        },
        layers: () => {
          const doc = getSnapshot();
          if (!doc) return [];
          return leafRenderList(doc.layers).map((e) => {
            const obj = state.byId.get(e.layer.id);
            const c = obj?.getCenterPoint();
            return {
              id: e.layer.id,
              kind: e.layer.kind,
              name: e.layer.name,
              parent: parentIdOf(doc.layers, e.layer.id) ?? null, // layers-tree QA: shows nesting
              scene: c && { x: c.x, y: c.y },
              screen: c && toScreen(c.x, c.y),
              filters: e.layer.filters.map((f) => f.type),
            };
          });
        },
        select: (ids: string[]) => setSelection(ids),
        setSeparate: (v: boolean) => setTransformAsGroup(!v),
        upperCanvasCount: () => document.querySelectorAll("canvas.upper-canvas").length,
        vt: () => canvas.viewportTransform,
        menuState: () => getLayerMenu(),
        hitTest: (x: number, y: number) => {
          const info = canvas.findTarget(new MouseEvent("contextmenu", { clientX: x, clientY: y }));
          return {
            target: info.target?.constructor.name ?? null,
            layerId: info.target ? getLayerIdForObject(info.target) ?? null : null,
          };
        },
        // M3 filter QA: add a filter to a layer's stack + sample a rendered
        // pixel (screen-space px) off the lower canvas.
        fx: (layerId: string, type: string, params?: Record<string, number | string>) =>
          addFx(layerId, "filters", type, params),
        fxParam: (layerId: string, fxId: string, key: string, value: number | string, transient?: boolean) =>
          setFxParam(layerId, "filters", fxId, key, value, { transient }),
        // M2-7 PIECES QA: drive the tool + settings the drag-to-draw reads.
        setTool: (tool: ToolId, sub?: string) => {
          setActiveTool(tool);
          if (sub) setActiveSub(tool, sub);
        },
        toolSettings: (tool: "move" | "select" | "text" | "pieces", patch: object) =>
          updateToolSettings(tool, patch),
        shapeParams: setShapeParams,
        textProps: setTextProps,
        // layers-tree QA: drive reparenting/grouping/opacity ops directly
        moveLayer,
        groupLayers,
        setOpacity,
        // text-props QA: raw object-level typography off the doc (absent = default)
        textDump: (id: string) => {
          const doc = getSnapshot();
          const l = doc ? findLayer(doc.layers, id) : null;
          return l && l.kind === "text"
            ? { align: l.align, lineHeight: l.lineHeight, charSpacing: l.charSpacing, direction: l.direction }
            : null;
        },
        // M4 colour QA: drive the picker store (flows through the sink).
        colour: setHex,
        // M3 effects QA: same pair over the effects[] stack.
        effect: (layerId: string, type: string, params?: Record<string, number | string>) =>
          addFx(layerId, "effects", type, params),
        effectParam: (layerId: string, fxId: string, key: string, value: number | string, transient?: boolean) =>
          setFxParam(layerId, "effects", fxId, key, value, { transient }),
        gesture: { begin: beginTransient, commit: commitTransient },
        // rulers pass QA: dump the doc's guides + flip the workspace prefs
        toggleGuidePref: toggleGuide,
        // SELECT QA: author a raster layer through the real import pipeline
        // (drawn rects in one canvas → File → importImageFile) so extract/cut
        // have a raster to act on headlessly
        addRaster: async (
          w: number,
          h: number,
          rects: { x: number; y: number; w: number; h: number; colour: string }[],
          at?: { x: number; y: number },
        ) => {
          const c = document.createElement("canvas");
          c.width = w;
          c.height = h;
          const cctx = c.getContext("2d")!;
          for (const r of rects) {
            cctx.fillStyle = r.colour;
            cctx.fillRect(r.x, r.y, r.w, r.h);
          }
          const blob = await new Promise<Blob>((res, rej) =>
            c.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png"),
          );
          await importImageFile(new File([blob], "test.png", { type: "image/png" }), at ? { at } : undefined);
        },
        // M3-15 QA: rasterize a layer through the real bake pipeline
        rasterize: rasterizeLayer,
        // M5 QA: .substrata round-trip without file pickers (bytes in/out)
        packScene: async () => {
          const doc = getSnapshot();
          if (!doc) return null;
          const blob = await packSubstrata(doc);
          return Array.from(new Uint8Array(await blob.arrayBuffer()));
        },
        unpackScene: async (bytes: number[]) => {
          setDoc(await unpackSubstrata(new Uint8Array(bytes).buffer));
        },
        // SELECT QA: dump the pixel selection + drive the ops directly
        pixelSelection: () => {
          const s = getPixelSelection();
          return s && { epoch: s.epoch, bounds: s.bounds, area: maskArea(s.mask) };
        },
        selectOps: {
          invert: () => {
            const doc = getSnapshot();
            if (doc) invertSelection(doc.artboard.width, doc.artboard.height);
          },
          grow: () => growSelection(),
          shrink: () => shrinkSelection(),
          extract: () => extractSelection(),
          cut: () => cutSelection(),
          deselect: () => clearPixelSelection(),
        },
        guides: () => getSnapshot()?.guides ?? [],
        // sample a top-context (overlay) pixel — rulers/guides draw there,
        // not on the lower canvas samplePixel reads
        sampleTop: (sxp: number, syp: number) => {
          const dpr = window.devicePixelRatio || 1;
          return Array.from(
            canvas.contextTop.getImageData(Math.round(sxp * dpr), Math.round(syp * dpr), 1, 1).data,
          );
        },
        // M6 export QA: the pure clamp maths + run the full pipeline headlessly
        // (no download) and report the blob's vitals + a decoded pixel probe.
        resolveDims: resolveExportDims,
        exportBlob: async (opts?: Partial<ExportOptions>, probeAt?: [number, number][]) => {
          const outcome: ExportOutcome = await runExport(
            { format: "png", scale: 1, quality: 90, scope: "artboard", ...opts },
            { download: false },
          );
          if (!outcome.ok) return { ok: false, reason: outcome.reason };
          // decode the produced blob and sample RGBA at fractional coords
          const probe: number[][] = [];
          try {
            const bitmap = await createImageBitmap(outcome.blob);
            const c = document.createElement("canvas");
            c.width = bitmap.width;
            c.height = bitmap.height;
            const ctx = c.getContext("2d", { willReadFrequently: true })!;
            ctx.drawImage(bitmap, 0, 0);
            bitmap.close();
            for (const [fx, fy] of probeAt ?? [[0.005, 0.005], [0.5, 0.5]]) {
              const x = Math.round(fx * (c.width - 1));
              const y = Math.round(fy * (c.height - 1));
              probe.push(Array.from(ctx.getImageData(x, y, 1, 1).data));
            }
          } catch {
            // jxl blobs aren't browser-decodable — vitals only
          }
          return {
            ok: true,
            size: outcome.blob.size,
            type: outcome.blob.type,
            width: outcome.width,
            height: outcome.height,
            effectiveScale: outcome.effectiveScale,
            downscaled: outcome.downscaled,
            filename: outcome.filename,
            probe,
          };
        },
        samplePixel: (sx: number, sy: number) => {
          const dpr = window.devicePixelRatio || 1;
          return Array.from(
            canvas.getContext().getImageData(Math.round(sx * dpr), Math.round(sy * dpr), 1, 1).data,
          );
        },
        // Preview-downscale probe: the rendered element's size vs the original's
        // (they differ exactly while a filter gesture renders the ≤1.5 MP proxy).
        elementSizes: (layerId: string) => {
          const o = state.byId.get(layerId) as unknown as {
            _element?: { width: number; height: number };
            _originalElement?: { width: number; height: number };
          };
          return {
            element: o?._element && [o._element.width, o._element.height],
            original: o?._originalElement && [o._originalElement.width, o._originalElement.height],
          };
        },
      };
    }

    const unsubscribe = subscribe(render);
    // LUT strips load async — re-render when one arrives so its look pops in
    // (filter-sync's signature carries the epoch).
    const unsubscribeLuts = subscribeLuts(render);
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

    // Right-click → context menu (Ruby 2026-07-03), via Fabric's own
    // contextmenu canvas event (it hit-tests once and hands us the target). A
    // hit inside the current selection keeps it (menu acts on all), any other
    // layer becomes the selection; blank space opens the CANVAS menu with the
    // scene point (paste/place land there). Native menu suppressed either way.
    canvas.on("contextmenu", ({ e, target }) => {
      e.preventDefault();
      const me = e as MouseEvent;
      if (!target) {
        const scene = canvas.getScenePoint(me);
        openCanvasMenu(me.clientX, me.clientY, { x: scene.x, y: scene.y });
        return;
      }
      // a live multi-selection hit → menu on the whole selection
      if (target === canvas.getActiveObject() && target instanceof ActiveSelection) {
        openLayerMenu(me.clientX, me.clientY, getSelectedLayerIds());
        return;
      }
      const layerId = getLayerIdForObject(target);
      if (!layerId) return;
      const ids = getSelectedLayerIds();
      if (!ids.includes(layerId)) {
        setSelection([layerId]);
        openLayerMenu(me.clientX, me.clientY, [layerId]);
      } else {
        openLayerMenu(me.clientX, me.clientY, ids);
      }
    });

    return () => {
      cancelled = true;
      stopAutosave?.();
      unsubscribePersistence();
      unsubscribe();
      unsubscribeLuts();
      unsubscribeSelection();
      unsubscribeTool();
      stopColourSink();
      unsubscribeGuides();
      unsubscribeToolSettings();
      themeObserver.disconnect();
      if (antTimer !== null) window.clearInterval(antTimer);
      unsubscribePixelSelection();
      delete (window as unknown as Record<string, unknown>).__substrata;
      registerViewportController(null);
      registerExportRenderer(null);
      registerLayerBaker(null);
      ro.disconnect();
      // an unmount mid guide-move must not leak the open transient — commit it
      // (still one undo step) so isGestureActive() can't stay true forever
      if (guideDrag?.id) commitTransient();
      guideDrag = null;
      wrap.removeEventListener("pointerdown", onGuidePointerDown, { capture: true });
      window.removeEventListener("pointermove", onGuidePointerMove);
      window.removeEventListener("pointerup", onGuidePointerUp);
      window.removeEventListener("pointercancel", onGuidePointerCancel);
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
