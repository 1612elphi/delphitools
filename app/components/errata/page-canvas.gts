import Component from '@glimmer/component';
import { modifier } from 'ember-modifier';
import {
	Canvas,
	Ellipse,
	FabricImage,
	IText,
	Line,
	Path,
	Pattern,
	PencilBrush,
	Point,
	Rect,
	util as fabricUtil,
	type FabricObject,
	type TPointerEventInfo,
} from 'fabric';
import {
	bounds,
	boxAt,
	cropFromDisplayed,
	NOTE_PATH,
	newId,
	pageSize,
	type ErrataDoc,
	type ImageObject,
	type InkObject,
	type PageCrop,
	type PageObject,
	type ShapeKind,
	type ShapeObject,
	applyMatrix,
	type ContentEdit,
	type FieldObject,
} from 'delphitools-v2/lib/errata/doc-model';
import {
	addObject,
	getPageIndex,
	patchObjects,
	removeObjects,
	setPageIndex,
	store,
	subscribePage,
} from 'delphitools-v2/lib/errata/store';
import { addContentEdits } from 'delphitools-v2/lib/errata/page-ops';
import {
	pageContent,
	type PageContentView,
} from 'delphitools-v2/lib/errata/content';
import type {
	TextLine,
	TextRun,
} from 'delphitools-v2/lib/errata/content/interpret';
import {
	pageFontFace,
	type PageFontFace,
} from 'delphitools-v2/lib/errata/source';
import { winAnsiCode } from 'delphitools-v2/lib/errata/content/fonts';
import { SUBSTITUTE_RES } from 'delphitools-v2/lib/errata/content/rewrite';
import {
	pageKey,
	renderTile,
	type TileJob,
} from 'delphitools-v2/lib/errata/source';
import { activeTool, toolSettings } from 'delphitools-v2/lib/errata/tool';
import {
	boxMode,
	cropDraft,
	hostFrame,
	openNote,
	registerCanvasActions,
	selection,
	type Box,
	type CropDraft,
} from 'delphitools-v2/lib/errata/ui';
import { commentAuthor, newComment } from 'delphitools-v2/lib/errata/comments';
import { redactObject } from 'delphitools-v2/lib/errata/redact';
import { fieldDraft, newField } from 'delphitools-v2/lib/errata/fields';
import { FONT, fieldVisual } from 'delphitools-v2/lib/errata/field-visual';
import { STAMP_RED, textObject } from 'delphitools-v2/lib/errata/stamps';
import { takenNames } from 'delphitools-v2/lib/errata/widgets';
import Backdrop from 'delphitools-v2/components/errata/backdrop';
import {
	registerViewportController,
	reportZoom,
} from 'delphitools-v2/lib/substrata/viewport';

const ZMIN = 0.1;
const ZMAX = 16;
const FIT_PAD = 24;
const GAP = 24;
const KEEP_MARGIN = 1.5;
const TILE_MARGIN = 0.5;
const TILE_DEBOUNCE = 80;
const K_MIN = 0.5;
const K_MAX = 40;
const HIGHLIGHT = '#e6007e';

function bucket(k: number): number {
	const clamped = Math.max(K_MIN, Math.min(K_MAX, k));
	return Math.pow(2, Math.round(Math.log2(clamped) * 2) / 2);
}

function fmtPt(n: number): string {
	return (Math.round(n * 10) / 10).toString();
}

function contains(outer: PageCrop, inner: PageCrop): boolean {
	return (
		outer.x <= inner.x + 0.5 &&
		outer.y <= inner.y + 0.5 &&
		outer.x + outer.width >= inner.x + inner.width - 0.5 &&
		outer.y + outer.height >= inner.y + inner.height - 0.5
	);
}

interface Tracked {
	fabric: FabricObject;
	doc: PageObject;
	pageId: string;
}

interface Tile {
	k: number;
	rect: PageCrop;
	img: FabricObject;
	stale?: boolean;
}

interface Slot {
	id: string;
	key: string;
	x: number;
	y: number;
	width: number;
	height: number;
	bg: FabricObject;
	tile: Tile | null;
	job: TileJob | null;
}

function centreProps(o: PageObject, slot: Slot) {
	return {
		left: slot.x + o.cx,
		top: slot.y + o.cy,
		originX: 'center' as const,
		originY: 'center' as const,
		angle: o.angle,
		scaleX: o.scaleX,
		scaleY: o.scaleY,
	};
}

function opacityOf(o: PageObject): number {
	return o.kind === 'text' ? (o.opacity ?? 1) : 1;
}

function needsRebuild(prev: PageObject, next: PageObject): boolean {
	if (prev.kind !== next.kind) return true;
	if (next.kind === 'ink') return (prev as InkObject).d !== next.d;
	if (next.kind === 'shape')
		return (prev as ShapeObject).shape !== next.shape;
	if (next.kind === 'image')
		return (prev as ImageObject).dataUrl !== next.dataUrl;
	if (next.kind === 'field') {
		const p = prev as FieldObject;
		return (
			p.field !== next.field ||
			p.name !== next.name ||
			p.value !== next.value ||
			p.w !== next.w ||
			p.h !== next.h ||
			p.options.join('\n') !== next.options.join('\n')
		);
	}
	return false;
}

function localPathD(
	path: Pick<Path, 'path' | 'pathOffset' | 'width' | 'height'>,
): string {
	const ox = path.pathOffset.x - path.width / 2;
	const oy = path.pathOffset.y - path.height / 2;
	return fabricUtil.joinPath(
		fabricUtil.transformPath(
			path.path,
			[1, 0, 0, 1, -ox, -oy],
			new Point(0, 0),
		),
		2,
	);
}

function placeholder(
	slot: Pick<Slot, 'x' | 'y' | 'width' | 'height'>,
	fill: string,
) {
	return new Rect({
		left: slot.x,
		top: slot.y,
		originX: 'left',
		originY: 'top',
		width: slot.width,
		height: slot.height,
		fill,
		selectable: false,
		evented: false,
		hoverCursor: 'default',
	});
}

