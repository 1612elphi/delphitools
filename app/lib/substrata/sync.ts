import type { Canvas, FabricObject } from 'fabric';
import {
	Ellipse,
	Gradient as FabricGradient,
	Line,
	Path,
	Pattern,
	Point,
	Polygon,
	Rect,
	Shadow,
	util as fabricPathUtil,
} from 'fabric';
import type {
	SubstrataDoc,
	FreehandLayer,
	Layer,
	ShapeLayer,
	ShapeParams,
	TextLayer,
} from './doc-model';
import { EffectsImage } from './effects-image';
import { SubstrataText } from './text-object';
import { resolveFontCss } from './fonts';
import { DEFAULT_TEXT_PROPS } from './text-style';
import { findLayer, leafRenderList } from './layer-tree';
import { getRaster } from './raster-cache';
import { outlineToPathD, strokeOutline } from './freehand';
import { layerDims, polygonPoints, starPoints } from './shape-geometry';
import { presetShape, SYMBOL_GRID } from './preset-shapes';
import { syncImageEffects, syncImageFilters } from './filter-sync';

const ARTBOARD_KEY = '__artboard__';

function checkerSource(dark: boolean): HTMLCanvasElement {
	const [a, b] = dark ? ['#404040', '#333333'] : ['#ffffff', '#cccccc'];
	const c = document.createElement('canvas');
	c.width = 20;
	c.height = 20;
	const ctx = c.getContext('2d')!;
	ctx.fillStyle = a;
	ctx.fillRect(0, 0, 20, 20);
	ctx.fillStyle = b;
	ctx.fillRect(0, 0, 10, 10);
	ctx.fillRect(10, 10, 10, 10);
	return c;
}

function getCheckerPattern(state: ReconcileState): Pattern {
	const dark =
		typeof document !== 'undefined' &&
		document.documentElement.classList.contains('dark');
	if (!state.checker || state.checker.dark !== dark) {
		state.checker = {
			dark,
			pattern: new Pattern({
				source: checkerSource(dark),
				repeat: 'repeat',
			}),
		};
	}
	return state.checker.pattern;
}

const layerIdOf = new WeakMap<FabricObject, string>();

export function getLayerIdForObject(obj: FabricObject): string | undefined {
	return layerIdOf.get(obj);
}

export interface ReconcileState {
	byId: Map<string, FabricObject>;
	checker?: { dark: boolean; pattern: Pattern };
}

export function createReconcileState(): ReconcileState {
	return { byId: new Map() };
}

export function reconcile(
	canvas: Canvas,
	doc: SubstrataDoc,
	state: ReconcileState,
): void {
	const { byId } = state;
	const desired: FabricObject[] = [];
	const seen = new Set<string>([ARTBOARD_KEY]);

	let artboard = byId.get(ARTBOARD_KEY) as Rect | undefined;
	if (!artboard) {
		artboard = new Rect({
			selectable: false,
			evented: false,
			hoverCursor: 'default',
		});
		byId.set(ARTBOARD_KEY, artboard);
		canvas.add(artboard);
	}
	artboard.set({
		left: 0,
		top: 0,
		width: doc.artboard.width,
		height: doc.artboard.height,
		fill: doc.artboard.background ?? getCheckerPattern(state),
		originX: 'left',
		originY: 'top',
	});
	artboard.setCoords();
	desired.push(artboard);

	const clip = (
		canvas.clipPath instanceof Rect
			? canvas.clipPath
			: new Rect({ originX: 'left', originY: 'top' })
	) as Rect;
	clip.set({
		left: 0,
		top: 0,
		width: doc.artboard.width,
		height: doc.artboard.height,
	});
	clip.setCoords();
	canvas.clipPath = clip;

	for (const entry of leafRenderList(doc.layers)) {
		const obj = syncLayer(
			canvas,
			entry.layer,
			entry.visible,
			entry.locked,
			entry.opacity,
			byId,
		);
		if (obj) {
			desired.push(obj);
			seen.add(entry.layer.id);
		}
	}

	for (const [key, obj] of byId) {
		if (!seen.has(key)) {
			canvas.remove(obj);
			byId.delete(key);
		}
	}

	for (const obj of desired) canvas.bringObjectToFront(obj);

	canvas.requestRenderAll();
}

