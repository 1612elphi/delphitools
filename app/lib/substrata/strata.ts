import { Point, util as fabricPathUtil } from 'fabric';
import type {
	AssetSource,
	CropRect,
	Layer,
	LayerMask,
	RasterLayer,
	SubstrataDoc,
	Transform,
} from './doc-model';
import { getSnapshot, update, updateTransient } from './doc-store';
import { ingestImage } from './import-raster';
import {
	findLayer,
	isGroup,
	leafLayers,
	mapLayerInTree,
	removeLayers,
} from './layer-tree';
import { setActiveLayer } from './selection';
import { toast } from './toast';

export function isFrame(layer: Layer | null): layer is RasterLayer {
	return layer?.kind === 'raster' && !!layer.stratum;
}

export function setStratum(ids: readonly string[], on: boolean): void {
	const doc = getSnapshot();
	if (!doc) return;
	const leaves = new Set(
		ids.flatMap((id) => {
			const l = findLayer(doc.layers, id);
			return l ? leafLayers(l).map((leaf) => leaf.id) : [];
		}),
	);
	update((d) => {
		let layers = d.layers;
		for (const id of leaves)
			layers = mapLayerInTree(layers, id, (l) => ({
				...l,
				stratum: on || undefined,
			}));
		return { ...d, layers, updatedAt: Date.now() };
	});
}

interface FramePatch {
	naturalWidth: number;
	naturalHeight: number;
	transform: Transform;
	crop: CropRect | null;
	mask: LayerMask | null;
}

// cover-fit, keep frame box
export function fitFrame(
	layer: RasterLayer,
	width: number,
	height: number,
): FramePatch {
	const W = layer.naturalWidth;
	const H = layer.naturalHeight;
	const F = layer.crop ?? { x: 0, y: 0, w: W, h: H };
	const t = layer.transform;
	const boxW = F.w * t.scaleX;
	const boxH = F.h * t.scaleY;
	const s = Math.max(boxW / width, boxH / height);
	const cw = boxW / s;
	const ch = boxH / s;
	const crop = {
		x: (width - cw) / 2,
		y: (height - ch) / 2,
		w: cw,
		h: ch,
	};

	const dx = (F.x + F.w / 2 - W / 2) * t.scaleX * (t.flipX ? -1 : 1);
	const dy = (F.y + F.h / 2 - H / 2) * t.scaleY * (t.flipY ? -1 : 1);
	const a = (t.angle * Math.PI) / 180;
	const transform = {
		...t,
		x: t.x + dx * Math.cos(a) - dy * Math.sin(a),
		y: t.y + dx * Math.sin(a) + dy * Math.cos(a),
		scaleX: s,
		scaleY: s,
	};

	let mask = layer.mask ?? null;
	if (mask) {
		const ax = (W * cw) / (F.w * width);
		const ay = (H * ch) / (F.h * height);
		const bx = ((crop.x - (F.x * cw) / F.w) / width) * 100;
		const by = ((crop.y - (F.y * ch) / F.h) / height) * 100;
		const path = fabricPathUtil.makePathSimpler(
			fabricPathUtil.parsePath(mask.d),
		);
		mask = {
			...mask,
			d: fabricPathUtil.joinPath(
				fabricPathUtil.transformPath(
					path,
					[ax, 0, 0, ay, bx, by],
					new Point(0, 0),
				),
				3,
			),
		};
	}

	const whole = cw >= width - 0.5 && ch >= height - 0.5;
	return {
		naturalWidth: width,
		naturalHeight: height,
		transform,
		crop: whole ? null : crop,
		mask,
	};
}

interface FrameImage {
	hash: string;
	width: number;
	height: number;
	source?: AssetSource;
}

// one undo step
function fillFrame(id: string, img: FrameImage, consume?: string): boolean {
	const layer = findLayer(getSnapshot()?.layers ?? [], id);
	if (!isFrame(layer)) return false;
	const patch = fitFrame(layer, img.width, img.height);
	update((doc) => {
		let layers = mapLayerInTree(doc.layers, id, (l) =>
			l.kind === 'raster'
				? {
						...l,
						...patch,
						blobHash: img.hash,
						source: img.source,
					}
				: l,
		);
		if (consume)
			layers = removeLayers(
				layers,
				new Set([consume]),
			).layers;
		return { ...doc, layers, updatedAt: Date.now() };
	});
	toast('image-added');
	return true;
}

export async function replaceFrameImage(
	id: string,
	file: File,
	source?: AssetSource,
): Promise<void> {
	const raster = await ingestImage(file);
	if (raster) fillFrame(id, { ...raster, source });
}

// ponytail: takes the full source pixels; its crop, mask and effects drop
export function moveIntoFrame(frameId: string, sourceId: string): boolean {
	const src = findLayer(getSnapshot()?.layers ?? [], sourceId);
	if (src?.kind !== 'raster' || src.stratum || sourceId === frameId)
		return false;
	const img = {
		hash: src.blobHash,
		width: src.naturalWidth,
		height: src.naturalHeight,
		source: src.source,
	};
	if (!fillFrame(frameId, img, sourceId)) return false;
	setActiveLayer(frameId);
	return true;
}

export function pickFrameImage(id: string): void {
	const input = document.createElement('input');
	input.type = 'file';
	input.accept = 'image/*';
	input.onchange = () => {
		const file = input.files?.[0];
		if (file) void replaceFrameImage(id, file);
	};
	input.click();
}

type Recolour = (hex: string) => string;

function recolourLayer(l: Layer, map: Recolour): Layer {
	if (isGroup(l))
		return {
			...l,
			children: l.children.map((c) => recolourLayer(c, map)),
		};
	if (!l.stratum) return l;
	switch (l.kind) {
		case 'shape':
			return {
				...l,
				fill:
					typeof l.fill === 'string'
						? map(l.fill)
						: {
								...l.fill,
								stops: l.fill.stops.map(
									(
										s,
									) => ({
										...s,
										colour: map(
											s.colour,
										),
									}),
								),
							},
				stroke: l.stroke && {
					...l.stroke,
					colour: map(l.stroke.colour),
				},
			};
		case 'text':
			return {
				...l,
				fill: map(l.fill),
				stroke: l.stroke && {
					...l.stroke,
					colour: map(l.stroke.colour),
				},
				plate: l.plate && {
					...l.plate,
					colour: map(l.plate.colour),
				},
			};
		case 'freehand':
			return { ...l, fill: map(l.fill) };
		default:
			return l;
	}
}

// ponytail: groups by exact hex, so two colours dragged onto the same
// value merge for good; palette slots on the doc if that bites
export function templateColours(doc: SubstrataDoc): string[] {
	const seen = new Set<string>();
	const collect: Recolour = (hex) => {
		seen.add(hex.toLowerCase());
		return hex;
	};
	for (const l of doc.layers) recolourLayer(l, collect);
	return [...seen];
}

export function recolourStrata(
	from: string,
	to: string,
	transient: boolean,
): void {
	const key = from.toLowerCase();
	const map: Recolour = (hex) => (hex.toLowerCase() === key ? to : hex);
	const apply = (doc: SubstrataDoc): SubstrataDoc => ({
		...doc,
		layers: doc.layers.map((l) => recolourLayer(l, map)),
		updatedAt: Date.now(),
	});
	if (transient) updateTransient(apply);
	else update(apply);
}
