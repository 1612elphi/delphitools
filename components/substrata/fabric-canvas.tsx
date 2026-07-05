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
import { createEmptyDoc, createShapeLayer } from "@/lib/substrata/doc-model";
import type { Artboard, ShapeLayer, SubstrataDoc, Transform } from "@/lib/substrata/doc-model";
import { createReconcileState, reconcile, getLayerIdForObject } from "@/lib/substrata/sync";
import { initSubstrataFilterBackend } from "@/lib/substrata/filter-backend";
import { importImageFile } from "@/lib/substrata/import-raster";
import { setTransform, setTransforms } from "@/lib/substrata/layer-ops";
import { addFx, setFxParam } from "@/lib/substrata/fx-ops";
import { collectIds, findLayer, leafLayers, leafRenderList } from "@/lib/substrata/layer-tree";
import {
  getSelectedLayerIds,
  pruneSelection,
  setSelection,
  subscribeSelection,
} from "@/lib/substrata/selection";
import { loadLatestProject, startAutosave, persistAll, clearPersistedData } from "@/lib/substrata/autosave";
import { getPersistenceEnabled, subscribePersistence } from "@/lib/substrata/persistence-pref";
import { GRID_SIZE, getGuides, subscribeGuides } from "@/lib/substrata/guides-pref";
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
  buildDraggedShape,
  SHAPE_NAMES,
  strokeForNewShape,
  upsertLayerTransient,
  type Pt,
} from "@/lib/substrata/draw-shape";
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
        applyToolMode(); // restore the ACTIVE tool's targeting/cursor, not MOVE's
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // ── tool modes ────────────────────────────────────────────────────────────
    // PIECES+Primitives is a DRAWING mode: pointer drags author shapes instead
    // of grabbing objects (skipTargetFind) or rubber-banding (selection=false).
    // Every other tool keeps MOVE-style interaction (stub tools set state only).
    const drawModeActive = () =>
      getActiveTool() === "pieces" && getActiveSubs().pieces === "primitives";
    const applyToolMode = () => {
      const draw = drawModeActive();
      canvas.skipTargetFind = draw || spaceHeld;
      canvas.selection = !draw;
      setCanvasCursor(draw ? "crosshair" : spaceHeld ? "grab" : "");
    };
    const unsubscribeTool = subscribeTool(applyToolMode);
    applyToolMode();

    // ── PIECES drag-to-draw (M2-7) ────────────────────────────────────────────
    // One transient gesture per drag: the layer is created on the first move
    // past the threshold, reshaped live, committed as ONE undo step on release.
    // A click without a drag creates nothing (commitTransient sees no change).
    let draft: { start: Pt; layer: ShapeLayer | null } | null = null;
    canvas.on("mouse:down", (opt) => {
      if (spaceHeld || panning || !drawModeActive()) return;
      draft = { start: canvas.getScenePoint(opt.e), layer: null };
      beginTransient();
    });
    canvas.on("mouse:move", (opt) => {
      if (!draft) return;
      const s = getToolSettings().pieces;
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
            name: SHAPE_NAMES[s.shape],
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
      if (!showGrid && !activeGuides && !dragBadge && !sepMembers) return;
      const doc = getSnapshot();
      if (!doc) return;
      const vt = canvas.viewportTransform;
      const z = vt[0];
      const sx = (x: number) => x * z + vt[4];
      const sy = (y: number) => y * z + vt[5];
      const css = getComputedStyle(document.documentElement);

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
              name: e.layer.name,
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
        // M3 effects QA: same pair over the effects[] stack.
        effect: (layerId: string, type: string, params?: Record<string, number | string>) =>
          addFx(layerId, "effects", type, params),
        effectParam: (layerId: string, fxId: string, key: string, value: number | string, transient?: boolean) =>
          setFxParam(layerId, "effects", fxId, key, value, { transient }),
        gesture: { begin: beginTransient, commit: commitTransient },
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
      unsubscribeGuides();
      unsubscribeToolSettings();
      themeObserver.disconnect();
      delete (window as unknown as Record<string, unknown>).__substrata;
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