export default class PageCanvas extends Component {
	mount = modifier((wrap: HTMLDivElement) => {
		const el = wrap.querySelector('canvas');
		if (!el) return;

		const canvas = new Canvas(el, {
			selection: true,
			preserveObjectStacking: true,
			controlsAboveOverlay: true,
		});
		const brush = new PencilBrush(canvas);
		canvas.freeDrawingBrush = brush;

		const tracked = new Map<string, Tracked>();
		let pendingSelect: string | null = null;
		const images = new Map<string, HTMLImageElement | 'loading'>();
		const slots = new Map<string, Slot>();
		let order: string[] = [];
		let sceneWidth = 0;
		let sceneHeight = 0;
		let fitPending = true;
		let derivedIndex = -1;
		let programmatic = false;
		let visibleRaf = 0;

		const slotOf = (id: string) => slots.get(id);
		const slotAt = (index: number) => slots.get(order[index] ?? '');

		const pageAt = (p: Point): Slot | null => {
			let best: Slot | null = null;
			let bestDist = Infinity;
			for (const id of order) {
				const s = slotOf(id)!;
				if (
					p.x >= s.x &&
					p.x <= s.x + s.width &&
					p.y >= s.y &&
					p.y <= s.y + s.height
				)
					return s;
				const dist =
					p.y < s.y
						? s.y - p.y
						: p.y - (s.y + s.height);
				if (dist < bestDist) {
					bestDist = dist;
					best = s;
				}
			}
			return best;
		};

		const area = wrap.closest<HTMLElement>(
			'.sub-shell-canvas-area',
		);
		const insets = () => {
			const v = area?.dataset['inset']
				?.split(',')
				.map(Number);
			return v?.length === 4 && v.every(Number.isFinite)
				? {
						top: v[0]!,
						right: v[1]!,
						bottom: v[2]!,
						left: v[3]!,
					}
				: {
						top: FIT_PAD,
						right: FIT_PAD,
						bottom: FIT_PAD,
						left: FIT_PAD,
					};
		};

		const follow = () => {
			const host = hostFrame.get();
			if (!host) return false;
			const first = host.pages()[0]?.getBoundingClientRect();
			const slot = slotAt(0);
			if (!first || !slot) return true;
			const r = wrap.getBoundingClientRect();
			const z = first.width / slot.width;
			canvas.setViewportTransform([
				z,
				0,
				0,
				z,
				first.left - r.left,
				first.top - r.top,
			]);
			return true;
		};

		const clampViewport = () => {
			if (follow()) return;
			const vpt =
				canvas.viewportTransform.slice() as typeof canvas.viewportTransform;
			const z = vpt[0];
			const { top, right, bottom, left } = insets();
			const W = canvas.getWidth() - left - right;
			const H = canvas.getHeight() - top - bottom;
			const cw = sceneWidth * z;
			const ch = sceneHeight * z;
			vpt[4] =
				cw <= W
					? left + (W - cw) / 2
					: Math.min(
							left,
							Math.max(
								left + W - cw,
								vpt[4],
							),
						);
			vpt[5] =
				ch <= H
					? top + (H - ch) / 2
					: Math.min(
							top,
							Math.max(
								top + H - ch,
								vpt[5],
							),
						);
			canvas.setViewportTransform(vpt);
		};

		let fitted = 0;
		const fitPage = (index: number) => {
			const slot = slotAt(index);
			if (!slot || follow()) return;
			const { top, right, bottom, left } = insets();
			const w = Math.max(1, canvas.getWidth() - left - right);
			const h = Math.max(
				1,
				canvas.getHeight() - top - bottom,
			);
			const z = Math.min(
				w / slot.width,
				h / slot.height,
				ZMAX,
			);
			canvas.setViewportTransform([
				z,
				0,
				0,
				z,
				left + (w - slot.width * z) / 2 - slot.x * z,
				top - slot.y * z,
			]);
			fitted = z;
			clampViewport();
			reportZoom(z);
		};

		const scrollToPage = (index: number) => {
			const slot = slotAt(index);
			if (!slot) return;
			const host = hostFrame.get();
			if (host) {
				const el = host.pages()[index];
				const r = el?.getBoundingClientRect();
				const seen =
					host.scroller.getBoundingClientRect();
				if (
					r &&
					(r.bottom < seen.top ||
						r.top > seen.bottom)
				)
					el?.scrollIntoView({ block: 'start' });
				return;
			}
			const vpt =
				canvas.viewportTransform.slice() as typeof canvas.viewportTransform;
			vpt[5] = insets().top - (slot.y - GAP / 2) * vpt[0];
			canvas.setViewportTransform(vpt);
			clampViewport();
			canvas.requestRenderAll();
		};

		const visibleRange = () => {
			const vpt = canvas.viewportTransform;
			const z = vpt[0];
			const top = -vpt[5] / z;
			return { top, bottom: top + canvas.getHeight() / z };
		};

		const reveal = (top: number, bottom: number) => {
			const seen = visibleRange();
			if (top >= seen.top && bottom <= seen.bottom) return;
			const vpt =
				canvas.viewportTransform.slice() as typeof canvas.viewportTransform;
			vpt[5] = insets().top - top * vpt[0];
			canvas.setViewportTransform(vpt);
			clampViewport();
			scheduleVisible();
		};

		const outline = (
			slot: Slot,
			b: Box,
			style: {
				fill: string;
				stroke: string;
				strokeWidth: number;
				strokeDashArray?: number[];
			},
		) =>
			new Rect({
				left: slot.x + b.x,
				top: slot.y + b.y,
				originX: 'left',
				originY: 'top',
				width: b.width,
				height: b.height,
				...style,
				strokeUniform: true,
				selectable: false,
				evented: false,
			});

		const dropTile = (slot: Slot) => {
			slot.job?.cancel();
			slot.job = null;
			if (slot.tile) canvas.remove(slot.tile.img);
			slot.tile = null;
		};

		const setTile = (slot: Slot, tile: Tile) => {
			if (slot.tile) canvas.remove(slot.tile.img);
			slot.tile = tile;
			const at = canvas.getObjects().indexOf(slot.bg);
			canvas.insertAt(at + 1, tile.img);
			canvas.requestRenderAll();
		};

		const updateVisible = () => {
			visibleRaf = 0;
			const doc = store.getSnapshot();
			if (!doc || order.length === 0) return;
			const { top, bottom } = visibleRange();
			const margin = (bottom - top) * KEEP_MARGIN;
			let best = -1;
			let bestOverlap = 0;
			order.forEach((id, index) => {
				const slot = slotOf(id)!;
				const near =
					slot.y + slot.height > top - margin &&
					slot.y < bottom + margin;
				const overlap =
					Math.min(slot.y + slot.height, bottom) -
					Math.max(slot.y, top);
				if (overlap > bestOverlap) {
					bestOverlap = overlap;
					best = index;
				}
				if (!near && (slot.tile || slot.job))
					dropTile(slot);
			});
			scheduleTiles();
			if (programmatic) {
				programmatic = false;
				return;
			}
			if (best !== -1 && best !== derivedIndex) {
				derivedIndex = best;
				setPageIndex(best);
			}
		};

		let tileTimer = 0;
		const scheduleTiles = () => {
			if (tileTimer) clearTimeout(tileTimer);
			tileTimer = window.setTimeout(
				renderTiles,
				TILE_DEBOUNCE,
			);
		};

		const renderTiles = () => {
			tileTimer = 0;
			const doc = store.getSnapshot();
			if (!doc || order.length === 0 || hostFrame.get())
				return;
			const vpt = canvas.viewportTransform;
			const z = vpt[0];
			const k = bucket(z * (window.devicePixelRatio || 1));
			const viewW = canvas.getWidth() / z;
			const viewH = canvas.getHeight() / z;
			const left = -vpt[4] / z - viewW * TILE_MARGIN;
			const top = -vpt[5] / z - viewH * TILE_MARGIN;
			const right = left + viewW * (1 + 2 * TILE_MARGIN);
			const bottom = top + viewH * (1 + 2 * TILE_MARGIN);
			order.forEach((id, index) => {
				const slot = slotOf(id)!;
				const page = doc.pages[index]!;
				const x1 = Math.max(slot.x, left);
				const y1 = Math.max(slot.y, top);
				const x2 = Math.min(slot.x + slot.width, right);
				const y2 = Math.min(
					slot.y + slot.height,
					bottom,
				);
				if (x2 <= x1 || y2 <= y1) return;
				const needed: PageCrop = {
					x: Math.floor(x1 - slot.x),
					y: Math.floor(y1 - slot.y),
					width: Math.ceil(x2 - x1) + 1,
					height: Math.ceil(y2 - y1) + 1,
				};
				if (
					slot.tile &&
					!slot.tile.stale &&
					slot.tile.k === k &&
					contains(slot.tile.rect, needed)
				)
					return;
				slot.job?.cancel();
				const job = renderTile(page, needed, k);
				slot.job = job;
				const key = slot.key;
				void job.promise.then(
					(raster) => {
						const current = slotOf(id);
						if (
							!current ||
							current.key !== key ||
							current.job !== job
						)
							return;
						current.job = null;
						setTile(current, {
							k,
							rect: needed,
							img: new FabricImage(
								raster,
								{
									left:
										current.x +
										needed.x,
									top:
										current.y +
										needed.y,
									originX: 'left',
									originY: 'top',
									scaleX:
										1 /
										k,
									scaleY:
										1 /
										k,
									selectable: false,
									evented: false,
									hoverCursor:
										'default',
								},
							),
						});
					},
					() => {
						// cancelled or failed render keeps the old tile
					},
				);
			});
			refreshProxies();
		};

		const scheduleVisible = () => {
			if (visibleRaf) return;
			visibleRaf = requestAnimationFrame(updateVisible);
		};

		const size = () => {
			canvas.setDimensions({
				width: wrap.clientWidth,
				height: wrap.clientHeight,
			});
			if (fitPending && order.length) {
				fitPage(getPageIndex());
				fitPending = false;
			} else clampViewport();
			scheduleVisible();
		};
		const ro = new ResizeObserver(size);
		ro.observe(wrap);
		const onInset = () => {
			if (
				order.length &&
				Math.abs(canvas.getZoom() - fitted) < 1e-6
			)
				fitPage(getPageIndex());
			else clampViewport();
			scheduleVisible();
			canvas.requestRenderAll();
		};
		area?.addEventListener('err-inset', onInset);
		size();

		const hatchTile = document.createElement('canvas');
		hatchTile.width = hatchTile.height = 8;
		const hg = hatchTile.getContext('2d')!;
		hg.strokeStyle = STAMP_RED;
		hg.beginPath();
		for (const d of [-8, 0, 8]) {
			hg.moveTo(d, 8);
			hg.lineTo(d + 8, 0);
		}
		hg.stroke();
		const hatch = new Pattern({ source: hatchTile });

		const build = (
			o: PageObject,
			slot: Slot,
		): FabricObject | null => {
			const base = centreProps(o, slot);
			switch (o.kind) {
				case 'redact': {
					const r = new Rect({
						...base,
						width: o.w,
						height: o.h,
						fill: hatch,
						stroke: STAMP_RED,
						strokeWidth: 1,
						strokeUniform: true,
					});
					r.setControlVisible('mtr', false);
					return r;
				}
				case 'text':
					return new IText(o.text, {
						...base,
						fontFamily: FONT,
						fontSize: o.fontSize,
						fontWeight: o.bold
							? 'bold'
							: 'normal',
						fill: o.colour,
					});
				case 'ink':
					return new Path(o.d, {
						...base,
						stroke: o.colour,
						strokeWidth: o.strokeWidth,
						strokeLineCap: 'round',
						strokeLineJoin: 'round',
						fill: '',
					});
				case 'shape':
					if (o.shape === 'ellipse')
						return new Ellipse({
							...base,
							rx: o.w / 2,
							ry: o.h / 2,
							fill: '',
							stroke: o.colour,
							strokeWidth:
								o.strokeWidth,
						});
					if (o.shape === 'line')
						return new Line(
							[0, 0, o.w, 0],
							{
								...base,
								stroke: o.colour,
								strokeWidth:
									o.strokeWidth,
								strokeLineCap:
									'round',
								padding: 6,
							},
						);
					if (o.shape === 'highlight')
						return new Rect({
							...base,
							width: o.w,
							height: o.h,
							fill: o.colour,
							opacity: 0.4,
							globalCompositeOperation:
								'multiply',
						});
					return new Rect({
						...base,
						width: o.w,
						height: o.h,
						fill: '',
						stroke: o.colour,
						strokeWidth: o.strokeWidth,
					});
				case 'comment':
					return new Path(NOTE_PATH, {
						...base,
						fill: '#ffd100',
						stroke: '#1a1a1a',
						strokeWidth: 1,
						strokeLineJoin: 'round',
						hasControls: false,
					});
				case 'image': {
					const img = images.get(o.dataUrl);
					if (!img || img === 'loading') {
						if (!img) {
							images.set(
								o.dataUrl,
								'loading',
							);
							void fabricUtil
								.loadImage(
									o.dataUrl,
								)
								.then(
									(
										loaded,
									) => {
										images.set(
											o.dataUrl,
											loaded,
										);
										sync();
									},
								);
						}
						return null;
					}
					return new FabricImage(img, {
						...base,
						scaleX:
							(o.w /
								img.naturalWidth) *
							o.scaleX,
						scaleY:
							(o.h /
								img.naturalHeight) *
							o.scaleY,
					});
				}
				case 'field':
					return fieldVisual(o, base);
			}
		};

		const apply = (f: FabricObject, o: PageObject, slot: Slot) => {
			const base = centreProps(o, slot);
			if (o.kind === 'image' && f instanceof FabricImage) {
				f.set({
					...base,
					scaleX: (o.w / f.width) * o.scaleX,
					scaleY: (o.h / f.height) * o.scaleY,
				});
			} else if (o.kind === 'text') {
				f.set({
					...base,
					text: o.text,
					fontSize: o.fontSize,
					fontWeight: o.bold ? 'bold' : 'normal',
					fill: o.colour,
				});
			} else if (o.kind === 'ink') {
				f.set({
					...base,
					stroke: o.colour,
					strokeWidth: o.strokeWidth,
				});
			} else if (o.kind !== 'shape') {
				f.set(base);
			} else if (o.shape === 'highlight') {
				f.set({
					...base,
					width: o.w,
					height: o.h,
					fill: o.colour,
				});
			} else if (o.shape === 'ellipse') {
				f.set({
					...base,
					rx: o.w / 2,
					ry: o.h / 2,
					stroke: o.colour,
					strokeWidth: o.strokeWidth,
				});
			} else {
				f.set({
					...base,
					width: o.w,
					height: o.h,
					stroke: o.colour,
					strokeWidth: o.strokeWidth,
				});
			}
			f.setCoords();
		};

		const layout = (doc: ErrataDoc) => {
			sceneWidth = Math.max(
				1,
				...doc.pages.map((p) => pageSize(p).width),
			);
			let y = 0;
			const seen = new Set<string>();
			const host = hostFrame.get();
			const rects =
				host
					?.pages()
					.map((el) =>
						el.getBoundingClientRect(),
					) ?? [];
			const first = rects[0];
			const z = first
				? first.width / pageSize(doc.pages[0]!).width
				: 1;
			order = doc.pages.map((page, i) => {
				const { width, height } = pageSize(page);
				const key = pageKey(page);
				let x = (sceneWidth - width) / 2;
				const rect = rects[i];
				if (first && rect) {
					x = (rect.left - first.left) / z;
					y = (rect.top - first.top) / z;
				}
				let slot = slots.get(page.id);
				if (slot && slot.key !== key) {
					if (
						slot.width === width &&
						slot.height === height
					) {
						slot.key = key;
						if (slot.tile)
							slot.tile.stale = true;
					} else {
						dropTile(slot);
						canvas.remove(slot.bg);
						slots.delete(page.id);
						slot = undefined;
					}
				}
				if (!slot) {
					const bg = placeholder(
						{ x, y, width, height },
						host ? 'transparent' : '#fff',
					);
					canvas.add(bg);
					slot = {
						id: page.id,
						key,
						x,
						y,
						width,
						height,
						bg,
						tile: null,
						job: null,
					};
					slots.set(page.id, slot);
				} else if (slot.x !== x || slot.y !== y) {
					slot.x = x;
					slot.y = y;
					slot.bg.set({ left: x, top: y });
					slot.bg.setCoords();
					if (slot.tile) {
						slot.tile.img.set({
							left:
								x +
								slot.tile.rect
									.x,
							top:
								y +
								slot.tile.rect
									.y,
						});
						slot.tile.img.setCoords();
					}
				}
				seen.add(page.id);
				y += height + GAP;
				return page.id;
			});
			for (const [id, slot] of slots) {
				if (seen.has(id)) continue;
				dropTile(slot);
				canvas.remove(slot.bg);
				slots.delete(id);
			}
			sceneHeight = Math.max(1, y - GAP);
		};

		const sync = () => {
			const doc = store.getSnapshot();
			if (!doc) {
				for (const slot of slots.values())
					dropTile(slot);
				canvas.clear();
				tracked.clear();
				slots.clear();
				order = [];
				derivedIndex = -1;
				fitPending = true;
				return;
			}
			const firstLoad = order.length === 0;
			layout(doc);

			const seen = new Set<string>();
			for (const page of doc.pages) {
				const slot = slotOf(page.id)!;
				for (const o of page.objects) {
					seen.add(o.id);
					const t = tracked.get(o.id);
					if (
						t &&
						t.doc === o &&
						t.pageId === page.id
					) {
						const base = centreProps(
							o,
							slot,
						);
						if (
							t.fabric.left !==
								base.left ||
							t.fabric.top !==
								base.top
						) {
							t.fabric.set({
								left: base.left,
								top: base.top,
							});
							t.fabric.setCoords();
						}
						continue;
					}
					if (t && !needsRebuild(t.doc, o)) {
						apply(t.fabric, o, slot);
						t.doc = o;
						t.pageId = page.id;
						dimOutside(t.fabric);
						continue;
					}
					const wasActive =
						!!t &&
						canvas.getActiveObject() ===
							t.fabric;
					if (t) {
						canvas.remove(t.fabric);
						tracked.delete(o.id);
					}
					const f = build(o, slot);
					if (!f) continue;
					attach(f);
					canvas.add(f);
					tracked.set(o.id, {
						fabric: f,
						doc: o,
						pageId: page.id,
					});
					if (wasActive)
						canvas.setActiveObject(f);
					dimOutside(f);
					if (pendingSelect === o.id) {
						pendingSelect = null;
						canvas.setActiveObject(f);
					}
				}
			}
			for (const [id, t] of tracked) {
				if (seen.has(id)) continue;
				canvas.remove(t.fabric);
				tracked.delete(id);
			}
			let index = 0;
			for (const id of order) {
				const slot = slotOf(id)!;
				canvas.moveObjectTo(slot.bg, index++);
				if (slot.tile)
					canvas.moveObjectTo(
						slot.tile.img,
						index++,
					);
			}
			for (const page of doc.pages)
				for (const o of page.objects) {
					const t = tracked.get(o.id);
					if (t)
						canvas.moveObjectTo(
							t.fabric,
							index++,
						);
				}

			if (fitPending || firstLoad) {
				derivedIndex = getPageIndex();
				fitPage(derivedIndex);
				fitPending = false;
			} else clampViewport();
			applyTool();
			programmatic = true;
			scheduleVisible();
			canvas.requestRenderAll();
		};

		const idOf = (f: FabricObject): string | null => {
			for (const [id, t] of tracked)
				if (t.fabric === f) return id;
			return null;
		};

		const OUTSIDE_OPACITY = 0.4;
		const overhanging = new Set<FabricObject>();
		const placed = (f: FabricObject) => {
			const id = idOf(f);
			const t = id ? tracked.get(id) : null;
			const slot = t && slotOf(t.pageId);
			return t && slot
				? { slot, opacity: opacityOf(t.doc) }
				: null;
		};
		const dimOutside = (f: FabricObject) => {
			const p = placed(f);
			if (!p) return;
			const { slot } = p;
			const b = f.getBoundingRect();
			const outside =
				b.left < slot.x - 0.5 ||
				b.top < slot.y - 0.5 ||
				b.left + b.width > slot.x + slot.width + 0.5 ||
				b.top + b.height > slot.y + slot.height + 0.5;
			if (outside) overhanging.add(f);
			else overhanging.delete(f);
			const opacity = outside ? 0 : p.opacity;
			if (f.opacity !== opacity) f.set({ opacity });
		};
		const dimActive = () => {
			for (const f of canvas.getActiveObjects())
				dimOutside(f);
		};
		canvas.on('object:moving', dimActive);
		canvas.on('object:scaling', dimActive);
		canvas.on('object:rotating', dimActive);
		canvas.on('after:render', () => {
			if (overhanging.size === 0) return;
			const ctx = canvas.getContext();
			const vpt = canvas.viewportTransform;
			for (const f of overhanging) {
				const p = placed(f);
				if (!p || !canvas.contains(f)) {
					overhanging.delete(f);
					continue;
				}
				const { slot, opacity } = p;
				for (const [alpha, evenodd] of [
					[1, false],
					[OUTSIDE_OPACITY, true],
				] as const) {
					ctx.save();
					ctx.transform(...vpt);
					ctx.beginPath();
					if (evenodd)
						ctx.rect(-1e6, -1e6, 2e6, 2e6);
					ctx.rect(
						slot.x,
						slot.y,
						slot.width,
						slot.height,
					);
					ctx.clip(
						evenodd ? 'evenodd' : 'nonzero',
					);
					f.opacity = alpha * opacity;
					f.render(ctx);
					f.opacity = 0;
					ctx.restore();
				}
			}
		});

		const attach = (f: FabricObject) => {
			if (f instanceof IText) {
				f.on('editing:exited', () => {
					const id = idOf(f);
					const t = id ? tracked.get(id) : null;
					if (!id || !t) return;
					if (f.text.trim() === '') {
						removeObjects(t.pageId, [id]);
						return;
					}
					patchObjects(
						t.pageId,
						new Map([
							[
								id,
								{
									text: f.text,
									w: f.width,
									h: f.height,
								},
							],
						]),
					);
				});
			}
		};

		const onSelection = () => {
			selection.set(
				canvas.getActiveObjects().flatMap((f) => {
					const id = idOf(f);
					return id ? [id] : [];
				}),
			);
			showHud(activeProxy());
		};
		canvas.on('selection:created', onSelection);
		canvas.on('selection:updated', onSelection);
		canvas.on('selection:cleared', onSelection);
		let clearedAt = 0;
		canvas.on('selection:cleared', () => {
			clearedAt = performance.now();
		});

		canvas.on('object:modified', (e) => {
			if (e.target && e.target === cropRect) {
				bakeCropRect();
				return;
			}
			const targets =
				e.target && e.target.type === 'activeselection'
					? (
							e.target as unknown as {
								getObjects(): FabricObject[];
							}
						).getObjects()
					: e.target
						? [e.target]
						: [];
			if (commitProxyEdits(targets, moveEdits)) return;
			const byPage = new Map<
				string,
				Map<string, Partial<PageObject>>
			>();
			let rebuilds = false;
			for (const f of targets) {
				const id = idOf(f);
				const t = id ? tracked.get(id) : null;
				const slot = t ? slotOf(t.pageId) : null;
				if (!id || !t || !slot) continue;
				const d = fabricUtil.qrDecompose(
					f.calcTransformMatrix(),
				);
				const patch: Partial<PageObject> = {
					cx: d.translateX - slot.x,
					cy: d.translateY - slot.y,
					angle: d.angle,
					scaleX: d.scaleX,
					scaleY: d.scaleY,
				};
				if (t.doc.kind === 'image') {
					patch.scaleX =
						(d.scaleX * f.width) / t.doc.w;
					patch.scaleY =
						(d.scaleY * f.height) / t.doc.h;
				}
				if (
					t.doc.kind === 'field' &&
					Math.abs(d.scaleX - 1) +
						Math.abs(d.scaleY - 1) >
						1e-6
				) {
					rebuilds = true;
					Object.assign(patch, {
						w: t.doc.w * d.scaleX,
						h: t.doc.h * d.scaleY,
						scaleX: 1,
						scaleY: 1,
					});
				}
				let patches = byPage.get(t.pageId);
				if (!patches) {
					patches = new Map();
					byPage.set(t.pageId, patches);
				}
				patches.set(id, patch);
			}
			const commit = () => {
				for (const [pageId, patches] of byPage)
					patchObjects(pageId, patches);
			};
			if (rebuilds) queueMicrotask(commit);
			else commit();
		});

		canvas.on('path:created', ({ path }) => {
			canvas.remove(path);
			if (!(path instanceof Path)) return;
			const centre = path.getCenterPoint();
			const slot = pageAt(centre);
			if (!slot) return;
			const settings = toolSettings.get();
			const ink: InkObject = {
				id: newId(),
				kind: 'ink',
				cx: centre.x - slot.x,
				cy: centre.y - slot.y,
				w: path.width,
				h: path.height,
				scaleX: 1,
				scaleY: 1,
				angle: 0,
				d: localPathD(path),
				colour: settings.colour,
				strokeWidth: settings.strokeWidth,
			};
			addObject(slot.id, ink);
		});

		let drag: { start: Point; slot: Slot } | null = null;
		let ghost: FabricObject | null = null;

		const dragRect = (
			slot: Slot,
			a: Point,
			b: Point,
		): PageCrop => ({
			x: Math.min(a.x, b.x) - slot.x,
			y: Math.min(a.y, b.y) - slot.y,
			width: Math.abs(b.x - a.x),
			height: Math.abs(b.y - a.y),
		});

		const shapeObject = (
			slot: Slot,
			a: Point,
			b: Point,
		): ShapeObject => {
			const s = toolSettings.get();
			const shape: ShapeKind =
				activeTool.get() === 'highlight'
					? 'highlight'
					: s.shape;
			const dx = b.x - a.x;
			const dy = b.y - a.y;
			return {
				...boxAt(dragRect(slot, a, b)),
				...(shape === 'line'
					? {
							w: Math.hypot(dx, dy),
							h: 0,
							angle:
								(Math.atan2(
									dy,
									dx,
								) *
									180) /
								Math.PI,
						}
					: {}),
				kind: 'shape',
				shape,
				colour:
					shape === 'highlight'
						? s.highlightColour
						: s.colour,
				strokeWidth: s.strokeWidth,
			};
		};

		const clampRect = (slot: Slot, r: PageCrop): PageCrop => {
			const x = Math.max(0, Math.min(r.x, slot.width));
			const y = Math.max(0, Math.min(r.y, slot.height));
			return {
				x,
				y,
				width: Math.min(r.x + r.width, slot.width) - x,
				height:
					Math.min(r.y + r.height, slot.height) -
					y,
			};
		};

		let cropRect: Rect | null = null;
		let cropShown: CropDraft | null = null;
		const showCropDraft = () => {
			const draft =
				activeTool.get() === 'crop'
					? cropDraft.get()
					: null;
			if (draft === cropShown) return;
			cropShown = draft;
			const slot = draft ? slotOf(draft.pageId) : null;
			if (!draft || !slot) {
				if (cropRect) canvas.remove(cropRect);
				cropRect = null;
				return;
			}
			if (!cropRect) {
				cropRect = new Rect({
					originX: 'left',
					originY: 'top',
					fill: 'rgba(0,0,0,0.04)',
					stroke: '#000',
					strokeWidth: 1,
					strokeUniform: true,
					strokeDashArray: [4, 4],
					lockRotation: true,
					hoverCursor: 'move',
				});
				cropRect.setControlsVisibility({ mtr: false });
				canvas.add(cropRect);
			}
			cropRect.set({
				left: slot.x + draft.rect.x,
				top: slot.y + draft.rect.y,
				width: draft.rect.width,
				height: draft.rect.height,
				scaleX: 1,
				scaleY: 1,
			});
			cropRect.setCoords();
			canvas.setActiveObject(cropRect);
		};
		const bakeCropRect = () => {
			const draft = cropDraft.get();
			const slot = draft ? slotOf(draft.pageId) : null;
			if (!cropRect || !draft || !slot) return;
			const rect = clampRect(slot, {
				x: cropRect.left - slot.x,
				y: cropRect.top - slot.y,
				width: cropRect.width * cropRect.scaleX,
				height: cropRect.height * cropRect.scaleY,
			});
			cropDraft.set({ pageId: draft.pageId, rect });
		};

		const DASHED = {
			fill: 'rgba(0,0,0,0.04)',
			stroke: '#000',
			strokeWidth: 1,
			strokeDashArray: [4, 4],
		};

		const markLine = async (slot: Slot, p: Point) => {
			const page = store
				.getSnapshot()
				?.pages.find((pg) => pg.id === slot.id);
			const view = page ? await pageContent(page) : null;
			if (!view) return;
			const x = p.x - slot.x;
			const y = p.y - slot.y;
			const b = view.lines
				.filter((l) => l.text.trim())
				.map((l) => view.toDisplayed(l.bbox))
				.find(
					(r) =>
						x >= r.x &&
						x <= r.x + r.width &&
						y >= r.y &&
						y <= r.y + r.height,
				);
			if (b)
				addObject(
					slot.id,
					redactObject({
						x: b.x - 1,
						y: b.y - 1,
						width: b.width + 2,
						height: b.height + 2,
					}),
				);
		};

		let notePress: { id: string; at: Point } | null = null;
		const noteId = (f: FabricObject | undefined) => {
			const t = f ? tracked.get(idOf(f) ?? '') : undefined;
			return t?.doc.kind === 'comment' ? t.doc.id : null;
		};

		canvas.on('mouse:down', (opt: TPointerEventInfo) => {
			const tool = activeTool.get();
			if (order.length === 0) return;
			const pressed = noteId(opt.target);
			notePress = pressed
				? {
						id: pressed,
						at: canvas.getViewportPoint(
							opt.e,
						),
					}
				: null;
			if (tool === 'content') {
				const t = opt.target;
				const now = performance.now();
				if (
					t &&
					proxyInfo.get(t)?.line &&
					lastPress.target === t &&
					now - lastPress.at < 400
				)
					pendingEdit = t;
				lastPress = { target: t ?? null, at: now };
				return;
			}
			if (tool === 'comment' && !opt.target) {
				const p = canvas.getScenePoint(opt.e);
				const slot = pageAt(p);
				if (!slot) return;
				const note = newComment(
					p.x - slot.x,
					p.y - slot.y,
					commentAuthor(),
				);
				addObject(slot.id, note);
				const f = tracked.get(note.id)?.fabric;
				if (f) canvas.setActiveObject(f);
				openNote.set(note.id);
				return;
			}
			if (tool === 'text') {
				if (opt.target instanceof IText) return;
				const p = canvas.getScenePoint(opt.e);
				const slot = pageAt(p);
				if (!slot) return;
				const s = toolSettings.get();
				const text = textObject(
					'',
					s.fontSize,
					s.colour,
					p.x - slot.x,
					p.y - slot.y,
					{ w: 0, h: 0 },
				);
				addObject(slot.id, text);
				const f = tracked.get(text.id)?.fabric;
				if (f instanceof IText) {
					canvas.setActiveObject(f);
					f.enterEditing();
				}
				return;
			}
			if (
				tool === 'shape' ||
				tool === 'highlight' ||
				(tool === 'crop' && opt.target !== cropRect) ||
				((tool === 'field' || tool === 'redact') &&
					!opt.target)
			) {
				const start = canvas.getScenePoint(opt.e);
				const slot = pageAt(start);
				if (slot) drag = { start, slot };
			}
		});

		canvas.on('mouse:move', (opt: TPointerEventInfo) => {
			if (!drag) return;
			const { start, slot } = drag;
			const p = canvas.getScenePoint(opt.e);
			const tool = activeTool.get();
			if (ghost) canvas.remove(ghost);
			ghost =
				tool === 'crop' || tool === 'field'
					? outline(
							slot,
							dragRect(
								slot,
								start,
								p,
							),
							DASHED,
						)
					: build(
							tool === 'redact'
								? redactObject(
										dragRect(
											slot,
											start,
											p,
										),
									)
								: shapeObject(
										slot,
										start,
										p,
									),
							slot,
						);
			if (ghost) {
				ghost.selectable = false;
				ghost.evented = false;
				canvas.add(ghost);
			}
			canvas.requestRenderAll();
		});

		canvas.on('mouse:up', (opt: TPointerEventInfo) => {
			if (
				notePress &&
				notePress.at.distanceFrom(
					canvas.getViewportPoint(opt.e),
				) < 4
			)
				openNote.set(notePress.id);
			notePress = null;
			if (pendingEdit) {
				const t = pendingEdit;
				pendingEdit = null;
				setTimeout(() => void startTextEdit(t), 0);
				return;
			}
			if (!drag) return;
			const { start, slot } = drag;
			drag = null;
			if (ghost) canvas.remove(ghost);
			ghost = null;
			const p = canvas.getScenePoint(opt.e);
			const rect = dragRect(slot, start, p);
			const tool = activeTool.get();
			const doc = store.getSnapshot();
			let added: PageObject | null = null;
			if (tool === 'redact') {
				if (rect.width < 2 || rect.height < 2)
					void markLine(slot, p);
				else added = redactObject(rect);
			} else if (tool === 'crop') {
				const page = doc?.pages.find(
					(pg) => pg.id === slot.id,
				);
				const clamped = clampRect(slot, rect);
				if (page && cropFromDisplayed(page, clamped))
					cropDraft.set({
						pageId: slot.id,
						rect: clamped,
					});
				else if (cropRect)
					canvas.setActiveObject(cropRect);
			} else if (tool === 'field') {
				added =
					doc &&
					newField(
						fieldDraft.get(),
						rect,
						takenNames(doc),
					);
			} else {
				const o = shapeObject(slot, start, p);
				if (o.w >= 2 || o.h >= 2) added = o;
			}
			if (added) addObject(slot.id, added);
			const f =
				tool === 'field' &&
				added &&
				tracked.get(added.id)?.fabric;
			if (f) canvas.setActiveObject(f);
			canvas.requestRenderAll();
		});

		interface ProxyInfo {
			pageId: string;
			ranges: { stream: string; from: number; to: number }[];
			left: number;
			top: number;
			view: PageContentView;
			kind: 'Text' | 'Image' | 'Path' | 'Form';
			detail: string;
			width: number;
			height: number;
			line?: TextLine;
		}
		const proxyInfo = new WeakMap<FabricObject, ProxyInfo>();
		const KIND_LABEL = {
			image: 'Image',
			path: 'Path',
			form: 'Form',
		} as const;
		const fontLabel = (run: TextRun) =>
			`${run.font.baseFont.replace(/^[A-Z]{6}\+/, '') || run.font.subtype} ${fmtPt(run.fontSize)}`;
		let reselect: {
			pageId: string;
			left: number;
			top: number;
		} | null = null;
		const proxies = new Map<
			string,
			{ key: string; rects: FabricObject[] }
		>();
		const ACCENT = '#1f6feb';

		const dropProxies = (pageId: string) => {
			const p = proxies.get(pageId);
			if (!p) return;
			for (const r of p.rects) canvas.remove(r);
			proxies.delete(pageId);
		};

		const proxyRect = (
			slot: Slot,
			view: PageContentView,
			pageId: string,
			box: {
				x: number;
				y: number;
				width: number;
				height: number;
			},
			ranges: ProxyInfo['ranges'],
			kind: ProxyInfo['kind'],
			detail = '',
			line?: TextLine,
		): FabricObject => {
			const r = new Rect({
				left: slot.x + box.x,
				top: slot.y + box.y,
				originX: 'left',
				originY: 'top',
				width: Math.max(box.width, 1),
				height: Math.max(box.height, 1),
				fill: 'rgba(0,0,0,0)',
				stroke: undefined,
				strokeWidth: 1,
				strokeUniform: true,
				hasControls: false,
				lockRotation: true,
				lockScalingX: true,
				lockScalingY: true,
				borderColor: ACCENT,
				padding: 1,
				hoverCursor: 'move',
			});
			proxyInfo.set(r, {
				pageId,
				ranges,
				left: r.left,
				top: r.top,
				view,
				kind,
				detail,
				width: box.width,
				height: box.height,
				line,
			});
			return r;
		};

		const refreshProxies = () => {
			const doc = store.getSnapshot();
			if (activeTool.get() !== 'content' || !doc) {
				for (const id of [...proxies.keys()])
					dropProxies(id);
				return;
			}
			const { top, bottom } = visibleRange();
			const margin = (bottom - top) * KEEP_MARGIN;
			const wanted = new Set<string>();
			doc.pages.forEach((page) => {
				const slot = slotOf(page.id);
				if (!slot || page.sourceIndex === null) return;
				const near =
					slot.y + slot.height > top - margin &&
					slot.y < bottom + margin;
				if (!near) return;
				wanted.add(page.id);
				const key = `${slot.key}:${slot.x}:${slot.y}`;
				const old = proxies.get(page.id);
				if (old?.key === key) return;
				proxies.set(page.id, {
					key,
					rects: old?.rects ?? [],
				});
				void pageContent(page).then((view) => {
					const current = proxies.get(page.id);
					if (
						!view ||
						!current ||
						current.key !== key ||
						activeTool.get() !== 'content'
					)
						return;
					const rects: FabricObject[] = [];
					for (const line of view.lines) {
						if (!line.text.trim()) continue;
						rects.push(
							proxyRect(
								slot,
								view,
								page.id,
								view.toDisplayed(
									line.bbox,
								),
								line.runs.map(
									(
										r,
									) => ({
										stream: r.stream,
										from: r.from,
										to: r.to,
									}),
								),
								'Text',
								fontLabel(
									line
										.runs[0]!,
								),
								line,
							),
						);
					}
					for (const it of view.content.items) {
						if (it.kind === 'text')
							continue;
						const b = view.toDisplayed(
							it.bbox,
						);
						if (b.width < 1 && b.height < 1)
							continue;
						rects.push(
							proxyRect(
								slot,
								view,
								page.id,
								b,
								[
									{
										stream: it.stream,
										from: it.from,
										to: it.to,
									},
								],
								KIND_LABEL[
									it.kind
								],
							),
						);
					}
					for (const r of current.rects)
						canvas.remove(r);
					for (const r of rects) canvas.add(r);
					current.rects = rects;
					if (reselect?.pageId === page.id) {
						const { left, top } = reselect;
						reselect = null;
						const again = rects
							.map((r) => ({
								r,
								d:
									Math.abs(
										r.left -
											left,
									) +
									Math.abs(
										r.top -
											top,
									),
							}))
							.filter((c) => c.d < 12)
							.sort(
								(a, b) =>
									a.d -
									b.d,
							)[0]?.r;
						if (again)
							canvas.setActiveObject(
								again,
							);
					}
					canvas.requestRenderAll();
				});
			});
			for (const id of [...proxies.keys()])
				if (!wanted.has(id)) dropProxies(id);
		};

		const hud = wrap.querySelector<HTMLElement>('.err-hud')!;
		let hudTarget: FabricObject | null = null;
		const placeHud = () => {
			const t = hudTarget;
			if (!t || !canvas.contains(t)) {
				hud.hidden = true;
				return;
			}
			const vpt = canvas.viewportTransform;
			const toCanvas = (p: Point) =>
				fabricUtil.transformPoint(p, vpt);
			const b = bounds(t.getCoords().map(toCanvas));
			const below = b.y < 36;
			hud.style.left = `${Math.max(0, b.x)}px`;
			hud.style.top = `${below ? b.y + b.height + 6 : b.y}px`;
			hud.classList.toggle('is-below', below);
			hud.hidden = false;
		};
		const chip = (text: string, cls = 'err-hud-kind') => {
			const el = document.createElement('span');
			el.className = cls;
			el.textContent = text;
			return el;
		};
		const showHud = (t: FabricObject | null) => {
			hudTarget = t;
			const info = t ? proxyInfo.get(t) : null;
			if (!info) {
				hud.classList.remove('is-warn');
				const n = canvas.getActiveObjects().length;
				if (t && n > 1) {
					hud.replaceChildren(
						chip(`${n} objects`),
					);
					placeHud();
				} else hud.hidden = true;
				return;
			}
			const substituted =
				info.line?.runs[0]?.fontRes === SUBSTITUTE_RES;
			hud.classList.toggle('is-warn', substituted);
			hud.replaceChildren(
				chip(
					info.detail
						? `${info.kind} · ${info.detail}`
						: info.kind,
				),
				chip(
					`${fmtPt(info.width)} × ${fmtPt(info.height)} pt`,
					'err-hud-dims',
				),
				...(substituted
					? [chip('Font unavailable')]
					: []),
			);
			placeHud();
		};
		const activeProxy = () => {
			const a = canvas.getActiveObject();
			return a &&
				(proxyInfo.has(a) ||
					a.type === 'activeselection')
				? a
				: null;
		};

		canvas.on('mouse:over', (e) => {
			const t = e.target;
			if (t && proxyInfo.has(t)) {
				t.set({ stroke: ACCENT });
				if (!activeProxy()) showHud(t);
				canvas.requestRenderAll();
			}
		});
		canvas.on('mouse:out', (e) => {
			const t = e.target;
			if (t && proxyInfo.has(t)) {
				t.set({ stroke: undefined });
				showHud(activeProxy());
				canvas.requestRenderAll();
			}
		});
		canvas.on('after:render', placeHud);

		const orderEdits = (edits: ContentEdit[]) =>
			edits
				.slice()
				.sort(
					(a, b) =>
						a.stream.localeCompare(
							b.stream,
						) || b.from - a.from,
				);

		const commitProxyEdits = (
			targets: FabricObject[],
			make: (
				info: ProxyInfo,
				f: FabricObject,
			) => ContentEdit[],
		): boolean => {
			const byPage = new Map<string, ContentEdit[]>();
			for (const f of targets) {
				const info = proxyInfo.get(f);
				if (!info) continue;
				byPage.set(info.pageId, [
					...(byPage.get(info.pageId) ?? []),
					...make(info, f),
				]);
			}
			if (byPage.size === 0) return false;
			queueMicrotask(() => {
				canvas.discardActiveObject();
				for (const [pageId, edits] of byPage)
					addContentEdits(
						pageId,
						orderEdits(edits),
					);
			});
			return true;
		};

		const moveEdits = (
			info: ProxyInfo,
			f: FabricObject,
		): ContentEdit[] => {
			const d = fabricUtil.qrDecompose(
				f.calcTransformMatrix(),
			);
			reselect = {
				pageId: info.pageId,
				left: d.translateX - f.width / 2,
				top: d.translateY - f.height / 2,
			};
			const dx = d.translateX - (info.left + f.width / 2);
			const dy = d.translateY - (info.top + f.height / 2);
			if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05)
				return [];
			const u = info.view.toUserDelta(dx, dy);
			return info.ranges.map((r) => ({
				kind: 'move',
				...r,
				dx: u.dx,
				dy: u.dy,
			}));
		};

		const deleteEdits = (info: ProxyInfo): ContentEdit[] =>
			info.ranges.map((r) => ({ kind: 'delete', ...r }));

		interface Editing {
			proxy: FabricObject;
			itext: IText;
			info: ProxyInfo;
			line: TextLine;
			face: PageFontFace | null;
			onKey: (e: KeyboardEvent) => void;
			cancelled: boolean;
			done: boolean;
		}
		let editing: Editing | null = null;
		let pendingEdit: FabricObject | null = null;
		let lastPress: { target: FabricObject | null; at: number } = {
			target: null,
			at: 0,
		};
		const BASELINE = 0.879;

		const codesOf = (run: TextRun) => run.glyphs.map((g) => g.code);
		const unicodeOf = (run: TextRun, codes: number[]) =>
			run.font
				.decode(
					Uint8Array.from(
						run.font.codeBytes === 2
							? codes.flatMap((c) => [
									c >> 8,
									c & 255,
								])
							: codes,
					),
				)
				.map((g) => g.text)
				.join('');
		const showCodes = (
			face: PageFontFace | null,
			run: TextRun,
			codes: number[],
		) =>
			face
				? face.display(codes)
				: codes
						.map(
							(c) =>
								run.glyphs.find(
									(g) =>
										g.code ===
										c,
								)?.text ??
								String.fromCharCode(
									c,
								),
						)
						.join('');

		const startTextEdit = async (proxy: FabricObject) => {
			const info = proxyInfo.get(proxy);
			const doc = store.getSnapshot();
			const page = doc?.pages.find(
				(p) => p.id === info?.pageId,
			);
			const slot = info ? slotOf(info.pageId) : null;
			if (
				!info?.line ||
				!page ||
				page.sourceIndex === null ||
				!slot
			)
				return;
			if (editing) finishTextEdit(true);
			const line = info.line;
			const run0 = line.runs[0]!;
			const face = await pageFontFace(
				page.sourceIndex,
				run0.font.baseFont,
			).catch(() => null);
			if (
				activeTool.get() !== 'content' ||
				!canvas.contains(proxy)
			)
				return;
			const text = line.runs
				.map(
					(r, i) =>
						(line.gaps[i] ? ' ' : '') +
						showCodes(face, r, codesOf(r)),
				)
				.join('');
			const o = info.view.toDisplayedPoint(
				run0.trm[4],
				run0.trm[5],
			);
			const ahead = applyMatrix(run0.trm, 1, 0);
			const d = info.view.toDisplayedPoint(ahead.x, ahead.y);
			const angle = Math.atan2(d.y - o.y, d.x - o.x);
			const rise = BASELINE * run0.fontSize;
			const fill = run0.fill
				? `rgb(${run0.fill.map((c) => Math.round(c * 255)).join(' ')})`
				: '#000';
			const itext = new IText(text, {
				left: slot.x + o.x + rise * Math.sin(angle),
				top: slot.y + o.y - rise * Math.cos(angle),
				originX: 'left',
				originY: 'top',
				angle: (angle * 180) / Math.PI,
				fontFamily: face?.family ?? FONT,
				fontSize: run0.fontSize,
				fill,
				backgroundColor: '#fff',
				hasControls: false,
				lockMovementX: true,
				lockMovementY: true,
				editingBorderColor: ACCENT,
				cursorColor: ACCENT,
			});
			const onKey = (e: KeyboardEvent) => {
				if (e.key === 'Enter' && !e.shiftKey) {
					e.preventDefault();
					e.stopPropagation();
					if (editing && !refuse(editing))
						itext.exitEditing();
				} else if (e.key === 'Escape') {
					if (editing) editing.cancelled = true;
				}
			};
			editing = {
				proxy,
				itext,
				info,
				line,
				face,
				onKey,
				cancelled: false,
				done: false,
			};
			proxy.visible = false;
			canvas.add(itext);
			canvas.setActiveObject(itext);
			itext.enterEditing();
			itext.selectAll();
			itext.hiddenTextarea?.addEventListener(
				'keydown',
				onKey,
				true,
			);
			itext.on('changed', () => {
				if (editing?.itext === itext) refuse(editing);
			});
			itext.on('editing:exited', () => {
				if (editing?.itext === itext)
					finishTextEdit(editing.cancelled);
			});
			hud.hidden = true;
			canvas.requestRenderAll();
		};

		const encodeEdit = (
			e: Editing,
			text: string,
		): {
			codes: number[];
			bad: string[];
			fallback: number[] | null;
		} => {
			const run0 = e.line.runs[0]!;
			const byGlyph = new Map<string, number>();
			const byGlyphText = new Map<string, string>();
			for (const r of e.line.runs)
				for (const g of r.glyphs) {
					const shown = showCodes(e.face, r, [
						g.code,
					]);
					byGlyph.set(shown, g.code);
					byGlyphText.set(shown, g.text);
				}
			const codes: number[] = [];
			const bad: string[] = [];
			let fallback: number[] | null = [];
			for (const ch of text.replace(/\r?\n/g, '')) {
				const known = byGlyph.get(ch);
				if (known !== undefined) {
					codes.push(known);
				} else {
					const code = run0.font.encode(ch);
					if (code === null) bad.push(ch);
					else {
						codes.push(code);
						byGlyph.set(ch, code);
					}
				}
				const w = winAnsiCode(
					byGlyphText.get(ch) ?? ch,
				);
				if (w === null) fallback = null;
				else fallback?.push(w);
			}
			return { codes, bad, fallback };
		};

		const refuse = (e: Editing): boolean => {
			const { bad, fallback } = encodeEdit(e, e.itext.text);
			if (!bad.length) {
				warnHud(e.itext, null);
				return false;
			}
			warnHud(
				e.itext,
				fallback
					? 'Font unavailable'
					: `✗ ${[...new Set(bad)].join('')}`,
			);
			return fallback === null;
		};
		const warnHud = (t: FabricObject, text: string | null) => {
			hud.classList.toggle('is-warn', text !== null);
			if (text === null) {
				hud.hidden = true;
				return;
			}
			hud.replaceChildren(chip(text));
			hudTarget = t;
			placeHud();
		};

		const finishTextEdit = (cancel: boolean) => {
			const e = editing;
			if (!e || e.done) return;
			const text = e.itext.text.replace(/\r?\n/g, '');
			const { codes, bad, fallback } = encodeEdit(e, text);
			const substitute = bad.length > 0 && fallback !== null;
			if (!cancel && (bad.length === 0 || substitute)) {
				const runs = e.line.runs;
				const edits: ContentEdit[] = runs
					.slice(1)
					.map((r) => ({
						kind: 'delete',
						stream: r.stream,
						from: r.from,
						to: r.to,
					}));
				const first = runs[0]!;
				edits.push(
					codes.length
						? {
								kind: 'text',
								stream: first.stream,
								from: first.from,
								to: first.to,
								text: substitute
									? text
									: unicodeOf(
											first,
											codes,
										),
								codes: substitute
									? fallback
									: codes,
								...(substitute
									? {
											font: 'Helvetica' as const,
										}
									: {}),
							}
						: {
								kind: 'delete',
								stream: first.stream,
								from: first.from,
								to: first.to,
							},
				);
				reselect = codes.length
					? {
							pageId: e.info.pageId,
							left: e.info.left,
							top: e.info.top,
						}
					: null;
				queueMicrotask(() =>
					addContentEdits(
						e.info.pageId,
						orderEdits(edits),
					),
				);
			}
			e.done = true;
			editing = null;
			hudTarget = null;
			hud.classList.remove('is-warn');
			e.itext.hiddenTextarea?.removeEventListener(
				'keydown',
				e.onKey,
				true,
			);
			if (e.itext.isEditing) e.itext.exitEditing();
			canvas.remove(e.itext);
			e.proxy.visible = true;
			hud.hidden = true;
			canvas.requestRenderAll();
		};

		const applyTool = () => {
			const tool = activeTool.get();
			const s = toolSettings.get();
			canvas.isDrawingMode = tool === 'ink';
			brush.color = s.colour;
			brush.width = s.strokeWidth;
			const interactive =
				tool === 'select' || tool === 'comment';
			const content = tool === 'content';
			const redacting = tool === 'redact';
			if (!content && editing) finishTextEdit(true);
			canvas.selection = interactive || content;
			canvas.skipTargetFind =
				tool === 'shape' || tool === 'highlight';
			for (const { fabric, doc } of tracked.values()) {
				fabric.selectable = redacting
					? doc.kind === 'redact'
					: interactive ||
						(tool === 'text' &&
							fabric instanceof
								IText) ||
						(tool === 'field' &&
							doc.kind === 'field');
				fabric.evented = fabric.selectable;
			}
			const keep =
				tool === 'text' ||
				(tool === 'crop' &&
					canvas.getActiveObject() ===
						cropRect) ||
				((tool === 'field' || redacting) &&
					canvas
						.getActiveObjects()
						.every((f) => f.selectable));
			if (!interactive && !keep) canvas.discardActiveObject();
			canvas.defaultCursor =
				interactive || content
					? 'default'
					: 'crosshair';
			refreshProxies();
			showCropDraft();
			canvas.requestRenderAll();
		};

		let debugRects: FabricObject[] = [];
		let highlights: FabricObject[] = [];
		let previews: FabricObject[] = [];
		registerCanvasActions({
			preview: (items) => {
				for (const f of previews) canvas.remove(f);
				previews = items.flatMap(
					({ index, object }) => {
						const slot = slotAt(index);
						const f = slot
							? build(object, slot)
							: null;
						if (!f) return [];
						f.set({
							selectable: false,
							evented: false,
							opacity: opacityOf(
								object,
							),
						});
						return [f];
					},
				);
				for (const f of previews) canvas.add(f);
				canvas.requestRenderAll();
			},
			selectObject: (id) => {
				const t = tracked.get(id);
				if (!t) {
					pendingSelect = id;
					return;
				}
				canvas.setActiveObject(t.fabric);
				canvas.requestRenderAll();
			},
			debugBoxes: (index, boxes) => {
				for (const r of debugRects) canvas.remove(r);
				const slot = slotAt(index);
				debugRects = slot
					? boxes.map((b) =>
							outline(slot, b, {
								fill: 'transparent',
								stroke: b.colour,
								strokeWidth: 0.5,
							}),
						)
					: [];
				for (const r of debugRects) canvas.add(r);
				canvas.requestRenderAll();
			},
			highlight: (index, boxes) => {
				for (const r of highlights) canvas.remove(r);
				const slot = slotAt(index);
				highlights = slot
					? boxes.map((b) =>
							outline(slot, b, {
								fill: 'rgba(230,0,126,0.15)',
								stroke: HIGHLIGHT,
								strokeWidth: 2,
							}),
						)
					: [];
				for (const r of highlights) canvas.add(r);
				const top = Math.min(...boxes.map((b) => b.y));
				const bottom = Math.max(
					...boxes.map((b) => b.y + b.height),
				);
				if (slot && boxes.length)
					reveal(slot.y + top, slot.y + bottom);
				canvas.requestRenderAll();
			},
			objectRect: (id) => {
				const f = tracked.get(id)?.fabric;
				if (!f) return null;
				const vpt = canvas.viewportTransform;
				const r = wrap.getBoundingClientRect();
				f.setCoords();
				const b = f.getBoundingRect();
				return {
					x: r.left + b.left * vpt[0] + vpt[4],
					y: r.top + b.top * vpt[3] + vpt[5],
					w: b.width * vpt[0],
					h: b.height * vpt[3],
				};
			},
			deleteSelection: () => {
				const editing = canvas
					.getActiveObjects()
					.some(
						(f) =>
							f instanceof IText &&
							f.isEditing,
					);
				if (editing) return;
				if (
					commitProxyEdits(
						canvas.getActiveObjects(),
						deleteEdits,
					)
				)
					return;
				const byPage = new Map<string, string[]>();
				for (const f of canvas.getActiveObjects()) {
					const id = idOf(f);
					const t = id ? tracked.get(id) : null;
					if (!id || !t) continue;
					byPage.set(t.pageId, [
						...(byPage.get(t.pageId) ?? []),
						id,
					]);
				}
				canvas.discardActiveObject();
				for (const [pageId, ids] of byPage)
					removeObjects(pageId, ids);
			},
			pageRect: (index) => {
				const slot = slotAt(index);
				if (!slot) return null;
				const vpt = canvas.viewportTransform;
				const r = wrap.getBoundingClientRect();
				return {
					x: r.left + slot.x * vpt[0] + vpt[4],
					y: r.top + slot.y * vpt[3] + vpt[5],
					w: slot.width * vpt[0],
					h: slot.height * vpt[3],
				};
			},
		});

		const clampZoom = (z: number) =>
			Math.max(ZMIN, Math.min(ZMAX, z));
		const centre = () =>
			new Point(
				canvas.getWidth() / 2,
				canvas.getHeight() / 2,
			);
		const zoomAt = (factor: number, at = centre()) => {
			const host = hostFrame.get();
			if (host) return host.zoom(factor);
			canvas.zoomToPoint(
				at,
				clampZoom(canvas.getZoom() * factor),
			);
			clampViewport();
			reportZoom(canvas.getZoom());
			scheduleVisible();
		};
		const fit = () => {
			const host = hostFrame.get();
			if (host) host.fit();
			else fitPage(getPageIndex());
		};
		registerViewportController({
			zoomIn: () => zoomAt(1.2),
			zoomOut: () => zoomAt(1 / 1.2),
			fit,
			setZoom: (z) => zoomAt(clampZoom(z) / canvas.getZoom()),
			reset: () => zoomAt(1 / canvas.getZoom()),
			cycle: fit,
		});

		const panBy = (dx: number, dy: number) => {
			const host = hostFrame.get();
			if (host) return host.scroller.scrollBy(-dx, -dy);
			canvas.relativePan(new Point(dx, dy));
			clampViewport();
			canvas.requestRenderAll();
			scheduleVisible();
		};

		// ponytail: a finger pans only from empty space with the select tool; other tools draw, so they have no pan or pinch
		let nav: { x: number; y: number; d: number } | null = null;
		const fingers = (t: TouchList) => {
			const a = t[0]!;
			const b = t[1] ?? a;
			return {
				x: (a.clientX + b.clientX) / 2,
				y: (a.clientY + b.clientY) / 2,
				d: Math.hypot(
					a.clientX - b.clientX,
					a.clientY - b.clientY,
				),
			};
		};
		const onTouchStart = (e: TouchEvent) => {
			if (e.touches.length === 1) {
				if (
					activeTool.get() !== 'select' ||
					canvas.findTarget(e).target
				)
					return;
				canvas.selection = false;
			} else if (!nav) return;
			nav = fingers(e.touches);
		};
		const onTouchMove = (e: TouchEvent) => {
			if (!nav) return;
			const now = fingers(e.touches);
			panBy(now.x - nav.x, now.y - nav.y);
			if (nav.d && now.d) {
				const r = wrap.getBoundingClientRect();
				zoomAt(
					now.d / nav.d,
					new Point(
						now.x - r.left,
						now.y - r.top,
					),
				);
			}
			nav = now;
		};
		const onTouchEnd = (e: TouchEvent) => {
			if (!nav) return;
			nav = e.touches.length ? fingers(e.touches) : null;
			if (!nav) applyTool();
		};
		const touch = { capture: true, passive: true };
		wrap.addEventListener('touchstart', onTouchStart, touch);
		wrap.addEventListener('touchmove', onTouchMove, touch);
		wrap.addEventListener('touchend', onTouchEnd, touch);
		wrap.addEventListener('touchcancel', onTouchEnd, touch);

		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			const host = hostFrame.get();
			if (host) {
				if (e.ctrlKey || e.metaKey)
					host.scroller.dispatchEvent(
						new WheelEvent('wheel', e),
					);
				else panBy(-e.deltaX, -e.deltaY);
				return;
			}
			if (e.ctrlKey || e.metaKey) {
				const r = wrap.getBoundingClientRect();
				zoomAt(
					Math.pow(0.999, e.deltaY),
					new Point(
						e.clientX - r.left,
						e.clientY - r.top,
					),
				);
			} else panBy(-e.deltaX, -e.deltaY);
		};
		wrap.addEventListener('wheel', onWheel, { passive: false });

