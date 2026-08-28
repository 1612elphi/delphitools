import Component from '@glimmer/component';
import { modifier } from 'ember-modifier';
import {
	ActiveSelection,
	Canvas,
	FitContentLayout,
	InteractiveFabricObject,
	LayoutManager,
	Point,
	controlsUtils,
	util as fabricUtil,
} from 'fabric';
import type {
	FabricObject,
	LayoutStrategyResult,
	StrictLayoutContext,
} from 'fabric';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import {
	getSnapshot,
	subscribe,
	setDoc,
	beginTransient,
	commitTransient,
	rollbackTransient,
	canUndo,
} from 'delphitools-v2/lib/substrata/doc-store';
import {
	registerViewportController,
	reportZoom,
} from 'delphitools-v2/lib/substrata/viewport';
import {
	createEmptyDoc,
	createFreehandLayer,
	createShapeLayer,
	createTextLayer,
	identityTransform,
} from 'delphitools-v2/lib/substrata/doc-model';
import type {
	Artboard,
	CropRect,
	ShapeLayer,
	SubstrataDoc,
	Transform,
} from 'delphitools-v2/lib/substrata/doc-model';
import {
	bakeLayerObject,
	createReconcileState,
	reconcile,
	getLayerIdForObject,
	renderExport,
} from 'delphitools-v2/lib/substrata/sync';
import { registerExportRenderer } from 'delphitools-v2/lib/substrata/export-source';
import {
	runExport,
	type ExportOutcome,
} from 'delphitools-v2/lib/substrata/export-run';
import {
	resolveExportDims,
	type ExportOptions,
} from 'delphitools-v2/lib/substrata/export-core';
import { initSubstrataFilterBackend } from 'delphitools-v2/lib/substrata/filter-backend';
import { importImageFile } from 'delphitools-v2/lib/substrata/import-raster';
import {
	deleteLayers,
	groupLayers,
	moveLayer,
	setCrop,
	setOpacity,
	setShapeParams,
	setTextProps,
	setTransform,
	setTransforms,
} from 'delphitools-v2/lib/substrata/layer-ops';
import { layerDims } from 'delphitools-v2/lib/substrata/shape-geometry';
import { SubstrataText } from 'delphitools-v2/lib/substrata/text-object';
import { styleFields } from 'delphitools-v2/lib/substrata/text-style';
import { addFx, setFxParam } from 'delphitools-v2/lib/substrata/fx-ops';
import {
	collectIds,
	findLayer,
	leafLayers,
	leafRenderList,
	parentIdOf,
} from 'delphitools-v2/lib/substrata/layer-tree';
import {
	getActiveLayerId,
	getSelectedLayerIds,
	pruneSelection,
	setSelection,
	subscribeSelection,
} from 'delphitools-v2/lib/substrata/selection';
import {
	loadLatestProject,
	startAutosave,
	persistAll,
	clearPersistedData,
} from 'delphitools-v2/lib/substrata/autosave';
import {
	getPersistenceEnabled,
	subscribePersistence,
} from 'delphitools-v2/lib/substrata/persistence-pref';
import {
	GRID_SIZE,
	getGuides,
	subscribeGuides,
	toggleGuide,
} from 'delphitools-v2/lib/substrata/guides-pref';
import {
	addGuide,
	removeGuide,
	setGuidePos,
} from 'delphitools-v2/lib/substrata/guide-ops';
import { presetShape } from 'delphitools-v2/lib/substrata/preset-shapes';
import {
	packSubstrata,
	unpackSubstrata,
} from 'delphitools-v2/lib/substrata/substrata-file';
import {
	registerLayerBaker,
	rasterizeLayer,
} from 'delphitools-v2/lib/substrata/rasterize-ops';
import {
	floodMask,
	globalMask,
	maskArea,
	polygonMask,
	rectMask,
	snapToEdge,
	sobelField,
} from 'delphitools-v2/lib/substrata/select-mask';
import {
	clearPixelSelection,
	getPixelSelection,
	setPixelSelectionMask,
	subscribePixelSelection,
} from 'delphitools-v2/lib/substrata/pixel-selection';
import {
	cutSelection,
	extractSelection,
	growSelection,
	invertSelection,
	shrinkSelection,
} from 'delphitools-v2/lib/substrata/select-ops';
import { reportSelectionAnchor } from 'delphitools-v2/components/substrata/selection-popup';
import { toast } from 'delphitools-v2/lib/substrata/toast';
import { subscribeLuts } from 'delphitools-v2/lib/substrata/lut-data';
import {
	getMatte,
	getMatteStatus,
	putMatte,
	subscribeMattes,
} from 'delphitools-v2/lib/substrata/bg-removal';
import { resizeArtboardReflow } from 'delphitools-v2/lib/substrata/artboard-ops';
import { openModal } from 'delphitools-v2/lib/substrata/modal';
import { isOnboardingSeen } from 'delphitools-v2/lib/substrata/onboarding-pref';
import {
	getLayerMenu,
	openCanvasMenu,
	openLayerMenu,
} from 'delphitools-v2/lib/substrata/context-menu';
import {
	getToolSettings,
	setTransformAsGroup,
	subscribeToolSettings,
	updateToolSettings,
} from 'delphitools-v2/lib/substrata/tool-settings';
import {
	getActiveSubs,
	getActiveTool,
	setActiveSub,
	setActiveTool,
	subscribeTool,
	type ToolId,
} from 'delphitools-v2/lib/substrata/tool';
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
} from 'delphitools-v2/lib/substrata/draw-shape';
import {
	centreRawPoints,
	outlineToPathD,
	strokeOutline,
	type RawPoint,
} from 'delphitools-v2/lib/substrata/freehand';
import { startColourSink } from 'delphitools-v2/lib/substrata/colour-sink';
import { setHex } from 'delphitools-v2/lib/substrata/colour-store';
import {
	buildSnapField,
	computeSnap,
	type SnapBox,
} from 'delphitools-v2/lib/substrata/snap-engine';


// fabric serialization key
class AnchorBoxLayout extends FitContentLayout {
	calcBoundingBox(
		objects: FabricObject[],
		context: StrictLayoutContext,
	): LayoutStrategyResult | undefined {
		const first = objects[0];
		return super.calcBoundingBox(
			first ? [first] : objects,
			context,
		);
	}
}

const RULER_PX = 22;

interface Inset {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

function chromeInset(wrap: HTMLElement, rulers: boolean): Inset {
	const inset: Inset = {
		top: rulers ? RULER_PX : 0,
		right: 0,
		bottom: 0,
		left: rulers ? RULER_PX : 0,
	};
	const area = wrap.closest('.sub-shell-canvas-area');
	const docks =
		area?.querySelectorAll('.sub-omni-dock, .sub-omni-rail-dock') ??
		[];
	for (const dock of docks) {
		const r = dock.getBoundingClientRect();
		if (dock.classList.contains('is-top'))
			inset.top = Math.max(inset.top, r.height);
		else if (dock.classList.contains('is-bottom'))
			inset.bottom = Math.max(inset.bottom, r.height);
		else if (dock.classList.contains('is-left'))
			inset.left = Math.max(inset.left, r.width);
		else if (dock.classList.contains('is-right'))
			inset.right = Math.max(inset.right, r.width);
	}
	return inset;
}

function fitView(canvas: Canvas, artboard: Artboard, inset: Inset): void {
	const pad = 0.92;
	const cap = (a: number, b: number, size: number): [number, number] => {
		const total = a + b;
		const max = size * 0.8;
		if (total <= max) return [a, b];
		return [(a / total) * max, (b / total) * max];
	};
	const [left, right] = cap(inset.left, inset.right, canvas.getWidth());
	const [top, bottom] = cap(inset.top, inset.bottom, canvas.getHeight());
	const w = Math.max(1, canvas.getWidth() - left - right);
	const h = Math.max(1, canvas.getHeight() - top - bottom);
	const z = Math.min(w / artboard.width, h / artboard.height) * pad;
	const tx = left + (w - artboard.width * z) / 2;
	const ty = top + (h - artboard.height * z) / 2;
	canvas.setViewportTransform([z, 0, 0, z, tx, ty]);
}

// fabric 7.4 internals
interface FabricInternals {
	_currentTransform?: {
		target?: FabricObject;
		original?: Record<string, unknown>;
		actionPerformed?: boolean;
	} | null;
	mainTouchId?: number;
	_onTouchEnd(e: TouchEvent): void;
	_onMouseMove(e: Event): void;
}

export default class FabricCanvas extends Component {
	paste = (file: File) => void importImageFile(file);

	mount = modifier((wrap: HTMLDivElement) => {
		const el = wrap.querySelector('canvas');
		const dropHint = wrap.querySelector<HTMLDivElement>(
			'.sub-canvas-drop-hint',
		);
		if (!el) return;

		const canvas = new Canvas(el, {
			selection: true,
			preserveObjectStacking: true,
			// show controls above clip
			controlsAboveOverlay: true,
			...(import.meta.env.DEV &&
			new URLSearchParams(window.location.search).has('dpr1')
				? { enableRetinaScaling: false }
				: {}),
		});
		initSubstrataFilterBackend();
		const state = createReconcileState();
		let maskDocId: string | null = null;

		const sharedControls =
			controlsUtils.createObjectDefaultControls();
		sharedControls.mtr.render = controlsUtils.renderCircleControl;
		const applySelectionChrome = () => {
			const css = getComputedStyle(document.documentElement);
			const primary = css
				.getPropertyValue('--primary')
				.trim();
			const paper = css
				.getPropertyValue('--background')
				.trim();
			const chrome = {
				transparentCorners: false,
				cornerStyle: 'rect' as const,
				cornerSize: 8,
				cornerColor: paper,
				cornerStrokeColor: primary,
				borderColor: primary,
				borderScaleFactor: 1.5,
			};
			Object.assign(
				InteractiveFabricObject.ownDefaults,
				chrome,
				{
					controls: sharedControls,
				},
			);
			for (const [id, obj] of state.byId) {
				if (id !== '__artboard__') obj.set(chrome);
			}
			canvas.selectionColor = `color-mix(in oklch, ${primary} 10%, transparent)`;
			canvas.selectionBorderColor = primary;
			canvas.selectionLineWidth = 1;
			canvas.requestRenderAll();
		};
		applySelectionChrome();
		// avoid per-frame style reads
		let themeInk: {
			foreground: string;
			primary: string;
			primaryFg: string;
			destructive: string;
			background: string;
			border: string;
			mutedFg: string;
		} | null = null;
		const readThemeInk = () => {
			const css = getComputedStyle(document.documentElement);
			const v = (name: string, fallback: string) =>
				css.getPropertyValue(name).trim() || fallback;
			return {
				foreground: v('--foreground', '#000'),
				primary: v('--primary', '#3a7'),
				primaryFg: v('--primary-foreground', '#fff'),
				destructive: v('--destructive', '#c33'),
				background: v('--background', '#fff'),
				border: v('--border', '#ccc'),
				mutedFg: v('--muted-foreground', '#888'),
			};
		};
		const themeObserver = new MutationObserver(() => {
			themeInk = null;
			applySelectionChrome();
		});
		themeObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['class'],
		});