function syncLayer(
	canvas: Canvas,
	layer: Layer,
	visible: boolean,
	locked: boolean,
	opacity: number,
	byId: Map<string, FabricObject>,
): FabricObject | null {
	const obj =
		layer.kind === 'raster'
			? syncRasterContent(canvas, layer, byId)
			: layer.kind === 'shape'
				? syncShapeContent(canvas, layer, byId)
				: layer.kind === 'freehand'
					? syncFreehandContent(
							canvas,
							layer,
							byId,
						)
					: layer.kind === 'text'
						? syncTextContent(
								canvas,
								layer,
								byId,
							)
						: null;
	if (!obj) return null;
	// preserve active text edits
	if (obj instanceof SubstrataText && obj.isEditing) return obj;

	const t = layer.transform;
	obj.set({
		left: t.x,
		top: t.y,
		scaleX: t.scaleX,
		scaleY: t.scaleY,
		angle: t.angle,
		flipX: t.flipX,
		flipY: t.flipY,
		opacity,
		visible,
		globalCompositeOperation: layer.blendMode,
		originX: 'center',
		originY: 'center',
		selectable: !locked,
		evented: !locked,
	});
	if (layer.kind === 'raster') {
		syncImageFilters(obj as EffectsImage, layer.filters);
		syncImageEffects(obj as EffectsImage, layer.effects);
	}
	syncCropClip(obj, layer);
	obj.setCoords();
	return obj;
}

const cropRectOf = new WeakMap<FabricObject, Rect>();

/** fabric crop coordinates local */
function syncCropClip(obj: FabricObject, layer: Layer): void {
	const crop = layer.crop;
	const dims = crop ? layerDims(layer) : null;
	if (!crop || !dims) {
		if (obj.clipPath) {
			obj.clipPath = undefined;
			obj.set('dirty', true);
		}
		return;
	}
	let rect = cropRectOf.get(obj);
	if (!rect) {
		rect = new Rect({ originX: 'left', originY: 'top' });
		cropRectOf.set(obj, rect);
	}
	const left = crop.x - dims.width / 2;
	const top = crop.y - dims.height / 2;
	if (
		obj.clipPath !== rect ||
		rect.left !== left ||
		rect.top !== top ||
		rect.width !== crop.w ||
		rect.height !== crop.h
	) {
		rect.set({ left, top, width: crop.w, height: crop.h });
		obj.clipPath = rect;
		obj.set('dirty', true);
	}
}

const rasterHashOf = new WeakMap<FabricObject, string>();

function syncRasterContent(
	canvas: Canvas,
	layer: Layer & { kind: 'raster' },
	byId: Map<string, FabricObject>,
): FabricObject | null {
	const src = getRaster(layer.blobHash);
	if (!src) return null; // skip undecoded rasters

	let obj = byId.get(layer.id) as EffectsImage | undefined;
	if (obj && rasterHashOf.get(obj) !== layer.blobHash) {
		// rebuild changed raster source
		canvas.remove(obj);
		byId.delete(layer.id);
		obj = undefined;
	}
	if (!obj) {
		obj = new EffectsImage(src);
		obj.sourceHash = layer.blobHash; // identifies matte cache
		rasterHashOf.set(obj, layer.blobHash);
		byId.set(layer.id, obj);
		layerIdOf.set(obj, layer.id);
		canvas.add(obj);
	}
	return obj;
}

function toFabricFill(
	fill: ShapeLayer['fill'],
): string | FabricGradient<unknown, 'linear' | 'radial'> {
	if (typeof fill === 'string') return fill;
	const g = fill;
	return new FabricGradient({
		type: g.type,
		gradientUnits: 'percentage',
		coords: g.coords,
		colorStops: g.stops.map((s) => ({
			offset: s.offset,
			color: s.colour,
		})),
	});
}

const simplifiedSymbolCache = new Map<
	string,
	ReturnType<typeof fabricPathUtil.makePathSimpler>
>();

function symbolPath(symbolId: string, width: number, height: number) {
	let simple = simplifiedSymbolCache.get(symbolId);
	if (!simple) {
		const preset = presetShape(symbolId);
		simple = fabricPathUtil.makePathSimpler(
			fabricPathUtil.parsePath(preset?.d ?? 'M0,0'),
		);
		simplifiedSymbolCache.set(symbolId, simple);
	}
	return fabricPathUtil.transformPath(
		simple,
		[width / SYMBOL_GRID, 0, 0, height / SYMBOL_GRID, 0, 0],
		new Point(0, 0),
	);
}

