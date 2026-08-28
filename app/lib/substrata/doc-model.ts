export const SCHEMA_VERSION = 2 as const;

export type LayerId = string;

export type BlendMode =
	| 'source-over'
	| 'multiply'
	| 'screen'
	| 'overlay'
	| 'darken'
	| 'lighten'
	| 'color-dodge'
	| 'color-burn'
	| 'hard-light'
	| 'soft-light'
	| 'difference'
	| 'exclusion'
	| 'hue'
	| 'saturation'
	| 'color'
	| 'luminosity';

export interface Transform {
	x: number;
	y: number;
	scaleX: number;
	scaleY: number;
	/** degrees */
	angle: number;
	flipX: boolean;
	flipY: boolean;
}

/** raster, inside-only */
export interface Filter {
	id: string;
	type: string;
	enabled: boolean;
	params: Record<string, number | string>;
}

/** outer: below; inner: clipped */
export type EffectPhase = 'outer' | 'inner';

/** can exceed layer bounds */
export interface Effect {
	id: string;
	type: string;
	enabled: boolean;
	params: Record<string, number | string>;
}

/** unscaled layer coordinates */
export interface CropRect {
	x: number;
	y: number;
	w: number;
	h: number;
}

interface BaseLayer {
	id: LayerId;
	name: string;
	visible: boolean;
	locked: boolean;
	/** 0-1 */
	opacity: number;
	blendMode: BlendMode;
	transform: Transform;
	crop?: CropRect | null;
	filters: Filter[];
	effects: Effect[];
}

export interface RasterLayer extends BaseLayer {
	kind: 'raster';
	blobHash: string;
	naturalWidth: number;
	naturalHeight: number;
}

export interface TextPlate {
	shape: 'pill' | 'rectangle';
	colour: string;
	padding: number;
}

export type TextAlign = 'left' | 'center' | 'right' | 'justify';

export interface TextLayer extends BaseLayer {
	kind: 'text';
	text: string;
	fontFamily: string;
	fontSize: number;
	fill: string;
	stroke: { colour: string; width: number } | null;
	plate: TextPlate | null;
	align?: TextAlign;
	/** font size multiple */
	lineHeight?: number;
	/** thousandths of em */
	charSpacing?: number;
	direction?: 'ltr' | 'rtl';
}

export interface GradientStop {
	offset: number;
	colour: string;
}

/** normalized shape coordinates */
export interface Gradient {
	type: 'linear' | 'radial';
	stops: GradientStop[];
	coords: {
		x1: number;
		y1: number;
		x2: number;
		y2: number;
		r1?: number;
		r2?: number;
	};
}

export interface ShapeStroke {
	colour: string;
	width: number;
	dash?: number[];
}

export type ShapeParams =
	| {
			shape: 'rectangle';
			width: number;
			height: number;
			cornerRadius: number;
	  }
	| { shape: 'ellipse'; rx: number; ry: number }
	| { shape: 'line'; length: number }
	| { shape: 'polygon'; sides: number; radius: number }
	| {
			shape: 'star';
			points: number;
			outerRadius: number;
			innerRadius: number;
	  }
	| { shape: 'symbol'; symbolId: string; width: number; height: number };

export type PieceShape = ShapeParams['shape'];

export interface ShapeLayer extends BaseLayer {
	kind: 'shape';
	params: ShapeParams;
	fill: string | Gradient;
	stroke: ShapeStroke | null;
}

export interface FreehandStrokeOptions {
	size: number;
	thinning: number;
	smoothing: number;
	streamline: number;
	simulatePressure: boolean;
}

export interface FreehandLayer extends BaseLayer {
	kind: 'freehand';
	/** local x, y, pressure */
	rawPoints: [number, number, number][];
	strokeOptions: FreehandStrokeOptions;
	fill: string;
}

export interface GroupLayer extends BaseLayer {
	kind: 'group';
	children: Layer[];
}

export type Layer =
	RasterLayer | TextLayer | ShapeLayer | FreehandLayer | GroupLayer;

export type ColourMode = 'rgb';