		// suppress selection echo
		let squelchSelectionEvents = false;

				const selectedLeafObjects = (): FabricObject[] => {
			const doc = getSnapshot();
			if (!doc) return [];
			const effective = new Map(
				leafRenderList(doc.layers).map((e) => [
					e.layer.id,
					e,
				]),
			);
			const out: FabricObject[] = [];
			for (const id of getSelectedLayerIds()) {
				const layer = findLayer(doc.layers, id);
				if (!layer) continue;
				for (const leaf of leafLayers(layer)) {
					const entry = effective.get(leaf.id);
					if (
						!entry ||
						!entry.visible ||
						entry.locked
					)
						continue;
					const obj = state.byId.get(leaf.id);
					if (obj && !out.includes(obj))
						out.push(obj);
				}
			}
			return out;
		};

		const anchorStyled = new WeakSet<ActiveSelection>();

		const applySelection = () => {
			const objs = selectedLeafObjects();
			const current = canvas.getActiveObjects();
			const active = canvas.getActiveObject();
			const separate = !getToolSettings().transformAsGroup;
			const sameSet =
				objs.length === current.length &&
				objs.every((o) => current.includes(o));
			// preserve active fabric selection
			if (
				sameSet &&
				active instanceof ActiveSelection &&
				anchorStyled.has(active) !== separate
			) {
				active.layoutManager = new LayoutManager(
					separate
						? new AnchorBoxLayout()
						: new FitContentLayout(),
				);
				if (separate) anchorStyled.add(active);
				else anchorStyled.delete(active);
				active.triggerLayout();
				active.setCoords();
				canvas.requestRenderAll();
				return;
			}
			if (sameSet) return;
			squelchSelectionEvents = true;
			try {
				const only = objs[0];
				if (objs.length === 0) {
					if (active)
						canvas.discardActiveObject();
				} else if (objs.length === 1 && only) {
					canvas.setActiveObject(only);
				} else {
					const as = new ActiveSelection(objs, {
						canvas,
						...(separate
							? {
									layoutManager:
										new LayoutManager(
											new AnchorBoxLayout(),
										),
								}
							: {}),
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
			// selection uses relative coordinates
			if (
				canvas.getActiveObject() instanceof
				ActiveSelection
			) {
				squelchSelectionEvents = true;
				try {
					canvas.discardActiveObject();
				} finally {
					squelchSelectionEvents = false;
				}
			}
			reconcile(canvas, doc, state);
			pruneSelection(new Set(collectIds(doc.layers)));
			const pxSel = getPixelSelection();
			if (
				pxSel &&
				(pxSel.mask.width !== doc.artboard.width ||
					pxSel.mask.height !==
						doc.artboard.height ||
					doc.id !== maskDocId)
			) {
				clearPixelSelection();
			}
			maskDocId = doc.id;
			applySelection();
		};

		let cycleStep = -1;
		let cycleAnchor = 1;
		const resetCycle = () => {
			cycleStep = -1;
		};

		const fit = () => {
			canvas.setDimensions({
				width: wrap.clientWidth,
				height: wrap.clientHeight,
			});
			const doc = getSnapshot();
			if (doc)
				fitView(
					canvas,
					doc.artboard,
					chromeInset(wrap, getGuides().rulers),
				);
			canvas.requestRenderAll();
			resetCycle();
			reportZoom(canvas.getZoom());
		};

		const retinaAtRest = canvas.enableRetinaScaling;
		// reduce touch backing resolution
		const resDropEnabled =
			navigator.maxTouchPoints > 1 &&
			retinaAtRest &&
			(window.devicePixelRatio || 1) > 1;
		let touchPointersDown = 0;
		let resDropped = false;
		let restoreTimer = 0;
		const applyBacking = () => {
			canvas.setDimensions({
				width: wrap.clientWidth,
				height: wrap.clientHeight,
			});
			canvas.requestRenderAll();
		};
		const onResPointerDown = (e: PointerEvent) => {
			if (e.pointerType === 'mouse') return;
			touchPointersDown++;
			window.clearTimeout(restoreTimer);
		};
		const onResPointerMove = (e: PointerEvent) => {
			if (
				resDropped ||
				touchPointersDown === 0 ||
				e.pointerType === 'mouse'
			)
				return;
			resDropped = true;
			canvas.enableRetinaScaling = false;
			applyBacking();
		};
		const onResPointerEnd = (e: PointerEvent) => {
			if (e.pointerType === 'mouse') return;
			touchPointersDown = Math.max(0, touchPointersDown - 1);
			if (touchPointersDown === 0 && resDropped) {
				window.clearTimeout(restoreTimer);
				restoreTimer = window.setTimeout(() => {
					resDropped = false;
					canvas.enableRetinaScaling =
						retinaAtRest;
					applyBacking();
				}, 180);
			}
		};
		if (resDropEnabled) {
			wrap.addEventListener('pointerdown', onResPointerDown, {
				capture: true,
				passive: true,
			});
			window.addEventListener(
				'pointermove',
				onResPointerMove,
				{
					capture: true,
					passive: true,
				},
			);
			window.addEventListener('pointerup', onResPointerEnd, {
				capture: true,
				passive: true,
			});
			window.addEventListener(
				'pointercancel',
				onResPointerEnd,
				{
					capture: true,
					passive: true,
				},
			);
		}

		const setCanvasCursor = (c: string) => {
			canvas.defaultCursor = c || 'default';
			if (canvas.upperCanvasEl)
				canvas.upperCanvasEl.style.cursor = c;
		};

		let navActive = false;
		const ZMIN = 0.02;
		const ZMAX = 64;
		const clampZoom = (z: number) =>
			Math.max(ZMIN, Math.min(ZMAX, z));
		const centre = () =>
			new Point(
				canvas.getWidth() / 2,
				canvas.getHeight() / 2,
			);
		const zoomAtCentre = (factor: number) => {
			resetCycle();
			canvas.zoomToPoint(
				centre(),
				clampZoom(canvas.getZoom() * factor),
			);
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
				if (cycleStep === -1)
					cycleAnchor = canvas.getZoom();
				cycleStep = (cycleStep + 1) % 3;
				if (cycleStep === 0) {
					canvas.zoomToPoint(centre(), 1);
				} else if (cycleStep === 1) {
					const doc = getSnapshot();
					if (doc)
						fitView(
							canvas,
							doc.artboard,
							chromeInset(
								wrap,
								getGuides()
									.rulers,
							),
						);
				} else {
					canvas.zoomToPoint(
						centre(),
						clampZoom(cycleAnchor),
					);
				}
				reportZoom(canvas.getZoom());
			},
		});

		registerExportRenderer((opts) => {
			const doc = getSnapshot();
			return doc
				? renderExport(canvas, state, doc, opts)
				: null;
		});
		registerLayerBaker((id) => {
			const doc = getSnapshot();
			const layer = doc ? findLayer(doc.layers, id) : null;
			return layer ? bakeLayerObject(state, layer) : null;
		});

		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			if (e.ctrlKey || e.metaKey) {
				resetCycle();
				const r = wrap.getBoundingClientRect();
				const p = new Point(
					e.clientX - r.left,
					e.clientY - r.top,
				);
				canvas.zoomToPoint(
					p,
					clampZoom(
						canvas.getZoom() *
							Math.pow(
								0.999,
								e.deltaY,
							),
					),
				);
				reportZoom(canvas.getZoom());
			} else {
				canvas.relativePan(
					new Point(-e.deltaX, -e.deltaY),
				);
			}
		};
		wrap.addEventListener('wheel', onWheel, { passive: false });

		const isInteractive = (t: EventTarget | null) => {
			const target = t as HTMLElement | null;
			return (
				!!target &&
				(target.isContentEditable ||
					/^(BUTTON|INPUT|TEXTAREA|SELECT|A)$/.test(
						target.tagName,
					))
			);
		};
		let spaceHeld = false;
		let panning = false;
		let panX = 0;
		let panY = 0;
		const onKeyDown = (e: KeyboardEvent) => {
			if (
				e.code === 'Space' &&
				!spaceHeld &&
				!isInteractive(e.target)
			) {
				spaceHeld = true;
				canvas.skipTargetFind = true;
				setCanvasCursor('grab');
				e.preventDefault();
			}
			if (
				e.code === 'Escape' &&
				!isInteractive(e.target) &&
				cropModeActive()
			) {
				setActiveSub('move', 'move');
				e.preventDefault();
			}
			if (!isInteractive(e.target) && getPixelSelection()) {
				if (e.code === 'Escape') {
					clearPixelSelection();
					e.preventDefault();
				} else if (e.code === 'Enter') {
					void extractSelection();
					e.preventDefault();
				}
			}
		};
		const onKeyUp = (e: KeyboardEvent) => {
			if (e.code === 'Space') {
				spaceHeld = false;
				panning = false;
				applyToolMode();
			}
		};
		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('keyup', onKeyUp);

		const shapeModeActive = () =>
			getActiveTool() === 'pieces' &&
			(getActiveSubs().pieces === 'primitives' ||
				getActiveSubs().pieces === 'pieces');
		const effectivePieces = () => {
			const s = getToolSettings().pieces;
			return getActiveSubs().pieces === 'pieces'
				? { ...s, shape: 'symbol' as const }
				: s;
		};
		const freehandSub = (): FreehandSub | null => {
			const sub = getActiveSubs().pieces;
			return getActiveTool() === 'pieces' &&
				(sub === 'brush' || sub === 'pencil')
				? sub
				: null;
		};
		const textModeActive = () =>
			getActiveTool() === 'text' &&
			getActiveSubs().text === 'text';
		const selectSub = (): 'select' | 'lasso' | 'wand' | null => {
			const sub = getActiveSubs().select;
			return getActiveTool() === 'select' &&
				(sub === 'select' ||
					sub === 'lasso' ||
					sub === 'wand')
				? sub
				: null;
		};
		const applyToolMode = () => {
			if (getActiveTool() !== 'select' && getPixelSelection())
				clearPixelSelection();
			const draw =
				shapeModeActive() ||
				freehandSub() !== null ||
				selectSub() !== null;
			canvas.skipTargetFind = draw || spaceHeld;
			canvas.selection = !draw;
			setCanvasCursor(
				draw
					? 'crosshair'
					: spaceHeld
						? 'grab'
						: textModeActive()
							? 'text'
							: '',
			);
		};
		const unsubscribeTool = subscribeTool(() => {
			applyToolMode();
			canvas.requestRenderAll();
		});
		applyToolMode();

		let draft: { start: Pt; layer: ShapeLayer | null } | null =
			null;
		canvas.on('mouse:down', (opt) => {
			if (
				spaceHeld ||
				panning ||
				navActive ||
				!shapeModeActive()
			)
				return;
			draft = {
				start: canvas.getScenePoint(opt.e),
				layer: null,
			};
			beginTransient();
		});
		canvas.on('mouse:move', (opt) => {
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
				? {
						...draft.layer,
						params: built.params,
						transform: built.transform,
					}
				: createShapeLayer({
						name:
							built.params.shape ===
							'symbol'
								? (presetShape(
										built
											.params
											.symbolId,
									)
										?.name ??
									SHAPE_NAMES.symbol)
								: SHAPE_NAMES[
										s
											.shape
									],
						params: built.params,
						fill: s.fill,
						stroke: strokeForNewShape(s),
						transform: built.transform,
					});
			upsertLayerTransient(draft.layer);
		});
		canvas.on('mouse:up', () => {
			if (!draft) return;
			const drawn = draft.layer;
			draft = null;
			commitTransient();
			if (drawn) {
				setSelection([drawn.id]);
				setActiveSub('move', 'move');
			}
		});

		canvas.on('mouse:down', (opt) => {
			if (
				spaceHeld ||
				panning ||
				navActive ||
				opt.target ||
				!textModeActive()
			)
				return;
			const p = canvas.getScenePoint(opt.e);
			const ts = getToolSettings();
			const style = styleFields(
				ts.text.style,
				ts.pieces.fill,
				ts.text.fontSize,
			);
			const layer = createTextLayer({
				name: 'Text',
				text: '',
				fontFamily: ts.text.fontFamily,
				fontSize: ts.text.fontSize,
				...style,
				align: ts.text.align,
				transform: {
					...identityTransform(),
					x: p.x,
					y: p.y,
				},
			});
			appendLayer(layer);
			setSelection([layer.id]);
			// wait for reconciled text
			requestAnimationFrame(() => {
				if (navActive) {
					deleteLayers([layer.id]);
					return;
				}
				const obj = state.byId.get(layer.id);
				if (obj instanceof SubstrataText) {
					canvas.setActiveObject(obj);
					obj.enterEditing();
				}
			});
		});

		canvas.on('text:editing:exited', (e) => {
			const obj = e.target;
			if (!(obj instanceof SubstrataText)) return;
			const id = getLayerIdForObject(obj);
			if (!id) return;
			const text = (obj.text ?? '').trim();
			if (getActiveTool() === 'text')
				setActiveSub('move', 'move');
			if (text === '') {
				deleteLayers([id]);
				return;
			}
			const doc = getSnapshot();
			const layer = doc ? findLayer(doc.layers, id) : null;
			const c = obj.getCenterPoint();
			setTextProps(id, {
				text: obj.text,
				name: obj.text.slice(0, 24),
				...(layer
					? {
							transform: {
								...layer.transform,
								x: c.x,
								y: c.y,
							},
						}
					: {}),
			});
		});

		const pressureOf = (e: Event): number => {
			const pe = e as PointerEvent;
			return pe.pointerType === 'pen' && pe.pressure > 0
				? pe.pressure
				: 0.5;
		};
		let liveStroke: {
			sub: FreehandSub;
			pts: RawPoint[];
			simulate: boolean;
		} | null = null;
		canvas.on('mouse:down', (opt) => {
			const sub = freehandSub();
			if (spaceHeld || panning || navActive || !sub) return;
			const e = opt.e as PointerEvent;
			const p = canvas.getScenePoint(opt.e);
			liveStroke = {
				sub,
				simulate: e.pointerType !== 'pen',
				pts: [[p.x, p.y, pressureOf(e)]],
			};
		});
		canvas.on('mouse:move', (opt) => {
			if (!liveStroke) return;
			const e = opt.e as PointerEvent;
			const events: PointerEvent[] =
				typeof e.getCoalescedEvents === 'function' &&
				e.getCoalescedEvents().length > 0
					? e.getCoalescedEvents()
					: [e];
			for (const ce of events) {
				const p = canvas.getScenePoint(ce);
				liveStroke.pts.push([p.x, p.y, pressureOf(ce)]);
			}
			canvas.requestRenderAll();
		});
		canvas.on('mouse:up', () => {
			if (!liveStroke) return;
			const { sub, pts, simulate } = liveStroke;
			liveStroke = null;
			canvas.requestRenderAll();
			if (pts.length < 2) return;
			const s = getToolSettings().pieces;
			const options = freehandOptions(sub, s, simulate);
			const { points, cx, cy } = centreRawPoints(
				pts,
				options,
			);
			const layer = createFreehandLayer({
				name: FREEHAND_NAMES[sub],
				rawPoints: points,
				strokeOptions: options,
				fill: s.fill,
				transform: {
					...identityTransform(),
					x: cx,
					y: cy,
				},
			});
			appendLayer(layer);
			setSelection([layer.id]);
		});
		canvas.on('mouse:down', (opt) => {
			if (!spaceHeld) return;
			panning = true;
			setCanvasCursor('grabbing');
			const ev = opt.e as MouseEvent;
			panX = ev.clientX;
			panY = ev.clientY;
		});
		canvas.on('mouse:move', (opt) => {
			if (!panning) return;
			const ev = opt.e as MouseEvent;
			canvas.relativePan(
				new Point(ev.clientX - panX, ev.clientY - panY),
			);
			panX = ev.clientX;
			panY = ev.clientY;
		});
		canvas.on('mouse:up', () => {
			panning = false;
			if (spaceHeld) setCanvasCursor('grab');
		});

		let marqueeDraft: {
			x0: number;
			y0: number;
			x1: number;
			y1: number;
		} | null = null;
		let lassoDraft: {
			pts: { x: number; y: number }[];
			field: ReturnType<typeof sobelField> | null;
		} | null = null;

		const sceneXY = (
			px: number,
			py: number,
		): { x: number; y: number } => {
			const vpt = canvas.viewportTransform;
			return {
				x: (px - vpt[4]) / vpt[0],
				y: (py - vpt[5]) / vpt[3],
			};
		};
		const sampleActiveLayer = (): ImageData | null => {
			const doc = getSnapshot();
			const id = getActiveLayerId();
			if (!doc || !id) return null;
			const sampleEl = renderExport(canvas, state, doc, {
				scale: 1,
				soloLayerId: id,
			});
			const c = sampleEl.getContext('2d', {
				willReadFrequently: true,
			});
			return c
				? c.getImageData(
						0,
						0,
						sampleEl.width,
						sampleEl.height,
					)
				: null;
		};
		const snapLassoPt = (
			field: ReturnType<typeof sobelField> | null,
			p: { x: number; y: number },
		): { x: number; y: number } => {
			if (!field) return { x: p.x, y: p.y };
			const s = getToolSettings().select;
			return snapToEdge(
				field,
				p.x,
				p.y,
				4 + (s.sensitivity / 100) * 16,
			);
		};

		// preserve active layer selection
		const selectPointerDown = (px: number, py: number): boolean => {
			const sub = selectSub();
			if (!sub) return false;
			const p = sceneXY(px, py);
			if (sub === 'select') {
				marqueeDraft = {
					x0: p.x,
					y0: p.y,
					x1: p.x,
					y1: p.y,
				};
			} else if (sub === 'lasso') {
				const s = getToolSettings().select;
				const img = s.magnetic
					? sampleActiveLayer()
					: null;
				const field = img ? sobelField(img) : null;
				lassoDraft = {
					pts: [snapLassoPt(field, p)],
					field,
				};
			} else {
				const doc = getSnapshot();
				if (!doc) return true;
				const img = sampleActiveLayer();
				if (!img) {
					toast('wand-needs-layer');
					return true;
				}
				const s = getToolSettings().select;
				// preserve pixel hit test
				const mask =
					s.wandMode === 'global'
						? globalMask(
								img,
								p.x,
								p.y,
								s.tolerance,
							)
						: floodMask(
								img,
								p.x,
								p.y,
								s.tolerance,
							);
				setPixelSelectionMask(mask);
			}
			canvas.requestRenderAll();
			return true;
		};
		const selectPointerMove = (px: number, py: number): void => {
			if (!marqueeDraft && !lassoDraft) return;
			if (!selectSub()) {
				marqueeDraft = null;
				lassoDraft = null;
				canvas.requestRenderAll();
				return;
			}
			const p = sceneXY(px, py);
			if (marqueeDraft)
				marqueeDraft = {
					...marqueeDraft,
					x1: p.x,
					y1: p.y,
				};
			else if (lassoDraft)
				lassoDraft.pts.push(
					snapLassoPt(lassoDraft.field, p),
				);
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
					if (
						Math.abs(d.x1 - d.x0) < 2 ||
						Math.abs(d.y1 - d.y0) < 2
					)
						clearPixelSelection();
					else {
						setPixelSelectionMask(
							rectMask(
								doc.artboard
									.width,
								doc.artboard
									.height,
								d.x0,
								d.y0,
								d.x1,
								d.y1,
							),
						);
					}
				}
			} else if (lassoDraft) {
				const d = lassoDraft;
				lassoDraft = null;
				if (doc) {
					if (d.pts.length < 3)
						clearPixelSelection();
					else
						setPixelSelectionMask(
							polygonMask(
								doc.artboard
									.width,
								doc.artboard
									.height,
								d.pts,
							),
						);
				}
			}
			canvas.requestRenderAll();
		};

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
		const unsubscribePixelSelection = subscribePixelSelection(
			() => {
				syncAntTimer();
				canvas.requestRenderAll();
			},
		);
		syncAntTimer();