function buildShapeObject(p: ShapeParams): FabricObject {
	switch (p.shape) {
		case 'rectangle':
			return new Rect({
				width: p.width,
				height: p.height,
				rx: p.cornerRadius,
				ry: p.cornerRadius,
			});
		case 'ellipse':
			return new Ellipse({ rx: p.rx, ry: p.ry });
		case 'line':
			return new Line([-p.length / 2, 0, p.length / 2, 0]);
		case 'polygon':
			return new Polygon(polygonPoints(p.sides, p.radius));
		case 'star':
			return new Polygon(
				starPoints(
					p.points,
					p.outerRadius,
					p.innerRadius,
				),
			);
		case 'symbol':
			return new Path(
				symbolPath(p.symbolId, p.width, p.height),
			);
	}
}

function updateShapeGeometry(obj: FabricObject, p: ShapeParams): void {
	switch (p.shape) {
		case 'rectangle':
			obj.set({
				width: p.width,
				height: p.height,
				rx: p.cornerRadius,
				ry: p.cornerRadius,
			});
			break;
		case 'ellipse':
			obj.set({ rx: p.rx, ry: p.ry });
			break;
		case 'line':
			obj.set({
				x1: -p.length / 2,
				y1: 0,
				x2: p.length / 2,
				y2: 0,
			});
			break;
		case 'polygon':
		case 'star': {
			const poly = obj as Polygon;
			poly.points =
				p.shape === 'polygon'
					? polygonPoints(p.sides, p.radius)
					: starPoints(
							p.points,
							p.outerRadius,
							p.innerRadius,
						);
			poly.setDimensions();
			break;
		}
		case 'symbol': {
			(obj as Path)._setPath(
				symbolPath(p.symbolId, p.width, p.height),
				true,
			);
			break;
		}
	}
	obj.set('dirty', true);
}

const freehandBuiltFor = new WeakMap<
	FabricObject,
	{ pts: unknown; opts: unknown }
>();

function syncFreehandContent(
	canvas: Canvas,
	layer: FreehandLayer,
	byId: Map<string, FabricObject>,
): FabricObject | null {
	let obj = byId.get(layer.id);
	const built = obj && freehandBuiltFor.get(obj);
	if (
		obj &&
		built &&
		(built.pts !== layer.rawPoints ||
			built.opts !== layer.strokeOptions)
	) {
		canvas.remove(obj);
		byId.delete(layer.id);
		obj = undefined;
	}
	if (!obj) {
		const d = outlineToPathD(
			strokeOutline(layer.rawPoints, layer.strokeOptions),
		);
		if (!d) return null; // skip degenerate strokes
		obj = new Path(d);
		freehandBuiltFor.set(obj, {
			pts: layer.rawPoints,
			opts: layer.strokeOptions,
		});
		byId.set(layer.id, obj);
		layerIdOf.set(obj, layer.id);
		canvas.add(obj);
	}
	obj.set({ fill: layer.fill, stroke: null, strokeWidth: 0 });
	return obj;
}

function syncTextContent(
	canvas: Canvas,
	layer: TextLayer,
	byId: Map<string, FabricObject>,
): FabricObject {
	let obj = byId.get(layer.id) as SubstrataText | undefined;
	if (!obj) {
		obj = new SubstrataText(layer.text);
		byId.set(layer.id, obj);
		layerIdOf.set(obj, layer.id);
		canvas.add(obj);
	}
	// apply styles during editing
	if (!obj.isEditing) obj.set({ text: layer.text });
	obj.set({
		fontFamily: resolveFontCss(layer.fontFamily),
		fontSize: layer.fontSize,
		fill: layer.fill,
		stroke: layer.stroke?.colour ?? null,
		strokeWidth: layer.stroke?.width ?? 0,
		textAlign: layer.align ?? DEFAULT_TEXT_PROPS.align,
		lineHeight: layer.lineHeight ?? DEFAULT_TEXT_PROPS.lineHeight,
		charSpacing:
			layer.charSpacing ?? DEFAULT_TEXT_PROPS.charSpacing,
		direction: layer.direction ?? DEFAULT_TEXT_PROPS.direction,
		// preserve outline caret visibility
		cursorColor: layer.stroke?.colour ?? layer.fill,
	});
	if (JSON.stringify(obj.plate) !== JSON.stringify(layer.plate)) {
		obj.plate = layer.plate;
		obj.set('dirty', true);
	}
	return obj;
}