		const onDouble = (e: MouseEvent) => {
			if (
				activeTool.get() !== 'select' ||
				boxMode.get() !== null ||
				canvas.getActiveObject() ||
				performance.now() - clearedAt < 500
			)
				return;
			hostFrame.get()?.edit(e.clientX, e.clientY);
		};
		wrap.addEventListener('dblclick', onDouble);

		const onPageIndex = () => {
			const index = getPageIndex();
			if (index === derivedIndex) return;
			derivedIndex = index;
			programmatic = true;
			scrollToPage(index);
			scheduleVisible();
		};

		if (import.meta.env.DEV) {
			const w = window as unknown as Record<string, unknown>;
			w.__errataCanvas = canvas;
			w.__errataSlots = () =>
				[...slots.values()].map((sl) => ({
					key: sl.key.slice(0, 40),
					tile: !!sl.tile,
					stale: sl.tile?.stale ?? null,
					job: !!sl.job,
				}));
		}

		let hostRaf = 0;
		let hostAt = '';
		const hostTick = () => {
			hostRaf = requestAnimationFrame(hostTick);
			if (order.length === 0) return;
			const r = hostFrame
				.get()
				?.content.querySelector('.err-write-page')
				?.getBoundingClientRect();
			const now = r ? `${r.left},${r.top},${r.width}` : '';
			if (now === hostAt) return;
			hostAt = now;
			follow();
			scheduleVisible();
			canvas.requestRenderAll();
		};
		const hostRo = new ResizeObserver(() => {
			if (order.length) sync();
		});
		const onHost = () => {
			cancelAnimationFrame(hostRaf);
			hostRo.disconnect();
			const host = hostFrame.get();
			if (host) {
				hostRo.observe(host.content);
				hostTick();
			}
			if (order.length === 0) return;
			for (const slot of slots.values()) {
				dropTile(slot);
				canvas.remove(slot.bg);
			}
			slots.clear();
			order = [];
			fitPending = true;
			sync();
		};
		onHost();