		const syncSelectionToStore = () => {
			if (squelchSelectionEvents) return;
			const ids = canvas
				.getActiveObjects()
				.map((o) => getLayerIdForObject(o))
				.filter((id): id is string => !!id);
			setSelection(ids);
		};
		canvas.on('selection:created', syncSelectionToStore);
		canvas.on('selection:updated', syncSelectionToStore);
		canvas.on('selection:cleared', syncSelectionToStore);

				// use composed selection transform
				const absoluteTransformOf = (obj: FabricObject): Transform => {
			const d = fabricUtil.qrDecompose(
				obj.calcTransformMatrix(),
			);
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

		canvas.on('object:modified', (e) => {
			const target = e.target;
			if (!target) return;

			if (target instanceof ActiveSelection) {
				const entries = target
					.getObjects()
					.flatMap((obj) => {
						const id =
							getLayerIdForObject(
								obj,
							);
						return id
							? [
									{
										id,
										transform: absoluteTransformOf(
											obj,
										),
									},
								]
							: [];
					});
				// defer fabric selection commit
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


		const SNAP_SCREEN_PX = 6;
		let activeGuides: { v: number[]; h: number[] } | null = null;

		let separateBase: {
			world: Map<
				FabricObject,
				ReturnType<FabricObject['calcTransformMatrix']>
			>;
			angle: number;
			scaleX: number;
			scaleY: number;
		} | null = null;

		canvas.on('before:transform', (e) => {
			const t = e.transform?.target;
			separateBase =
				t instanceof ActiveSelection
					? {
							world: new Map(
								t
									.getObjects()
									.map(
										(
											o,
										) => [
											o,
											o.calcTransformMatrix(),
										],
									),
							),
							angle: t.angle,
							scaleX: t.scaleX,
							scaleY: t.scaleY,
						}
					: null;
		});

		// transform members independently
		const transformSeparately = (
			target: FabricObject,
			kind: 'rotate' | 'scale',
		) => {
			if (
				!separateBase ||
				getToolSettings().transformAsGroup ||
				!(target instanceof ActiveSelection)
			) {
				return;
			}
			const th = fabricUtil.degreesToRadians(
				target.angle - separateBase.angle,
			);
			const D =
				kind === 'rotate'
					? ([
							Math.cos(th),
							Math.sin(th),
							-Math.sin(th),
							Math.cos(th),
							0,
							0,
						] as const)
					: ([
							target.scaleX /
								separateBase.scaleX,
							0,
							0,
							target.scaleY /
								separateBase.scaleY,
							0,
							0,
						] as const);
			const Ginv = fabricUtil.invertTransform(
				target.calcTransformMatrix(),
			);
			for (const child of target.getObjects()) {
				const W = separateBase.world.get(child);
				if (!W) continue;
				const cx = W[4];
				const cy = W[5];
				const about: [
					number,
					number,
					number,
					number,
					number,
					number,
				] = [
					D[0],
					D[1],
					D[2],
					D[3],
					cx - D[0] * cx - D[2] * cy,
					cy - D[1] * cx - D[3] * cy,
				];
				const local =
					fabricUtil.multiplyTransformMatrices(
						Ginv,
						fabricUtil.multiplyTransformMatrices(
							about,
							W,
						),
					);
				fabricUtil.applyTransformToObject(child, local);
				child.setCoords();
			}
		};

		let dragBadge: {
			target: FabricObject;
			kind: 'move' | 'scale' | 'rotate';
			px: number;
			py: number;
		} | null = null;
		canvas.on('object:scaling', (e) => {
			const p = canvas.getViewportPoint(e.e);
			dragBadge = e.target
				? {
						target: e.target,
						kind: 'scale',
						px: p.x,
						py: p.y,
					}
				: null;
			if (e.target) transformSeparately(e.target, 'scale');
			canvas.requestRenderAll();
		});
		canvas.on('object:rotating', (e) => {
			const target = e.target;
			if (target && 'shiftKey' in e.e && e.e.shiftKey) {
				target.set({
					angle:
						Math.round(target.angle / 45) *
						45,
				});
				target.setCoords();
			}
			const p = canvas.getViewportPoint(e.e);
			dragBadge = target
				? { target, kind: 'rotate', px: p.x, py: p.y }
				: null;
			if (target) transformSeparately(target, 'rotate');
			canvas.requestRenderAll();
		});

		const boxOf = (obj: FabricObject): SnapBox => {
			const c = obj.getCenterPoint();
			return {
				x: c.x,
				y: c.y,
				w: obj.getScaledWidth(),
				h: obj.getScaledHeight(),
			};
		};

		canvas.on('object:moving', (e) => {
			if (e.target) {
				const p = canvas.getViewportPoint(e.e);
				dragBadge = {
					target: e.target,
					kind: 'move',
					px: p.x,
					py: p.y,
				};
			}
			const g = getGuides();
			const target = e.target;
			const doc = getSnapshot();
			if (!target || !doc || (!g.snap && !g.grid)) {
				activeGuides = null;
				return;
			}
			const moving = new Set(
				target instanceof ActiveSelection
					? target.getObjects()
					: [target],
			);
			const others: SnapBox[] = [];
			if (g.snap) {
				for (const [id, obj] of state.byId) {
					if (
						id === '__artboard__' ||
						moving.has(obj) ||
						!obj.visible
					)
						continue;
					others.push(boxOf(obj));
				}
			}
			const field = g.snap
				? buildSnapField(doc.artboard, others)
				: { v: [] as number[], h: [] as number[] };
			if (g.snap && g.guides) {
				for (const gd of doc.guides)
					(gd.axis === 'x'
						? field.v
						: field.h
					).push(gd.pos);
			}
			const res = computeSnap(
				boxOf(target),
				field,
				g.grid ? GRID_SIZE : null,
				SNAP_SCREEN_PX / canvas.getZoom(),
			);
			if (res.dx || res.dy) {
				const c = target.getCenterPoint();
				target.setPositionByOrigin(
					new Point(c.x + res.dx, c.y + res.dy),
					'center',
					'center',
				);
				target.setCoords();
			}
			activeGuides =
				res.v.length || res.h.length
					? { v: res.v, h: res.h }
					: null;
			canvas.requestRenderAll();
		});

		const clearGuides = () => {
			if (activeGuides || dragBadge) {
				activeGuides = null;
				dragBadge = null;
				canvas.requestRenderAll();
			}
		};
		canvas.on('mouse:up', clearGuides);

		// screen pixels
		const GUIDE_GRAB_PX = 4;
		const niceStep = (min: number): number => {
			const pow = 10 ** Math.floor(Math.log10(min));
			for (const m of [1, 2, 5])
				if (m * pow >= min) return m * pow;
			return 10 * pow;
		};
		let guideDrag: {
			id: string | null;
			axis: 'x' | 'y';
			pos: number;
			cross: number;
		} | null = null;
		let guideHover = false;

		// avoid gesture layout reads
		let claimRect: DOMRect | null = null;
		const wrapPoint = (e: PointerEvent) => {
			const r =
				claimedPointerId !== null && claimRect
					? claimRect
					: wrap.getBoundingClientRect();
			return {
				px: e.clientX - r.left,
				py: e.clientY - r.top,
			};
		};
		const scenePos = (
			axis: 'x' | 'y',
			px: number,
			py: number,
		): number =>
			Math.round(
				axis === 'x'
					? sceneXY(px, py).x
					: sceneXY(px, py).y,
			);
		const guideAt = (
			px: number,
			py: number,
		): { id: string; axis: 'x' | 'y' } | null => {
			const doc = getSnapshot();
			if (!doc || !getGuides().guides) return null;
			const vt = canvas.viewportTransform;
			for (let i = doc.guides.length - 1; i >= 0; i--) {
				const g = doc.guides[i];
				if (!g) continue;
				const screen =
					g.axis === 'x'
						? g.pos * vt[0] + vt[4]
						: g.pos * vt[3] + vt[5];
				if (
					Math.abs(
						screen -
							(g.axis === 'x'
								? px
								: py),
					) <= GUIDE_GRAB_PX
				) {
					return { id: g.id, axis: g.axis };
				}
			}
			return null;
		};

		const CROP_GRAB_PX = 6;
		// layer pixels
		const CROP_MIN = 8;
		const cropModeActive = () =>
			getActiveTool() === 'move' &&
			getActiveSubs().move === 'crop';
		type CropTarget = {
			id: string;
			dims: { width: number; height: number };
			t: Transform;
			crop: CropRect;
		};
				const cropTarget = (): CropTarget | null => {
			const doc = getSnapshot();
			const ids = getSelectedLayerIds();
			const onlyId = ids[0];
			if (!doc || ids.length !== 1 || !onlyId) return null;
			const layer = findLayer(doc.layers, onlyId);
			if (!layer) return null;
			const dims = layerDims(layer);
			if (!dims || dims.width <= 0 || dims.height <= 0)
				return null;
			if (layer.transform.angle !== 0) return null;
			return {
				id: layer.id,
				dims,
				t: layer.transform,
				crop: layer.crop ?? {
					x: 0,
					y: 0,
					w: dims.width,
					h: dims.height,
				},
			};
		};
				// normalize flipped crop bounds
				const cropProject = (tgt: CropTarget) => {
			const vt = canvas.viewportTransform;
			const ex = tgt.t.scaleX * (tgt.t.flipX ? -1 : 1);
			const ey = tgt.t.scaleY * (tgt.t.flipY ? -1 : 1);
			return {
				ex,
				ey,
				px: (lx: number) =>
					(tgt.t.x +
						(lx - tgt.dims.width / 2) *
							ex) *
						vt[0] +
					vt[4],
				py: (ly: number) =>
					(tgt.t.y +
						(ly - tgt.dims.height / 2) *
							ey) *
						vt[3] +
					vt[5],
			};
		};
		let cropDrag: {
			id: string;
			hx: number;
			hy: number;
			start: CropRect;
			dims: CropTarget['dims'];
			t: Transform;
		} | null = null;
				const cropClaim = (px: number, py: number): boolean => {
			const tgt = cropTarget();
			if (!tgt) return false;
			const m = cropProject(tgt);
			for (const fx of [0, 0.5, 1]) {
				for (const fy of [0, 0.5, 1]) {
					if (fx === 0.5 && fy === 0.5) continue;
					const hpx = m.px(
						tgt.crop.x + fx * tgt.crop.w,
					);
					const hpy = m.py(
						tgt.crop.y + fy * tgt.crop.h,
					);
					if (
						Math.abs(px - hpx) <=
							CROP_GRAB_PX &&
						Math.abs(py - hpy) <=
							CROP_GRAB_PX
					) {
						cropDrag = {
							id: tgt.id,
							hx: fx * 2 - 1,
							hy: fy * 2 - 1,
							start: tgt.crop,
							dims: tgt.dims,
							t: tgt.t,
						};
						beginTransient();
						setCanvasCursor(
							cropDrag.hx &&
								cropDrag.hy
								? cropDrag.hx *
										cropDrag.hy >
									0
									? 'nwse-resize'
									: 'nesw-resize'
								: cropDrag.hx
									? 'ew-resize'
									: 'ns-resize',
						);
						return true;
					}
				}
			}
			return false;
		};
		const cropDragMove = (px: number, py: number): void => {
			if (!cropDrag) return;
			if (!cropModeActive()) {
				cropDrag = null;
				commitTransient();
				claimedPointerId = null;
				applyToolMode();
				return;
			}
			const { start, dims, t, hx, hy } = cropDrag;
			const p = sceneXY(px, py);
			const lx =
				(p.x - t.x) /
					(t.scaleX * (t.flipX ? -1 : 1) || 1) +
				dims.width / 2;
			const ly =
				(p.y - t.y) /
					(t.scaleY * (t.flipY ? -1 : 1) || 1) +
				dims.height / 2;
			let { x, y, w, h } = start;
			if (hx === -1) {
				const right = start.x + start.w;
				x = Math.min(
					Math.max(lx, 0),
					Math.max(0, right - CROP_MIN),
				);
				w = right - x;
			} else if (hx === 1) {
				w =
					Math.min(
						Math.max(
							lx,
							start.x + CROP_MIN,
						),
						dims.width,
					) - start.x;
			}
			if (hy === -1) {
				const bottom = start.y + start.h;
				y = Math.min(
					Math.max(ly, 0),
					Math.max(0, bottom - CROP_MIN),
				);
				h = bottom - y;
			} else if (hy === 1) {
				h =
					Math.min(
						Math.max(
							ly,
							start.y + CROP_MIN,
						),
						dims.height,
					) - start.y;
			}
			// preserve crop bounds
			const rx = Math.round(x);
			const ry = Math.round(y);
			setCrop(
				cropDrag.id,
				{
					x: rx,
					y: ry,
					w: Math.round(x + w) - rx,
					h: Math.round(y + h) - ry,
				},
				{ transient: true },
			);
		};

		let claimedPointerId: number | null = null;
		const onGuidePointerDown = (e: PointerEvent) => {
			if (
				e.button !== 0 ||
				spaceHeld ||
				panning ||
				claimedPointerId !== null
			)
				return;
			claimRect = wrap.getBoundingClientRect();
			const { px, py } = wrapPoint(e);
			const g = getGuides();
			const inH = py < RULER_PX;
			const inV = px < RULER_PX;
			if (g.rulers && (inH || inV)) {
				if (inH && inV) return;
				const axis: 'x' | 'y' = inV ? 'x' : 'y';
				guideDrag = {
					id: null,
					axis,
					pos: scenePos(axis, px, py),
					cross: axis === 'x' ? py : px,
				};
			} else if (selectSub()) {
				if (selectPointerDown(px, py)) {
					claimedPointerId = e.pointerId;
					e.preventDefault();
					e.stopPropagation();
				}
				return;
			} else if (cropModeActive() && cropClaim(px, py)) {
				claimedPointerId = e.pointerId;
				e.preventDefault();
				e.stopPropagation();
				canvas.requestRenderAll();
				return;
			} else if (getActiveTool() === 'move') {
				const hit = guideAt(px, py);
				if (!hit) return;
				// defer guide persistence
				const current = getSnapshot()?.guides.find(
					(gd) => gd.id === hit.id,
				);
				guideDrag = {
					id: hit.id,
					axis: hit.axis,
					pos: current?.pos ?? 0,
					cross: hit.axis === 'x' ? py : px,
				};
			} else {
				return;
			}
			claimedPointerId = e.pointerId;
			guideHover = false;
			e.preventDefault();
			e.stopPropagation();
			setCanvasCursor(
				guideDrag.axis === 'x'
					? 'ew-resize'
					: 'ns-resize',
			);
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
				if (cropDrag) {
					const { px, py } = wrapPoint(e);
					cropDragMove(px, py);
					return;
				}
				if (guideDrag) {
					const { px, py } = wrapPoint(e);
					const pos = scenePos(
						guideDrag.axis,
						px,
						py,
					);
					guideDrag = {
						...guideDrag,
						pos,
						cross:
							guideDrag.axis === 'x'
								? py
								: px,
					};
					canvas.requestRenderAll();
				}
				return;
			}
			if (getActiveTool() !== 'move' || spaceHeld || panning)
				return;
			const { px, py } = wrapPoint(e);
			const hit =
				px >= RULER_PX || py >= RULER_PX
					? guideAt(px, py)
					: null;
			if (hit && !guideHover) {
				guideHover = true;
				setCanvasCursor(
					hit.axis === 'x'
						? 'ew-resize'
						: 'ns-resize',
				);
			} else if (!hit && guideHover) {
				guideHover = false;
				applyToolMode();
			}
		};
		const onGuidePointerUp = (e: PointerEvent) => {
			if (e.pointerId !== claimedPointerId) return;
			claimedPointerId = null;
			claimRect = null;
			if (marqueeDraft || lassoDraft) {
				selectPointerUp();
				return;
			}
			if (cropDrag) {
				cropDrag = null;
				commitTransient();
				applyToolMode();
				canvas.requestRenderAll();
				return;
			}
			if (!guideDrag) return;
			const drag = guideDrag;
			guideDrag = null;
			const { px, py } = wrapPoint(e);
			const inBand =
				drag.axis === 'x'
					? px < RULER_PX
					: py < RULER_PX;
			if (drag.id === null) {
				if (!inBand) {
					addGuide(
						drag.axis,
						scenePos(drag.axis, px, py),
					);
					if (!getGuides().guides)
						toggleGuide('guides');
				}
			} else {
				if (inBand) removeGuide(drag.id);
				else
					setGuidePos(
						drag.id,
						scenePos(drag.axis, px, py),
					);
			}
			applyToolMode();
			canvas.requestRenderAll();
		};
		const onGuidePointerCancel = (e: PointerEvent) => {
			if (e.pointerId !== claimedPointerId) return;
			claimedPointerId = null;
			claimRect = null;
			marqueeDraft = null;
			lassoDraft = null;
			if (cropDrag) {
				cropDrag = null;
				commitTransient();
			}
			guideDrag = null;
			applyToolMode();
			canvas.requestRenderAll();
		};

		// cancel drawing before navigation
		const navTouches = new Map<number, { x: number; y: number }>();
		let navPrev: { cx: number; cy: number; dist: number } | null =
			null;
		const internals = canvas as unknown as FabricInternals;
		const cancelInFlightGestures = () => {
			if (claimedPointerId !== null) {
				onGuidePointerCancel(
					new PointerEvent('pointercancel', {
						pointerId: claimedPointerId,
					}),
				);
			}
			liveStroke = null;
			if (draft) {
				draft = null;
				rollbackTransient();
			}
			const active = canvas.getActiveObject();
			if (
				active instanceof SubstrataText &&
				active.isEditing &&
				(active.text ?? '') === ''
			) {
				active.exitEditing();
			}
			const transform = internals._currentTransform;
			if (transform?.target) {
				const pose = { ...(transform.original ?? {}) };
				// fabric origin is transient
				delete pose['originX'];
				delete pose['originY'];
				transform.target.set(pose);
				transform.target.setCoords();
				transform.actionPerformed = false;
			}
			if (internals.mainTouchId !== undefined) {
				const pos = [...navTouches.values()][0] ?? {
					x: 0,
					y: 0,
				};
				// end fabric touch lifecycle
				internals._onTouchEnd({
					type: 'touchend',
					touches: [],
					changedTouches: [
						{
							identifier: internals.mainTouchId,
							clientX: pos.x,
							clientY: pos.y,
							target: canvas.upperCanvasEl,
						},
					],
					target: canvas.upperCanvasEl,
					preventDefault: () => {},
					stopPropagation: () => {},
				} as unknown as TouchEvent);
			}
			canvas.requestRenderAll();
		};
		const onNavPointerDown = (e: PointerEvent) => {
			if (e.pointerType !== 'touch') return;
			navTouches.set(e.pointerId, {
				x: e.clientX,
				y: e.clientY,
			});
			if (navTouches.size === 2 && !navActive) {
				cancelInFlightGestures();
				navActive = true;
				navPrev = null;
			}
			if (navActive) {
				e.preventDefault();
				e.stopImmediatePropagation();
			}
		};
		// block fabric touch starts
		const onNavTouchStart = (e: TouchEvent) => {
			if (!navActive) return;
			if (e.cancelable) e.preventDefault();
			e.stopImmediatePropagation();
		};
		const onNavPointerMove = (e: PointerEvent) => {
			if (!navActive || !navTouches.has(e.pointerId)) return;
			navTouches.set(e.pointerId, {
				x: e.clientX,
				y: e.clientY,
			});
			if (navTouches.size >= 2) {
				const [a, b] = [...navTouches.values()];
				if (a && b) {
					const cx = (a.x + b.x) / 2;
					const cy = (a.y + b.y) / 2;
					const dist = Math.hypot(
						a.x - b.x,
						a.y - b.y,
					);
					if (navPrev) {
						canvas.relativePan(
							new Point(
								cx - navPrev.cx,
								cy - navPrev.cy,
							),
						);
						if (
							navPrev.dist > 0 &&
							dist > 0
						) {
							resetCycle();
							const r =
								wrap.getBoundingClientRect();
							canvas.zoomToPoint(
								new Point(
									cx -
										r.left,
									cy -
										r.top,
								),
								clampZoom(
									canvas.getZoom() *
										(dist /
											navPrev.dist),
								),
							);
						}
						reportZoom(canvas.getZoom());
					}
					navPrev = { cx, cy, dist };
				}
			}
			if (e.cancelable) e.preventDefault();
			e.stopImmediatePropagation();
		};
		const onNavPointerEnd = (e: PointerEvent) => {
			if (!navTouches.delete(e.pointerId)) return;
			if (!navActive) return;
			e.stopImmediatePropagation();
			navPrev = null;
			if (navTouches.size === 0) navActive = false;
		};
		wrap.addEventListener('pointerdown', onNavPointerDown, {
			capture: true,
		});
		wrap.addEventListener('touchstart', onNavTouchStart, {
			capture: true,
			passive: false,
		});
		window.addEventListener('pointermove', onNavPointerMove, {
			capture: true,
			passive: false,
		});
		window.addEventListener('pointerup', onNavPointerEnd, {
			capture: true,
		});
		window.addEventListener('pointercancel', onNavPointerEnd, {
			capture: true,
		});

		wrap.addEventListener('pointerdown', onGuidePointerDown, {
			capture: true,
		});
		window.addEventListener('pointermove', onGuidePointerMove);
		window.addEventListener('pointerup', onGuidePointerUp);
		window.addEventListener('pointercancel', onGuidePointerCancel);

		canvas.on('after:render', () => {
			const g = getGuides();
			const showGrid = g.grid;
			const activeObj = canvas.getActiveObject();
			const sepMembers =
				activeObj instanceof ActiveSelection &&
				anchorStyled.has(activeObj)
					? activeObj.getObjects().slice(1)
					: null;
			const ctx = canvas.contextTop;
			if (!ctx) return;
			// clear stale overlay chrome
			canvas.clearContext(ctx);
			const doc = getSnapshot();
			const showRulers = g.rulers;
			const userGuides = doc && g.guides ? doc.guides : [];
			const pixelSel = getPixelSelection();
			const cropInfo = cropModeActive() ? cropTarget() : null;
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
				!lassoDraft &&
				!cropInfo
			) {
				return;
			}
			if (!doc) return;
			const vt = canvas.viewportTransform;
			const z = vt[0];
			const sx = (x: number) => x * z + vt[4];
			const sy = (y: number) => y * z + vt[5];
			const ink = (themeInk ??= readThemeInk());

			if (liveStroke) {
				const s = getToolSettings().pieces;
				const d = outlineToPathD(
					strokeOutline(
						liveStroke.pts,
						freehandOptions(
							liveStroke.sub,
							s,
							liveStroke.simulate,
						),
					),
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
				ctx.strokeStyle = ink.foreground;
				ctx.globalAlpha = 0.12;
				ctx.lineWidth = 1;
				ctx.beginPath();
				for (
					let x = 0;
					x <= doc.artboard.width;
					x += GRID_SIZE
				) {
					ctx.moveTo(sx(x), sy(0));
					ctx.lineTo(
						sx(x),
						sy(doc.artboard.height),
					);
				}
				for (
					let y = 0;
					y <= doc.artboard.height;
					y += GRID_SIZE
				) {
					ctx.moveTo(sx(0), sy(y));
					ctx.lineTo(
						sx(doc.artboard.width),
						sy(y),
					);
				}
				ctx.stroke();
				ctx.restore();
			}

			if (pixelSel || marqueeDraft || lassoDraft) {
				ctx.save();
				ctx.transform(z, 0, 0, z, vt[4], vt[5]);
				ctx.lineWidth = 1 / z;
				if (pixelSel) {
					ctx.strokeStyle = '#ffffff';
					ctx.stroke(pixelSel.outline);
					ctx.strokeStyle = '#000000';
					ctx.setLineDash([4 / z, 4 / z]);
					ctx.lineDashOffset = -antPhase / z;
					ctx.stroke(pixelSel.outline);
					ctx.setLineDash([]);
				}
				if (marqueeDraft || lassoDraft) {
					ctx.strokeStyle = ink.primary;
					ctx.setLineDash([4 / z, 4 / z]);
					if (marqueeDraft) {
						ctx.strokeRect(
							Math.min(
								marqueeDraft.x0,
								marqueeDraft.x1,
							),
							Math.min(
								marqueeDraft.y0,
								marqueeDraft.y1,
							),
							Math.abs(
								marqueeDraft.x1 -
									marqueeDraft.x0,
							),
							Math.abs(
								marqueeDraft.y1 -
									marqueeDraft.y0,
							),
						);
					}
					if (
						lassoDraft &&
						lassoDraft.pts.length > 1
					) {
						const first = lassoDraft.pts[0];
						if (first) {
							ctx.beginPath();
							ctx.moveTo(
								first.x,
								first.y,
							);
							for (const pt of lassoDraft.pts)
								ctx.lineTo(
									pt.x,
									pt.y,
								);
							ctx.stroke();
						}
					}
				}
				ctx.restore();
				if (pixelSel) {
					const b = pixelSel.bounds;
					reportSelectionAnchor(
						Math.min(
							Math.max(
								sx(
									b.x +
										b.w /
											2,
								),
								60,
							),
							canvas.getWidth() - 60,
						),
						Math.min(
							Math.max(
								sy(b.y + b.h) +
									10,
								30,
							),
							canvas.getHeight() - 44,
						),
						pixelSel.epoch,
					);
				}
			}

			if (userGuides.length || guideDrag) {
				const lines: {
					axis: 'x' | 'y';
					pos: number;
					dragging: boolean;
				}[] = userGuides.map((gd) =>
					guideDrag?.id === gd.id
						? {
								axis: gd.axis,
								pos: guideDrag.pos,
								dragging: true,
							}
						: {
								axis: gd.axis,
								pos: gd.pos,
								dragging: false,
							},
				);
				if (guideDrag && guideDrag.id === null) {
					lines.push({
						axis: guideDrag.axis,
						pos: guideDrag.pos,
						dragging: true,
					});
				}
				ctx.save();
				ctx.strokeStyle = ink.primary;
				ctx.lineWidth = 1;
				for (const line of lines) {
					const screen =
						Math.round(
							line.axis === 'x'
								? sx(line.pos)
								: sy(line.pos),
						) + 0.5;
					const overBand =
						line.dragging &&
						screen <
							RULER_PX +
								GUIDE_GRAB_PX;
					ctx.globalAlpha = overBand
						? 0.35
						: line.dragging
							? 0.8
							: 1;
					ctx.beginPath();
					if (line.axis === 'x') {
						ctx.moveTo(screen, 0);
						ctx.lineTo(
							screen,
							canvas.getHeight(),
						);
					} else {
						ctx.moveTo(0, screen);
						ctx.lineTo(
							canvas.getWidth(),
							screen,
						);
					}
					ctx.stroke();
				}
				ctx.restore();

				if (guideDrag) {
					const axis = guideDrag.axis;
					const pos = Math.round(guideDrag.pos);
					const extent =
						axis === 'x'
							? doc.artboard.width
							: doc.artboard.height;
					const cands = [
						0,
						extent,
						...doc.guides
							.filter(
								(gd) =>
									gd.axis ===
										axis &&
									gd.id !==
										guideDrag?.id,
							)
							.map((gd) => gd.pos),
					];
					const below = Math.max(
						...cands.filter((c) => c < pos),
						-Infinity,
					);
					const above = Math.min(
						...cands.filter((c) => c > pos),
						Infinity,
					);
					const toScreen = axis === 'x' ? sx : sy;
					const cross = Math.min(
						Math.max(
							guideDrag.cross,
							RULER_PX + 16,
						),
						(axis === 'x'
							? canvas.getHeight()
							: canvas.getWidth()) -
							16,
					);
					ctx.save();
					ctx.font =
						'bold 9.5px "iA Writer Quattro", ui-monospace, monospace';
					ctx.textAlign = 'center';
					ctx.textBaseline = 'middle';
					for (const neighbour of [
						below,
						above,
					]) {
						if (!Number.isFinite(neighbour))
							continue;
						const gap = Math.abs(
							pos - neighbour,
						);
						if (gap < 1) continue;
						const text = String(gap);
						const mid =
							(toScreen(pos) +
								toScreen(
									neighbour,
								)) /
							2;
						const w =
							ctx.measureText(text)
								.width + 10;
						const h = 14;
						const bx =
							axis === 'x'
								? mid
								: cross;
						const by =
							axis === 'x'
								? cross
								: mid;
						ctx.fillStyle = ink.destructive;
						ctx.fillRect(
							bx - w / 2,
							by - h / 2,
							w,
							h,
						);
						ctx.fillStyle = '#ffffff';
						ctx.fillText(
							text,
							bx,
							by + 0.5,
						);
					}
					ctx.restore();
				}
			}

			if (activeGuides) {
				ctx.save();
				ctx.strokeStyle = ink.destructive;
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
				const selMatrix = (
					activeObj as ActiveSelection
				).calcTransformMatrix();
				ctx.save();
				ctx.strokeStyle = ink.primary;
				ctx.lineWidth = 1;
				for (const child of sepMembers) {
					// fabric v7 parent coordinates
					const c = child.calcACoords();
					const pts = [
						c.tl,
						c.tr,
						c.br,
						c.bl,
					].map((p) =>
						fabricUtil.transformPoint(
							p,
							selMatrix,
						),
					);
					const xs2 = pts.map((p) => p.x);
					const ys2 = pts.map((p) => p.y);
					const offCanvas =
						Math.max(...xs2) < 0 ||
						Math.min(...xs2) >
							doc.artboard.width ||
						Math.max(...ys2) < 0 ||
						Math.min(...ys2) >
							doc.artboard.height;
					ctx.setLineDash(
						offCanvas ? [3, 3] : [],
					);
					ctx.globalAlpha = offCanvas ? 0.5 : 1;
					const [p0, p1, p2, p3] = pts;
					if (p0 && p1 && p2 && p3) {
						ctx.beginPath();
						ctx.moveTo(sx(p0.x), sy(p0.y));
						ctx.lineTo(sx(p1.x), sy(p1.y));
						ctx.lineTo(sx(p2.x), sy(p2.y));
						ctx.lineTo(sx(p3.x), sy(p3.y));
						ctx.closePath();
						ctx.stroke();
					}
				}
				ctx.restore();
			}

			if (cropInfo) {
				const { dims, crop } = cropInfo;
				const m = cropProject(cropInfo);
				const bx0 = Math.min(m.px(0), m.px(dims.width));
				const bx1 = Math.max(m.px(0), m.px(dims.width));
				const by0 = Math.min(
					m.py(0),
					m.py(dims.height),
				);
				const by1 = Math.max(
					m.py(0),
					m.py(dims.height),
				);
				const cx0 = Math.min(
					m.px(crop.x),
					m.px(crop.x + crop.w),
				);
				const cx1 = Math.max(
					m.px(crop.x),
					m.px(crop.x + crop.w),
				);
				const cy0 = Math.min(
					m.py(crop.y),
					m.py(crop.y + crop.h),
				);
				const cy1 = Math.max(
					m.py(crop.y),
					m.py(crop.y + crop.h),
				);
				ctx.save();
				ctx.fillStyle = 'rgba(0,0,0,0.35)';
				if (cy0 > by0)
					ctx.fillRect(
						bx0,
						by0,
						bx1 - bx0,
						cy0 - by0,
					);
				if (by1 > cy1)
					ctx.fillRect(
						bx0,
						cy1,
						bx1 - bx0,
						by1 - cy1,
					);
				if (cx0 > bx0)
					ctx.fillRect(
						bx0,
						cy0,
						cx0 - bx0,
						cy1 - cy0,
					);
				if (bx1 > cx1)
					ctx.fillRect(
						cx1,
						cy0,
						bx1 - cx1,
						cy1 - cy0,
					);
				ctx.strokeStyle = ink.primary;
				ctx.lineWidth = 1;
				ctx.strokeRect(cx0, cy0, cx1 - cx0, cy1 - cy0);
				ctx.fillStyle = ink.background;
				for (const fx of [0, 0.5, 1]) {
					for (const fy of [0, 0.5, 1]) {
						if (fx === 0.5 && fy === 0.5)
							continue;
						const hx = m.px(
							crop.x + fx * crop.w,
						);
						const hy = m.py(
							crop.y + fy * crop.h,
						);
						ctx.fillRect(
							hx - 3,
							hy - 3,
							6,
							6,
						);
						ctx.strokeRect(
							hx - 3,
							hy - 3,
							6,
							6,
						);
					}
				}
				ctx.restore();
			}

			if (dragBadge) {
				const t = dragBadge.target;
				let text: string;
				if (dragBadge.kind === 'move') {
					const c = t.getCenterPoint();
					text = `X ${Math.round(c.x)}  Y ${Math.round(c.y)}`;
				} else if (dragBadge.kind === 'scale') {
					text = `${Math.round(t.getScaledWidth())} × ${Math.round(t.getScaledHeight())}`;
				} else {
					text = `${Math.round(((t.angle % 360) + 360) % 360)}°`;
				}
				ctx.save();
				ctx.font =
					'10.5px "iA Writer Quattro", ui-monospace, monospace';
				const w = ctx.measureText(text).width + 14;
				const h = 17;
				let bx = dragBadge.px + 14;
				let by = dragBadge.py + 18;
				if (bx + w > canvas.getWidth() - 2)
					bx = dragBadge.px - 14 - w;
				if (by + h > canvas.getHeight() - 2)
					by = dragBadge.py - 18 - h;
				ctx.fillStyle = ink.primary;
				ctx.fillRect(bx, by, w, h);
				ctx.fillStyle = ink.primaryFg;
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillText(text, bx + w / 2, by + h / 2 + 1);
				ctx.restore();
			}

			if (showRulers) {
				const W = canvas.getWidth();
				const H = canvas.getHeight();
				const bg = ink.background;
				const border = ink.border;
				const muted = ink.mutedFg;
				ctx.save();
				ctx.fillStyle = bg;
				ctx.fillRect(0, 0, W, RULER_PX);
				ctx.fillRect(0, 0, RULER_PX, H);
				const major = niceStep(60 / z);
				const minor = major / 5;
				ctx.strokeStyle = border;
				ctx.lineWidth = 1;
				ctx.beginPath();
				const iX0 = Math.ceil(
					(RULER_PX - vt[4]) / z / minor,
				);
				const iX1 = Math.floor((W - vt[4]) / z / minor);
				for (let i = iX0; i <= iX1; i++) {
					const px =
						Math.round(sx(i * minor)) + 0.5;
					const isMajor = i % 5 === 0;
					ctx.moveTo(px, RULER_PX);
					ctx.lineTo(
						px,
						RULER_PX - (isMajor ? 12 : 6),
					);
				}
				const iY0 = Math.ceil(
					(RULER_PX - vt[5]) / z / minor,
				);
				const iY1 = Math.floor((H - vt[5]) / z / minor);
				for (let i = iY0; i <= iY1; i++) {
					const py =
						Math.round(sy(i * minor)) + 0.5;
					const isMajor = i % 5 === 0;
					ctx.moveTo(RULER_PX, py);
					ctx.lineTo(
						RULER_PX - (isMajor ? 12 : 6),
						py,
					);
				}
				ctx.moveTo(0, RULER_PX - 0.5);
				ctx.lineTo(W, RULER_PX - 0.5);
				ctx.moveTo(RULER_PX - 0.5, 0);
				ctx.lineTo(RULER_PX - 0.5, H);
				ctx.stroke();
				ctx.fillStyle = muted;
				ctx.font =
					'9px "iA Writer Quattro", ui-monospace, monospace';
				ctx.textBaseline = 'top';
				ctx.textAlign = 'left';
				for (
					// remove tick rounding error
					let i = Math.ceil(iX0 / 5) * 5;
					i <= iX1;
					i += 5
				) {
					ctx.fillText(
						String(Math.round(i * minor)),
						Math.round(sx(i * minor)) + 3,
						2,
					);
				}
				for (
					let i = Math.ceil(iY0 / 5) * 5;
					i <= iY1;
					i += 5
				) {
					const py = Math.round(sy(i * minor));
					ctx.save();
					ctx.translate(2, py - 3);
					ctx.rotate(-Math.PI / 2);
					ctx.fillText(
						String(Math.round(i * minor)),
						0,
						0,
					);
					ctx.restore();
				}
				ctx.restore();
			}
		});

		const unsubscribeGuides = subscribeGuides(() =>
			canvas.requestRenderAll(),
		);
		const unsubscribeToolSettings = subscribeToolSettings(() => {
			applySelection();
			canvas.requestRenderAll();
		});

		// prevent selection feedback loop
		const unsubscribeSelection = subscribeSelection(applySelection);

		const stopColourSink = startColourSink();

		let stopPerfHud: (() => void) | null = null;
		if (import.meta.env.DEV) {
			const toScreen = (x: number, y: number) => {
				const vt = canvas.viewportTransform;
				return {
					x: x * vt[0] + vt[4],
					y: y * vt[3] + vt[5],
				};
			};
			(
				window as unknown as Record<string, unknown>
			).__substrata = {
				selection: () => {
					const a = canvas.getActiveObject();
					return {
						active: a?.constructor.name,
						box: a && {
							left: a.left,
							top: a.top,
							width: a.width,
							height: a.height,
							angle: a.angle,
						},
						children:
							a instanceof
							ActiveSelection
								? a
										.getObjects()
										.map(
											(
												o,
											) => ({
												id: getLayerIdForObject(
													o,
												),
												left: o.left,
												top: o.top,
												angle: o.angle,
												scaleX: o.scaleX,
												scaleY: o.scaleY,
												skewX: o.skewX,
												aCoords: o.calcACoords(),
											}),
										)
								: null,
					};
				},
				layers: () => {
					const doc = getSnapshot();
					if (!doc) return [];
					return leafRenderList(doc.layers).map(
						(e) => {
							const obj =
								state.byId.get(
									e.layer
										.id,
								);
							const c =
								obj?.getCenterPoint();
							return {
								id: e.layer.id,
								kind: e.layer
									.kind,
								name: e.layer
									.name,
								parent:
									parentIdOf(
										doc.layers,
										e
											.layer
											.id,
									) ??
									null,
								scene: c && {
									x: c.x,
									y: c.y,
								},
								screen:
									c &&
									toScreen(
										c.x,
										c.y,
									),
								filters: e.layer.filters.map(
									(f) =>
										f.type,
								),
								effects: e.layer.effects.map(
									(f) =>
										f.type,
								),
								crop:
									e.layer
										.crop ??
									null,
							};
						},
					);
				},
				select: (ids: string[]) => setSelection(ids),
				setSeparate: (v: boolean) =>
					setTransformAsGroup(!v),
				upperCanvasCount: () =>
					document.querySelectorAll(
						'canvas.upper-canvas',
					).length,
				vt: () => canvas.viewportTransform,
				menuState: () => getLayerMenu(),
				hitTest: (x: number, y: number) => {
					const info = canvas.findTarget(
						new MouseEvent('contextmenu', {
							clientX: x,
							clientY: y,
						}),
					);
					return {
						target:
							info.target?.constructor
								.name ?? null,
						layerId: info.target
							? (getLayerIdForObject(
									info.target,
								) ?? null)
							: null,
					};
				},
				fx: (
					layerId: string,
					type: string,
					params?: Record<
						string,
						number | string
					>,
				) => addFx(layerId, 'filters', type, params),
				fxParam: (
					layerId: string,
					fxId: string,
					key: string,
					value: number | string,
					transient?: boolean,
				) =>
					setFxParam(
						layerId,
						'filters',
						fxId,
						key,
						value,
						{ transient },
					),
				setTool: (tool: ToolId, sub?: string) => {
					setActiveTool(tool);
					if (sub) setActiveSub(tool, sub);
				},
				toolSettings: (
					tool:
						| 'move'
						| 'select'
						| 'text'
						| 'pieces',
					patch: object,
				) => updateToolSettings(tool, patch),
				shapeParams: setShapeParams,
				textProps: setTextProps,
				moveLayer,
				groupLayers,
				setOpacity,
				setCrop,

				textDump: (id: string) => {
					const doc = getSnapshot();
					const l = doc
						? findLayer(doc.layers, id)
						: null;
					return l && l.kind === 'text'
						? {
								align: l.align,
								lineHeight: l.lineHeight,
								charSpacing:
									l.charSpacing,
								direction: l.direction,
							}
						: null;
				},
				colour: setHex,
				effect: (
					layerId: string,
					type: string,
					params?: Record<
						string,
						number | string
					>,
				) => addFx(layerId, 'effects', type, params),
				effectParam: (
					layerId: string,
					fxId: string,
					key: string,
					value: number | string,
					transient?: boolean,
				) =>
					setFxParam(
						layerId,
						'effects',
						fxId,
						key,
						value,
						{ transient },
					),
				gesture: {
					begin: beginTransient,
					commit: commitTransient,
				},
				toggleGuidePref: toggleGuide,
				addRaster: async (
					w: number,
					h: number,
					rects: {
						x: number;
						y: number;
						w: number;
						h: number;
						colour: string;
					}[],
					at?: { x: number; y: number },
				) => {
					const c =
						document.createElement(
							'canvas',
						);
					c.width = w;
					c.height = h;
					const cctx = c.getContext('2d');
					if (!cctx) return;
					for (const r of rects) {
						cctx.fillStyle = r.colour;
						cctx.fillRect(
							r.x,
							r.y,
							r.w,
							r.h,
						);
					}
					const blob = await new Promise<Blob>(
						(res, rej) =>
							c.toBlob(
								(b) =>
									b
										? res(
												b,
											)
										: rej(
												new Error(
													'toBlob failed',
												),
											),
								'image/png',
							),
					);
					await importImageFile(
						new File([blob], 'test.png', {
							type: 'image/png',
						}),
						at ? { at } : undefined,
					);
				},
				rasterize: rasterizeLayer,
				packScene: async () => {
					const doc = getSnapshot();
					if (!doc) return null;
					const blob = await packSubstrata(doc);
					return Array.from(
						new Uint8Array(
							await blob.arrayBuffer(),
						),
					);
				},
				unpackScene: async (bytes: number[]) => {
					setDoc(
						await unpackSubstrata(
							new Uint8Array(bytes)
								.buffer,
						),
					);
				},
				pixelSelection: () => {
					const s = getPixelSelection();
					return (
						s && {
							epoch: s.epoch,
							bounds: s.bounds,
							area: maskArea(s.mask),
						}
					);
				},
				selectOps: {
					invert: () => invertSelection(),
					grow: () => growSelection(),
					shrink: () => shrinkSelection(),
					extract: () => extractSelection(),
					cut: () => cutSelection(),
					deselect: () => clearPixelSelection(),
				},
				guides: () => getSnapshot()?.guides ?? [],
				sampleTop: (sxp: number, syp: number) => {
					const dpr =
						window.devicePixelRatio || 1;
					return Array.from(
						canvas.contextTop.getImageData(
							Math.round(sxp * dpr),
							Math.round(syp * dpr),
							1,
							1,
						).data,
					);
				},
				resolveDims: resolveExportDims,
				exportBlob: async (
					opts?: Partial<ExportOptions>,
					probeAt?: [number, number][],
				) => {
					const outcome: ExportOutcome =
						await runExport(
							{
								format: 'png',
								scale: 1,
								quality: 90,
								scope: 'artboard',
								...opts,
							},
							{ download: false },
						);
					if (!outcome.ok)
						return {
							ok: false,
							reason: outcome.reason,
						};
					const probe: number[][] = [];
					try {
						const bitmap =
							await createImageBitmap(
								outcome.blob,
							);
						const c =
							document.createElement(
								'canvas',
							);
						c.width = bitmap.width;
						c.height = bitmap.height;
						const pctx = c.getContext(
							'2d',
							{
								willReadFrequently: true,
							},
						);
						if (pctx) {
							pctx.drawImage(
								bitmap,
								0,
								0,
							);
							bitmap.close();
							for (const [
								fx,
								fy,
							] of probeAt ?? [
								[0.005, 0.005],
								[0.5, 0.5],
							]) {
								const x =
									Math.round(
										(fx ??
											0) *
											(c.width -
												1),
									);
								const y =
									Math.round(
										(fy ??
											0) *
											(c.height -
												1),
									);
								probe.push(
									Array.from(
										pctx.getImageData(
											x,
											y,
											1,
											1,
										)
											.data,
									),
								);
							}
						}
					} catch {
					}
					return {
						ok: true,
						size: outcome.blob.size,
						type: outcome.blob.type,
						width: outcome.width,
						height: outcome.height,
						effectiveScale:
							outcome.effectiveScale,
						downscaled: outcome.downscaled,
						filename: outcome.filename,
						probe,
					};
				},
				samplePixel: (sxp: number, syp: number) => {
					const dpr =
						window.devicePixelRatio || 1;
					return Array.from(
						canvas
							.getContext()
							.getImageData(
								Math.round(
									sxp *
										dpr,
								),
								Math.round(
									syp *
										dpr,
								),
								1,
								1,
							).data,
					);
				},
				elementSizes: (layerId: string) => {
					const o = state.byId.get(
						layerId,
					) as unknown as {
						_element?: {
							width: number;
							height: number;
						};
						_originalElement?: {
							width: number;
							height: number;
						};
					};
					return {
						element: o?._element && [
							o._element.width,
							o._element.height,
						],
						original: o?._originalElement && [
							o._originalElement
								.width,
							o._originalElement
								.height,
						],
					};
				},
				setMatte: (
					layerId: string,
					rects: {
						x: number;
						y: number;
						w: number;
						h: number;
					}[],
				) => {
					const doc = getSnapshot();
					const l =
						doc &&
						findLayer(doc.layers, layerId);
					if (!l || l.kind !== 'raster')
						return false;
					const c =
						document.createElement(
							'canvas',
						);
					c.width = l.naturalWidth;
					c.height = l.naturalHeight;
					const mctx = c.getContext('2d');
					if (!mctx) return false;
					for (const r of rects)
						mctx.fillRect(
							r.x,
							r.y,
							r.w,
							r.h,
						);
					putMatte(l.blobHash, c);
					return true;
				},
				matte: (layerId: string) => {
					const doc = getSnapshot();
					const l =
						doc &&
						findLayer(doc.layers, layerId);
					if (!l || l.kind !== 'raster')
						return null;
					return {
						loaded: !!getMatte(l.blobHash),
						status:
							getMatteStatus(
								l.blobHash,
							) ?? null,
					};
				},
				resizeReflow: (w: number, h: number) =>
					resizeArtboardReflow({
						width: w,
						height: h,
					}),
			};

			if (
				new URLSearchParams(window.location.search).has(
					'hud',
				)
			) {
				const hud = document.createElement('div');
				hud.style.cssText =
					'position:fixed;top:56px;right:8px;z-index:9999;background:rgba(0,0,0,.75);color:#4ade80;' +
					'font:11px/1.6 ui-monospace,monospace;padding:6px 9px;pointer-events:none;white-space:pre';
				document.body.appendChild(hud);
				let frames = 0;
				let renders = 0;
				let renderMs = 0;
				let renderT0 = 0;
				let moves = 0;
				let coalesced = 0;
				let lastMoveTs = 0;
				let latencyMs = 0;
				let latencyN = 0;
				let touchMoves = 0;
				let objMoving = 0;
				let rraCalls = 0;
				let evMs = 0;
				let evN = 0;
				const origOnMouseMoveHud =
					internals._onMouseMove.bind(canvas);
				internals._onMouseMove = (e: Event) => {
					const t0 = performance.now();
					origOnMouseMoveHud(e);
					evMs += performance.now() - t0;
					evN++;
				};
				const onHudTouchMove = () => {
					touchMoves++;
				};
				window.addEventListener(
					'touchmove',
					onHudTouchMove,
					{
						passive: true,
						capture: true,
					},
				);
				const onObjMoving = () => {
					objMoving++;
				};
				canvas.on('object:moving', onObjMoving);
				const origRra =
					canvas.requestRenderAll.bind(canvas);
				canvas.requestRenderAll = () => {
					rraCalls++;
					return origRra();
				};
				const onBeforeRender = () => {
					renderT0 = performance.now();
				};
				const onAfterRender = () => {
					const now = performance.now();
					renders++;
					renderMs += now - renderT0;
					if (lastMoveTs) {
						latencyMs += now - lastMoveTs;
						latencyN++;
						lastMoveTs = 0;
					}
				};
				canvas.on('before:render', onBeforeRender);
				canvas.on('after:render', onAfterRender);
				const onHudMove = (e: PointerEvent) => {
					moves++;
					coalesced +=
						e.getCoalescedEvents?.()
							.length ?? 1;
					lastMoveTs = e.timeStamp;
				};
				window.addEventListener(
					'pointermove',
					onHudMove,
					{ passive: true },
				);
				let busyMs = 0;
				let ltMs = 0;
				let ltSupported = false;
				// safari lacks longtask entries
				let po: PerformanceObserver | null = null;
				try {
					po = new PerformanceObserver((list) => {
						for (const entry of list.getEntries())
							ltMs += entry.duration;
					});
					po.observe({ type: 'longtask' });
					ltSupported = true;
				} catch {
					po = null;
				}
				let lastTurn = performance.now();
				let pumpId = 0;
				const pump = () => {
					const now = performance.now();
					const drift = now - lastTurn - 4;
					if (drift > 0) busyMs += drift;
					lastTurn = now;
					pumpId = window.setTimeout(pump, 4);
				};
				pumpId = window.setTimeout(pump, 4);
				let rafId = 0;
				let winT0 = performance.now();
				const tick = () => {
					frames++;
					const now = performance.now();
					if (now - winT0 >= 1000) {
						const s = (now - winT0) / 1000;
						hud.textContent =
							`raf    ${(frames / s).toFixed(0)} fps\n` +
							`moves  ${(moves / s).toFixed(0)}/s (${(coalesced / s).toFixed(0)} coalesced)\n` +
							`touch  ${(touchMoves / s).toFixed(0)}/s\n` +
							`objmov ${(objMoving / s).toFixed(0)}/s  rra ${(rraCalls / s).toFixed(0)}/s\n` +
							`render ${renders ? (renderMs / renders).toFixed(1) : '-'} ms × ${(renders / s).toFixed(0)}/s\n` +
							`evcost ${evN ? (evMs / evN).toFixed(2) : '-'} ms × ${(evN / s).toFixed(0)}/s = ${((evMs / (s * 1000)) * 100).toFixed(0)}%\n` +
							`busy   ~${((busyMs / (s * 1000)) * 100).toFixed(0)}%${ltSupported ? `  lt ${((ltMs / (s * 1000)) * 100).toFixed(0)}%` : ''}\n` +
							`input→paint ${latencyN ? (latencyMs / latencyN).toFixed(0) : '-'} ms\n` +
							`backing ${document.querySelector<HTMLCanvasElement>('canvas.lower-canvas')?.width ?? '-'}px`;
						frames =
							moves =
							coalesced =
							renders =
								0;
						renderMs = latencyMs = 0;
						touchMoves =
							objMoving =
							rraCalls =
								0;
						evMs = evN = 0;
						busyMs = ltMs = 0;
						latencyN = 0;
						winT0 = now;
					}
					rafId = requestAnimationFrame(tick);
				};
				rafId = requestAnimationFrame(tick);
				stopPerfHud = () => {
					cancelAnimationFrame(rafId);
					window.clearTimeout(pumpId);
					po?.disconnect();
					window.removeEventListener(
						'pointermove',
						onHudMove,
					);
					window.removeEventListener(
						'touchmove',
						onHudTouchMove,
						{
							capture: true,
						},
					);
					canvas.off(
						'object:moving',
						onObjMoving,
					);
					canvas.requestRenderAll = origRra;
					internals._onMouseMove =
						origOnMouseMoveHud;
					canvas.off(
						'before:render',
						onBeforeRender,
					);
					canvas.off(
						'after:render',
						onAfterRender,
					);
					hud.remove();
				};
			}
		}

		const unsubscribe = subscribe(render);
		const unsubscribeLuts = subscribeLuts(render);
		const unsubscribeMattes = subscribeMattes(render);
		render();
		fit();

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
			if (doc) {
				setDoc(doc);
				fit();
				return;
			}
			// automation bypasses onboarding
			if (navigator.webdriver) {
				setDoc(createEmptyDoc());
				fit();
				return;
			}
			openModal(
				isOnboardingSeen() ? 'new-scene' : 'onboarding',
			);
		})();

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
		const unsubscribePersistence =
			subscribePersistence(syncPersistence);
		syncPersistence();

		const ro = new ResizeObserver(fit);
		ro.observe(wrap);

		const setDropHint = (on: boolean) =>
			dropHint?.classList.toggle('hidden', !on);
		const onDragOver = (e: DragEvent) => {
			e.preventDefault();
			if (e.dataTransfer?.types.includes('Files'))
				setDropHint(true);
		};
		const onDragLeave = (e: DragEvent) => {
			if (!wrap.contains(e.relatedTarget as Node | null))
				setDropHint(false);
		};
		const onDrop = (e: DragEvent) => {
			e.preventDefault();
			setDropHint(false);
			const files = e.dataTransfer?.files;
			if (!files) return;
			for (const f of Array.from(files)) {
				if (f.type.startsWith('image/'))
					void importImageFile(f);
			}
		};
		wrap.addEventListener('dragover', onDragOver);
		wrap.addEventListener('dragleave', onDragLeave);
		wrap.addEventListener('drop', onDrop);

		const onBeforeUnload = (e: BeforeUnloadEvent) => {
			if (canUndo() && !getPersistenceEnabled())
				e.preventDefault();
		};
		window.addEventListener('beforeunload', onBeforeUnload);

		canvas.on('contextmenu', ({ e, target }) => {
			e.preventDefault();
			const me = e as MouseEvent;
			if (!target) {
				const scene = canvas.getScenePoint(me);
				openCanvasMenu(me.clientX, me.clientY, {
					x: scene.x,
					y: scene.y,
				});
				return;
			}
			if (
				target === canvas.getActiveObject() &&
				target instanceof ActiveSelection
			) {
				openLayerMenu(
					me.clientX,
					me.clientY,
					getSelectedLayerIds(),
				);
				return;
			}
			const layerId = getLayerIdForObject(target);
			if (!layerId) return;
			const ids = getSelectedLayerIds();
			if (!ids.includes(layerId)) {
				setSelection([layerId]);
				openLayerMenu(me.clientX, me.clientY, [
					layerId,
				]);
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
			unsubscribeMattes();
			unsubscribeSelection();
			unsubscribeTool();
			stopColourSink();
			unsubscribeGuides();
			unsubscribeToolSettings();
			themeObserver.disconnect();
			if (antTimer !== null) window.clearInterval(antTimer);
			unsubscribePixelSelection();
			delete (window as unknown as Record<string, unknown>)[
				'__substrata'
			];
			stopPerfHud?.();
			registerViewportController(null);
			registerExportRenderer(null);
			registerLayerBaker(null);
			ro.disconnect();
			// commit active crop transient
			if (cropDrag) commitTransient();
			guideDrag = null;
			cropDrag = null;
			wrap.removeEventListener(
				'pointerdown',
				onGuidePointerDown,
				{
					capture: true,
				},
			);
			window.removeEventListener(
				'pointermove',
				onGuidePointerMove,
			);
			window.removeEventListener(
				'pointerup',
				onGuidePointerUp,
			);
			window.removeEventListener(
				'pointercancel',
				onGuidePointerCancel,
			);
			wrap.removeEventListener(
				'pointerdown',
				onNavPointerDown,
				{
					capture: true,
				},
			);
			wrap.removeEventListener(
				'touchstart',
				onNavTouchStart,
				{
					capture: true,
				},
			);
			window.removeEventListener(
				'pointermove',
				onNavPointerMove,
				{
					capture: true,
				},
			);
			window.removeEventListener(
				'pointerup',
				onNavPointerEnd,
				{
					capture: true,
				},
			);
			window.removeEventListener(
				'pointercancel',
				onNavPointerEnd,
				{
					capture: true,
				},
			);
			if (resDropEnabled) {
				window.clearTimeout(restoreTimer);
				wrap.removeEventListener(
					'pointerdown',
					onResPointerDown,
					{
						capture: true,
					},
				);
				window.removeEventListener(
					'pointermove',
					onResPointerMove,
					{
						capture: true,
					},
				);
				window.removeEventListener(
					'pointerup',
					onResPointerEnd,
					{
						capture: true,
					},
				);
				window.removeEventListener(
					'pointercancel',
					onResPointerEnd,
					{
						capture: true,
					},
				);
			}
			wrap.removeEventListener('dragover', onDragOver);
			wrap.removeEventListener('dragleave', onDragLeave);
			window.removeEventListener(
				'beforeunload',
				onBeforeUnload,
			);
			wrap.removeEventListener('wheel', onWheel);
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
			wrap.removeEventListener('drop', onDrop);
			void canvas.dispose();
		};
	});

	<template>
		<div
			class="sub-canvas-wrap"
			{{this.mount}}
			{{filePaste this.paste accept="image/*"}}
		>
						<div
				class="sub-canvas-wordmark"
				aria-hidden="true"
			></div>
			<canvas></canvas>
						<div
				class="sub-canvas-drop-hint hidden"
				aria-hidden="true"
			></div>
		</div>
	</template>
}