const shapeKindOf = new WeakMap<FabricObject, ShapeParams['shape']>();

function syncShapeContent(
	canvas: Canvas,
	layer: ShapeLayer,
	byId: Map<string, FabricObject>,
): FabricObject {
	const p = layer.params;
	let obj = byId.get(layer.id);
	if (obj && shapeKindOf.get(obj) !== p.shape) {
		canvas.remove(obj);
		byId.delete(layer.id);
		obj = undefined;
	}
	if (!obj) {
		obj = buildShapeObject(p);
		shapeKindOf.set(obj, p.shape);
		byId.set(layer.id, obj);
		layerIdOf.set(obj, layer.id);
		canvas.add(obj);
	} else {
		updateShapeGeometry(obj, p);
	}
	obj.set({
		fill: p.shape === 'line' ? null : toFabricFill(layer.fill),
		stroke: layer.stroke?.colour ?? null,
		strokeWidth: layer.stroke?.width ?? 0,
		strokeDashArray: layer.stroke?.dash ?? null,
	});
	return obj;
}

/** prevent fabric export rounding */
export function renderExport(
	canvas: Canvas,
	state: ReconcileState,
	doc: SubstrataDoc,
	opts: {
		scale: number;
		soloLayerId?: string | null;
		flattenBackground?: string;
	},
): HTMLCanvasElement {
	const artboardObj = state.byId.get(ARTBOARD_KEY);
	const savedVisible = new Map<FabricObject, boolean>();

	if (opts.soloLayerId) {
		const target = findLayer(doc.layers, opts.soloLayerId);
		const keep = new Set<string>();
		if (target) {
			for (const entry of leafRenderList([
				{ ...target, visible: true },
			])) {
				if (entry.visible) keep.add(entry.layer.id);
			}
		}
		for (const [key, obj] of state.byId) {
			if (key === ARTBOARD_KEY) continue;
			savedVisible.set(obj, obj.visible);
			obj.visible = keep.has(key);
		}
	}

	const savedArtboardVisible = artboardObj?.visible;
	const savedArtboardFill = artboardObj?.fill;
	if (artboardObj) {
		if (opts.soloLayerId) artboardObj.visible = false;
		else if (doc.artboard.background === null) {
			if (opts.flattenBackground)
				artboardObj.set('fill', opts.flattenBackground);
			else artboardObj.visible = false;
		}
	}

	const savedVpt = canvas.viewportTransform;
	canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
	let el: HTMLCanvasElement;
	try {
		el = canvas.toCanvasElement(opts.scale, {
			left: 0,
			top: 0,
			width: doc.artboard.width,
			height: doc.artboard.height,
		});
	} finally {
		canvas.viewportTransform = savedVpt;
	}

	for (const [obj, visible] of savedVisible) obj.visible = visible;
	if (artboardObj) {
		if (savedArtboardVisible !== undefined)
			artboardObj.visible = savedArtboardVisible;
		artboardObj.set('fill', savedArtboardFill ?? null);
	}
	// repaint overlays after export
	canvas.requestRenderAll();
	return el;
}

/** include text plate bounds */
export function bakeLayerObject(
	state: ReconcileState,
	layer: Layer,
): HTMLCanvasElement | null {
	const obj = state.byId.get(layer.id);
	if (!obj) return null;
	const saved = {
		angle: obj.angle,
		visible: obj.visible,
		opacity: obj.opacity,
		shadow: obj.shadow,
	};
	obj.set({ angle: 0, visible: true, opacity: 1 });
	if (layer.kind === 'text' && layer.plate) {
		obj.set(
			'shadow',
			new Shadow({
				color: 'rgba(0,0,0,0)',
				blur: layer.plate.padding + 8,
				offsetX: 0,
				offsetY: 0,
			}),
		);
	}
	obj.setCoords();
	const el = obj.toCanvasElement({ enableRetinaScaling: false });
	obj.set(saved);
	obj.setCoords();
	return el;
}