		const offs = [
			hostFrame.subscribe(onHost),
			store.subscribe(sync),
			subscribePage(onPageIndex),
			activeTool.subscribe(applyTool),
			toolSettings.subscribe(applyTool),
			cropDraft.subscribe(applyTool),
		];
		sync();

		return () => {
			for (const off of offs) off();
			if (visibleRaf) cancelAnimationFrame(visibleRaf);
			if (tileTimer) clearTimeout(tileTimer);
			for (const slot of slots.values()) slot.job?.cancel();
			ro.disconnect();
			cancelAnimationFrame(hostRaf);
			hostRo.disconnect();
			area?.removeEventListener('err-inset', onInset);
			wrap.removeEventListener('wheel', onWheel);
			wrap.removeEventListener(
				'touchstart',
				onTouchStart,
				touch,
			);
			wrap.removeEventListener(
				'touchmove',
				onTouchMove,
				touch,
			);
			wrap.removeEventListener('touchend', onTouchEnd, touch);
			wrap.removeEventListener(
				'touchcancel',
				onTouchEnd,
				touch,
			);
			wrap.removeEventListener('dblclick', onDouble);
			registerCanvasActions(null);
			registerViewportController(null);
			selection.set([]);
			void canvas.dispose();
		};
	});

	<template>
		<div class="sub-canvas-wrap" {{this.mount}}>
			<Backdrop @name="Errata" @kind="DOCUMENT EDITOR" />
			<canvas></canvas>
			<div class="err-hud" hidden></div>
		</div>
	</template>
}