export interface Artboard {
	width: number;
	height: number;
	resolution: number;
	bitDepth: 8;
	colourMode: ColourMode;
	background: string | null;
}

export const DEFAULT_ARTBOARD: Artboard = {
	width: 2000,
	height: 1500,
	resolution: 72,
	bitDepth: 8,
	colourMode: 'rgb',
	background: '#ffffff',
};

/** x: vertical; y: horizontal */
export interface Guide {
	id: string;
	axis: 'x' | 'y';
	pos: number;
}

export interface SubstrataDoc {
	id: string;
	schemaVersion: typeof SCHEMA_VERSION;
	name: string;
	artboard: Artboard;
	layers: Layer[];
	guides: Guide[];
	createdAt: number;
	updatedAt: number;
}

export function stampLoadedDoc(doc: SubstrataDoc): SubstrataDoc {
	return {
		...doc,
		guides: doc.guides ?? [],
		schemaVersion: SCHEMA_VERSION,
	};
}

export function newId(): string {
	return crypto.randomUUID();
}

export function identityTransform(): Transform {
	return {
		x: 0,
		y: 0,
		scaleX: 1,
		scaleY: 1,
		angle: 0,
		flipX: false,
		flipY: false,
	};
}

export function createEmptyDoc(name = '', artboard?: Artboard): SubstrataDoc {
	const now = Date.now();
	return {
		id: newId(),
		schemaVersion: SCHEMA_VERSION,
		name,
		artboard: { ...(artboard ?? DEFAULT_ARTBOARD) },
		layers: [],
		guides: [],
		createdAt: now,
		updatedAt: now,
	};
}

export function createRasterLayer(opts: {
	name: string;
	blobHash: string;
	naturalWidth: number;
	naturalHeight: number;
	transform: Transform;
}): RasterLayer {
	return {
		kind: 'raster',
		id: newId(),
		name: opts.name,
		visible: true,
		locked: false,
		opacity: 1,
		blendMode: 'source-over',
		transform: opts.transform,
		filters: [],
		effects: [],
		blobHash: opts.blobHash,
		naturalWidth: opts.naturalWidth,
		naturalHeight: opts.naturalHeight,
	};
}

export function createTextLayer(opts: {
	name: string;
	text: string;
	fontFamily: string;
	fontSize: number;
	fill: string;
	stroke: TextLayer['stroke'];
	plate: TextPlate | null;
	align?: TextAlign;
	transform: Transform;
}): TextLayer {
	return {
		kind: 'text',
		id: newId(),
		name: opts.name,
		visible: true,
		locked: false,
		opacity: 1,
		blendMode: 'source-over',
		transform: opts.transform,
		filters: [],
		effects: [],
		text: opts.text,
		fontFamily: opts.fontFamily,
		fontSize: opts.fontSize,
		fill: opts.fill,
		stroke: opts.stroke,
		plate: opts.plate,
		align: opts.align,
	};
}

export function createFreehandLayer(opts: {
	name: string;
	rawPoints: [number, number, number][];
	strokeOptions: FreehandStrokeOptions;
	fill: string;
	transform: Transform;
}): FreehandLayer {
	return {
		kind: 'freehand',
		id: newId(),
		name: opts.name,
		visible: true,
		locked: false,
		opacity: 1,
		blendMode: 'source-over',
		transform: opts.transform,
		filters: [],
		effects: [],
		rawPoints: opts.rawPoints,
		strokeOptions: opts.strokeOptions,
		fill: opts.fill,
	};
}

export function createShapeLayer(opts: {
	name: string;
	params: ShapeParams;
	fill: string | Gradient;
	stroke: ShapeStroke | null;
	transform: Transform;
}): ShapeLayer {
	return {
		kind: 'shape',
		id: newId(),
		name: opts.name,
		visible: true,
		locked: false,
		opacity: 1,
		blendMode: 'source-over',
		transform: opts.transform,
		filters: [],
		effects: [],
		params: opts.params,
		fill: opts.fill,
		stroke: opts.stroke,
	};
}
