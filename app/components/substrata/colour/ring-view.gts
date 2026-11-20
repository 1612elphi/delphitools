import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import { eq } from 'ember-truth-helpers';
import { fromHsb } from 'delphicanon/lib/colour';
import HexKeypad from 'delphitools-v2/components/substrata/colour/hex-keypad';
import HueWheel, {
	WHEEL_SIDE,
} from 'delphitools-v2/components/substrata/colour/hue-wheel';
import { caption } from 'delphitools-v2/components/substrata/colour/caption';
import {
	FONT,
	RingPaint,
	readTheme,
} from 'delphitools-v2/components/substrata/colour/ring-paint';
import {
	RING,
	RingGeometry,
	SwatchRows,
	type Cell,
	type Point,
	type Range,
	type Swatch,
	type SwatchColumn,
	type SwatchSet,
} from 'delphitools-v2/lib/substrata/colour-ring/geometry';
import {
	ColourLibrary,
	paint,
	swatchFor,
} from 'delphitools-v2/lib/substrata/colour-ring/library';
import {
	CHANNEL_NAMES,
	HexDigits,
	RING_TYPES,
	SLIDER_MODES,
	SLIDER_TITLES,
	channels,
	figures,
	fromChannels,
	hexOf,
	sameColour,
	shelf,
	usedColours,
	type RingColour,
	type RingType,
	type SliderMode,
} from 'delphitools-v2/lib/substrata/colour-ring/model';
import {
	ARRIVAL,
	ARRIVAL_TOTAL,
	DEPARTURE_TOTAL,
	DRAWN,
	SWIVEL,
	arrival,
	coast,
	departure,
	departureFade,
	ease,
	flingSpeed,
	type TrailPoint,
} from 'delphitools-v2/lib/substrata/colour-ring/motion';
import { ColourWriter } from 'delphitools-v2/lib/substrata/colour-ring/writer';
import {
	getColour,
	subscribeColour,
} from 'delphitools-v2/lib/substrata/colour-store';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';
import { getSnapshot } from 'delphitools-v2/lib/substrata/doc-store';
import { editorUi } from 'delphitools-v2/lib/substrata/editor-ui';
import {
	loadLayout,
	saveLayout,
} from 'delphitools-v2/lib/substrata/layout-storage';
import {
	pixelAt,
	takeStill,
	type Still,
} from 'delphitools-v2/components/substrata/colour/still';
import './colour.css';

const SETS: Partial<Record<RingType, SwatchSet>> = {
	markers: ColourLibrary.markers,
	freetone: ColourLibrary.freetone,
	palettes: ColourLibrary.palettes,
};

const QUARTER = RING.quarter;
const TYPE_SPAN = (QUARTER[1] - QUARTER[0]) / RING_TYPES.length;
const typeStart = (index: number) => QUARTER[0] + index * TYPE_SPAN;
const SLIDER_ARC = RING.sliderArc;
const LANES = {
	mode: [RING.swatchesInner + 4, RING.swatchesInner + 44] as Range,
	inner: RING.swatchesInner + 64,
	step: 64,
	depth: 52,
};
const BOX = 48;
const GAP = 8;
const POSITION_KEY = 'ringPosition';
const CREDIT =
	'With thanks to Stuart Semple for providing the FREETONE library';

type Drag =
	| { kind: 'turn'; start: number; from: number }
	| { kind: 'types'; grab: number }
	| { kind: 'slider'; track: number; values: number[] }
	| { kind: 'sample' };

interface Hover {
	swatch: Swatch;
	cell: Cell;
	point: Point;
}

interface Cursor {
	column: number;
	row: number;
}

const HUE_ICON = Array.from({ length: 36 }, (_, i) => {
	const [r, g, b] = fromHsb((i / 36) * 360, 0.85, 0.95);
	return hexOf({ r, g, b, alpha: 1 });
});

const now = () => performance.now() / 1000;
const reducedMotion = () =>
	window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v: number, lo: number, hi: number) =>
	Math.min(hi, Math.max(lo, v));
const degrees = (points: number, radius: number) =>
	((points / Math.max(1, radius)) * 180) / Math.PI;

export default class RingView extends Component {
	@tracked shown = false;
	@tracked leaving = false;
	@tracked typeIndex = 0;
	@tracked sliderMode: SliderMode = 'lab';
	@tracked keypadOpen = false;
	@tracked wheelOpen = false;
	@tracked sampling = false;
	@tracked layout = 0;
	@tracked announce = '';
	@tracked focusKey: string | null = null;

	writer = new ColourWriter();
	digits = new HexDigits();
	store = new TrackedExternal(subscribeColour, getColour);
	geometry = new RingGeometry({ x: 0, y: 0 }, false);
	size = { width: 0, height: 0 };

	#paint: RingPaint | null = null;
	#canvas: HTMLCanvasElement | null = null;
	#root: HTMLElement | null = null;
	#editor: HTMLElement | null = null;
	#dpr = 1;
	#offsets: Partial<Record<RingType, number>> = {};
	#picked: string | null = null;
	#hover: Hover | null = null;
	#samplePoint: Point | null = null;
	#snapshot: Still | null = null;
	#drag: Drag | null = null;
	#spin = 0;
	#arrivalStart: number | null = null;
	#departureStart: number | null = null;
	#swivel: { from: number; start: number } | null = null;
	#heldArc: number | null = null;
	#trail: TrailPoint[] = [];
	#departingPick: Swatch | null = null;
	#documentColours: string[] = [];
	#beforeTyping: RingColour | null = null;
	#beforeWheel: RingColour | null = null;
	#cursor: Cursor | null = null;
	#raf = 0;
	#lastTick: number | null = null;
	#drawQueued = 0;
	#leaveTimer: ReturnType<typeof setTimeout> | undefined;
	#wasOpen = false;
	#returnFocus: HTMLElement | null = null;

	types = RING_TYPES;
	modes = SLIDER_MODES;

	get type(): RingType {
		return RING_TYPES[this.typeIndex]!.id;
	}

	get typeTitle() {
		return RING_TYPES[this.typeIndex]!.title;
	}

	get isSliders() {
		return this.type === 'sliders';
	}

	get activeSet(): SwatchSet | null {
		return SETS[this.type] ?? null;
	}

	get current(): RingColour {
		return this.writer.current;
	}

	get starred() {
		return shelf.isStarred(hexOf(this.current));
	}

	get offset() {
		return this.#offsets[this.type] ?? 0;
	}

	get rows(): string[][] {
		const per = SwatchRows.perRow;
		if (this.type === 'recent')
			return [
				shelf.recent,
				this.#documentColours.slice(0, per),
			];
		if (this.type === 'starred') {
			const out: string[][] = [];
			for (let i = 0; i < shelf.stars.length; i += per)
				out.push(shelf.stars.slice(i, i + per));
			return out;
		}
		return [];
	}

	get outerRadius(): number {
		if (this.isSliders) return LANES.inner + 3 * LANES.step;
		if (this.type === 'starred' || this.type === 'recent')
			return (
				RING.swatchesInner +
				SwatchRows.firstRow +
				Math.max(3, this.rows.length) * SwatchRows.step
			);
		const set = this.activeSet;
		return RING.swatchesInner + (set ? set.deepest * set.depth : 0);
	}

	watch = modifier((_el: HTMLElement, [open]: [boolean]) => {
		if (open === this.#wasOpen) return;
		this.#wasOpen = open;
		queueMicrotask(() => (open ? this.open() : this.close()));
	});

	setup = modifier((root: HTMLElement) => {
		this.#root = root;
		this.#editor = root.closest<HTMLElement>('.sub-ed');
		const canvas = root.querySelector('canvas')!;
		this.#canvas = canvas;
		const ctx = canvas.getContext('2d')!;
		this.#paint = new RingPaint(
			ctx,
			this.geometry,
			readTheme(root),
			() => this.draw(),
		);
		const ro = new ResizeObserver(() => this.measure());
		if (this.#editor) ro.observe(this.#editor);
		const themes = new MutationObserver(() => {
			this.#paint?.setTheme(readTheme(root));
			this.draw();
		});
		themes.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['class'],
		});
		const unsubscribe = subscribeColour(() => {
			if (this.shown) this.draw();
		});
		void document.fonts?.ready.then(() => {
			this.#paint?.forgetWidths();
			this.draw();
		});
		const escape = (e: KeyboardEvent) => {
			if (
				e.key === 'Escape' &&
				this.shown &&
				!this.leaving &&
				!root.contains(e.target as Node)
			)
				this.rootKey(e);
		};
		window.addEventListener('keydown', escape);
		root.addEventListener('keydown', this.rootKey);
		return () => {
			this.store.unsubscribe();
			window.removeEventListener('keydown', escape);
			root.removeEventListener('keydown', this.rootKey);
			ro.disconnect();
			themes.disconnect();
			unsubscribe();
			cancelAnimationFrame(this.#raf);
			cancelAnimationFrame(this.#drawQueued);
			clearTimeout(this.#leaveTimer);
			if (this.#wasOpen) this.writer.end();
		};
	});

	measure = () => {
		const editor = this.#editor;
		const canvas = this.#canvas;
		if (!editor || !canvas) return;
		const box = editor.getBoundingClientRect();
		const key = editor
			.querySelector('.sub-ed-colour-key .sub-cell')
			?.getBoundingClientRect();
		const hub = key
			? {
					x: key.left + key.width / 2 - box.left,
					y: key.top + key.height / 2 - box.top,
				}
			: { x: box.width - 40, y: box.height - 40 };
		this.size = { width: box.width, height: box.height };
		this.#dpr = window.devicePixelRatio || 1;
		canvas.width = Math.round(box.width * this.#dpr);
		canvas.height = Math.round(box.height * this.#dpr);
		this.geometry = new RingGeometry(hub, hub.x < box.width / 2);
		if (this.#paint) this.#paint.geometry = this.geometry;
		this.layout++;
		this.draw();
	};

	open() {
		editorUi.bloomOpen = false;
		this.writer.begin(editorUi.ringTarget);
		const doc = getSnapshot();
		this.#documentColours = doc ? usedColours(doc) : [];
		this.restorePosition();
		clearTimeout(this.#leaveTimer);
		this.leaving = false;
		this.#departureStart = null;
		this.#swivel = null;
		this.sampling = false;
		this.#snapshot = null;
		this.#hover = null;
		this.#cursor = null;
		this.#picked = hexOf(this.current, false);
		this.#spin = 0;
		const active = document.activeElement;
		this.#returnFocus =
			active instanceof HTMLElement ? active : null;
		this.shown = true;
		this.measure();
		this.flyIn();
		requestAnimationFrame(() =>
			this.#root
				?.querySelector<HTMLElement>('.sub-ring-band')
				?.focus({ preventScroll: true }),
		);
	}

	close() {
		this.finish();
		this.rememberPosition();
		this.writer.end();
		this.sampling = false;
		this.#snapshot = null;
		this.#hover = null;
		this.#drag = null;
		this.#spin = 0;
		this.leaving = true;
		const inside = this.#root?.contains(document.activeElement);
		if (inside) {
			const key = this.#editor?.querySelector<HTMLElement>(
				'.sub-ed-colour-key .sub-cell',
			);
			(key ?? this.#returnFocus)?.focus({
				preventScroll: true,
			});
		}
		this.#leaveTimer = setTimeout(
			() => {
				this.shown = false;
				this.leaving = false;
				this.#departureStart = null;
				cancelAnimationFrame(this.#raf);
				this.#raf = 0;
			},
			reducedMotion() ? 0 : 250,
		);
	}

	closeRing = () => editorUi.closeRing();

	rememberPosition() {
		saveLayout(POSITION_KEY, {
			type: this.typeIndex,
			turns: this.#offsets,
			sliders: this.sliderMode,
		});
	}

	restorePosition() {
		const saved = loadLayout<{
			type?: unknown;
			turns?: unknown;
			sliders?: unknown;
		} | null>(POSITION_KEY, null);
		if (!saved || typeof saved !== 'object') return;
		if (saved.turns && typeof saved.turns === 'object')
			for (const [key, turn] of Object.entries(saved.turns)) {
				if (key in SETS && typeof turn === 'number')
					this.#offsets[key as RingType] = turn;
			}
		if (SLIDER_MODES.includes(saved.sliders as SliderMode))
			this.sliderMode = saved.sliders as SliderMode;
		if (
			typeof saved.type === 'number' &&
			RING_TYPES[saved.type] !== undefined
		)
			this.typeIndex = saved.type;
	}

	write(colour: RingColour, final: boolean) {
		this.writer.set(colour, final);
		this.draw();
	}

	pick(hex: string) {
		const colour = this.writer.atCurrentOpacity(hex);
		if (!colour) return;
		this.#picked = hex;
		this.write(colour, true);
	}

	setType(index: number) {
		if (index === this.typeIndex) return;
		const from = this.selectionAngle(this.typeIndex);
		this.#hover = null;
		this.#cursor = null;
		this.#spin = 0;
		this.typeIndex = index;
		this.#swivel = reducedMotion() ? null : { from, start: now() };
		this.flyIn();
		if (this.#swivel) this.runClock();
	}

	pickType = (index: number) => this.setType(index);

	pickMode = (mode: SliderMode) => {
		this.sliderMode = mode;
		this.draw();
	};

	toggleStar = () => {
		shelf.toggleStar(hexOf(this.current));
		this.draw();
	};

	cellOf(
		set: SwatchSet,
		column: SwatchColumn,
		row: number,
		turn = 0,
	): Cell {
		const start =
			QUARTER[0] +
			column.start -
			this.offset +
			turn * set.total;
		const inner = RING.swatchesInner + row * set.depth;
		return {
			inner,
			outer: inner + set.depth,
			start,
			end: start + column.width,
		};
	}

	swatchAt(
		radius: number,
		angle: number,
	): { swatch: Swatch; cell: Cell } | null {
		const set = this.activeSet;
		if (set) {
			const along = angle - QUARTER[0] + this.offset;
			const index = set.index(
				along,
				radius - RING.swatchesInner,
			);
			if (!index) return null;
			const column = set.columns[index.column]!;
			const base = this.cellOf(set, column, index.row);
			const turn = Math.floor(
				(angle - base.start) / set.total,
			);
			return {
				swatch: set.at(index),
				cell: this.cellOf(set, column, index.row, turn),
			};
		}
		const at = SwatchRows.index(radius, angle);
		const hex = at && this.rows[at.row]?.[at.column];
		if (!at || !hex) return null;
		return {
			swatch: swatchFor(hex),
			cell: SwatchRows.cell(at.row, at.column),
		};
	}

	target(p: Point) {
		return this.geometry.target(
			p,
			RING_TYPES.length,
			this.outerRadius,
		);
	}

	trackAt(radius: number): number | null {
		const along = radius - LANES.inner;
		const lane = Math.floor(along / LANES.step);
		if (
			along < 0 ||
			lane >= 3 ||
			along - lane * LANES.step > LANES.depth
		)
			return null;
		return 2 - lane;
	}

	turnsOf(set: SwatchSet, column: SwatchColumn): number[] {
		if (set.total <= 0) return [];
		const base = this.cellOf(set, column, 0);
		const first = Math.ceil((DRAWN[0] - base.end) / set.total);
		const last = Math.floor((DRAWN[1] - base.start) / set.total);
		const out: number[] = [];
		for (let t = first; t <= last; t++) out.push(t);
		return out;
	}

	pointer = modifier((canvas: HTMLCanvasElement) => {
		let id: number | null = null;
		let down: Point | null = null;
		let panning = false;
		let held = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const local = (e: PointerEvent): Point => {
			const box = canvas.getBoundingClientRect();
			return {
				x: e.clientX - box.left,
				y: e.clientY - box.top,
			};
		};
		const start = (e: PointerEvent) => {
			if (this.#departureStart !== null || e.button !== 0)
				return;
			id = e.pointerId;
			down = local(e);
			panning = false;
			held = false;
			this.#spin = 0;
			canvas.setPointerCapture(id);
			const at = down;
			timer = setTimeout(() => {
				held = this.held(at);
			}, 450);
		};
		const move = (e: PointerEvent) => {
			const p = local(e);
			if (e.pointerId !== id || !down) {
				if (e.pointerType !== 'touch') this.hoverAt(p);
				return;
			}
			if (held) return;
			if (
				!panning &&
				Math.hypot(p.x - down.x, p.y - down.y) > 8
			) {
				clearTimeout(timer);
				panning = true;
				this.panBegan(down);
			}
			if (panning) this.moved(p, false);
		};
		const end = (e: PointerEvent) => {
			if (e.pointerId !== id) return;
			clearTimeout(timer);
			const p = local(e);
			id = null;
			down = null;
			if (held) return;
			if (e.type === 'pointercancel') {
				if (this.#drag?.kind === 'slider')
					this.write(this.current, true);
				this.settleArc();
				this.#drag = null;
				return;
			}
			if (panning) {
				this.moved(p, true);
				if (this.#drag?.kind === 'turn') this.fling();
				this.settleArc();
				this.#drag = null;
				this.draw();
				return;
			}
			this.tapped(p);
		};
		const leave = () => {
			if (id !== null || !this.#hover) return;
			this.#hover = null;
			this.draw();
		};
		canvas.addEventListener('pointerdown', start);
		canvas.addEventListener('pointermove', move);
		canvas.addEventListener('pointerup', end);
		canvas.addEventListener('pointercancel', end);
		canvas.addEventListener('pointerleave', leave);
		return () => {
			clearTimeout(timer);
			canvas.removeEventListener('pointerdown', start);
			canvas.removeEventListener('pointermove', move);
			canvas.removeEventListener('pointerup', end);
			canvas.removeEventListener('pointercancel', end);
			canvas.removeEventListener('pointerleave', leave);
		};
	});

	tapped(p: Point) {
		if (this.sampling) return this.finishSampling(p);
		if (this.keypadOpen || this.wheelOpen) return this.finish();
		const hit = this.target(p);
		switch (hit.kind) {
			case 'close':
				return this.closeRing();
			case 'eyedropper':
				return this.startSampling();
			case 'star':
				return this.toggleStar();
			case 'hex':
				return this.editHex();
			case 'hueWheel':
				return this.openWheel();
			case 'type':
				return this.setType(hit.index);
			case 'band':
				return this.tappedBand(hit.radius, hit.angle);
			default:
		}
	}

	tappedBand(radius: number, angle: number) {
		if (this.isSliders) {
			if (
				radius >= LANES.mode[0] &&
				radius <= LANES.mode[1]
			) {
				const width =
					(SLIDER_ARC[1] - SLIDER_ARC[0]) /
					SLIDER_MODES.length;
				const mode =
					SLIDER_MODES[
						Math.floor(
							(angle -
								SLIDER_ARC[0]) /
								width,
						)
					];
				if (mode) this.pickMode(mode);
			} else {
				const track = this.trackAt(radius);
				if (track !== null)
					this.slide(
						track,
						channels(
							this.sliderMode,
							this.current,
						),
						angle,
						true,
					);
			}
			return;
		}
		const found = this.swatchAt(radius, angle);
		if (!found) return;
		this.pickAndLeave(found.swatch);
	}

	pickAndLeave(swatch: Swatch) {
		this.pick(swatch.hex);
		this.#departingPick = swatch;
		this.leave();
	}

	held(p: Point): boolean {
		if (this.sampling) return false;
		const hit = this.target(p);
		if (hit.kind !== 'band' || this.isSliders) return false;
		const found = this.swatchAt(hit.radius, hit.angle);
		if (!found) return false;
		shelf.toggleStar(found.swatch.hex);
		this.draw();
		return true;
	}

	panBegan(start: Point) {
		if (this.sampling) {
			this.#drag = { kind: 'sample' };
			return;
		}
		const hit = this.target(start);
		if (hit.kind === 'eyedropper') {
			this.startSampling();
			if (this.sampling) this.#drag = { kind: 'sample' };
		} else if (hit.kind === 'type') {
			const arc = this.selectionAngle();
			this.#drag = {
				kind: 'types',
				grab: arc - this.geometry.polar(start).angle,
			};
			this.#swivel = null;
			this.#heldArc = arc;
		} else if (hit.kind === 'band') {
			const track = this.isSliders
				? this.trackAt(hit.radius)
				: null;
			if (track !== null)
				this.#drag = {
					kind: 'slider',
					track,
					values: channels(
						this.sliderMode,
						this.current,
					),
				};
			else if (this.activeSet)
				this.#drag = {
					kind: 'turn',
					start: this.offset,
					from: hit.angle,
				};
		}
	}

	moved(p: Point, final: boolean) {
		const angle = this.geometry.polar(p).angle;
		const drag = this.#drag;
		if (!drag) return;
		if (drag.kind === 'turn') {
			const set = this.activeSet;
			if (!set) return;
			const turned = drag.start + drag.from - angle;
			const t = now();
			this.#trail = [
				...this.#trail.filter(
					(q) => t - q.time <= 0.16,
				),
				{ time: t, offset: turned },
			];
			this.#offsets[this.type] = set.wrapped(turned);
			this.#hover = null;
			this.draw();
		} else if (drag.kind === 'slider') {
			this.slide(drag.track, drag.values, angle, final);
		} else if (drag.kind === 'sample') {
			if (final) this.finishSampling(p);
			else {
				this.#samplePoint = p;
				this.draw();
			}
		} else {
			const arc = clamp(
				angle + drag.grab,
				QUARTER[0],
				QUARTER[1] - TYPE_SPAN,
			);
			this.#heldArc = arc;
			const index = clamp(
				Math.floor(
					(arc + TYPE_SPAN / 2 - QUARTER[0]) /
						TYPE_SPAN,
				),
				0,
				RING_TYPES.length - 1,
			);
			if (index !== this.typeIndex) this.setType(index);
			this.draw();
		}
	}

	settleArc() {
		if (this.#drag?.kind !== 'types' || this.#heldArc === null)
			return;
		const arc = this.#heldArc;
		this.#heldArc = null;
		if (reducedMotion()) return this.draw();
		this.#swivel = { from: arc, start: now() };
		this.runClock();
	}

	slide(track: number, values: number[], angle: number, final: boolean) {
		const value = clamp(
			(angle - SLIDER_ARC[0]) /
				(SLIDER_ARC[1] - SLIDER_ARC[0]),
			0,
			1,
		);
		const next = [...values];
		next[track] = value;
		this.write(
			fromChannels(this.sliderMode, next, this.current.alpha),
			final,
		);
		if (
			this.#drag?.kind === 'slider' &&
			this.#drag.track === track &&
			!final
		)
			this.#drag = { ...this.#drag, values: next };
	}

	hoverAt(p: Point) {
		if (this.sampling) {
			this.#samplePoint = p;
			this.draw();
			return;
		}
		const hit = this.target(p);
		const found =
			hit.kind === 'band' && !this.isSliders
				? this.swatchAt(hit.radius, hit.angle)
				: null;
		if (!found && !this.#hover) return;
		this.#hover = found ? { ...found, point: p } : null;
		this.draw();
	}

	startSampling = () => {
		const editor = this.#editor;
		const still =
			editor &&
			takeStill(
				editor,
				this.#paint?.theme.muted ?? '#ffffff',
			);
		if (!still) return;
		this.#snapshot = still;
		this.sampling = true;
		this.#samplePoint = null;
		this.#hover = null;
		this.draw();
	};

	sample(p: Point): RingColour | null {
		return this.#snapshot
			? pixelAt(this.#snapshot, p.x, p.y)
			: null;
	}

	finishSampling(p: Point) {
		const found = this.sample(p);
		this.sampling = false;
		this.#snapshot = null;
		this.#samplePoint = null;
		if (found) {
			const hex = hexOf(found, false);
			this.pick(hex);
			caption.show(swatchFor(hex));
		}
		this.draw();
	}

	editHex = () => {
		if (this.keypadOpen) return this.finish();
		if (this.wheelOpen) this.finish();
		this.#beforeTyping = this.current;
		this.digits.show(this.current);
		this.keypadOpen = true;
	};

	typed = () => {
		const typed = this.digits.colour;
		if (!typed) return;
		const colour =
			this.digits.digits.length === 8
				? typed
				: { ...typed, alpha: this.current.alpha };
		this.write(colour, false);
	};

	openWheel = () => {
		if (this.wheelOpen) return this.finish();
		if (this.keypadOpen) this.finish();
		this.#beforeWheel = this.current;
		this.wheelOpen = true;
	};

	wheeled = (colour: RingColour, final: boolean) =>
		this.write(colour, final);

	finish = () => {
		if (this.wheelOpen) {
			this.wheelOpen = false;
			const before = this.#beforeWheel;
			this.#beforeWheel = null;
			if (before && !sameColour(before, this.current)) {
				this.#picked = hexOf(this.current, false);
				caption.show(
					swatchFor(hexOf(this.current, false)),
				);
			}
		}
		if (!this.keypadOpen) return;
		this.keypadOpen = false;
		const before = this.#beforeTyping;
		this.#beforeTyping = null;
		if (before && !sameColour(before, this.current)) {
			this.#picked = hexOf(this.current, false);
			this.write(this.current, true);
			caption.show(swatchFor(hexOf(this.current, false)));
		} else if (before) this.writer.revert(before);
		this.#root
			?.querySelector<HTMLElement>('.sub-ring-band')
			?.focus({ preventScroll: true });
		this.draw();
	};

	get keypadStyle() {
		void this.layout;
		const { hub, mirrored } = this.geometry;
		const width = 198;
		const height = 438;
		const x = mirrored ? hub.x - BOX / 2 : hub.x + BOX / 2 - width;
		const y = Math.max(
			GAP,
			hub.y -
				RING.buttonOrbit -
				RING.buttonRadius -
				GAP -
				height,
		);
		return htmlSafe(`left: ${x}px; top: ${y}px`);
	}

	get wheelStyle() {
		void this.layout;
		const { hub, mirrored } = this.geometry;
		const x = mirrored
			? hub.x - BOX / 2
			: hub.x + BOX / 2 - WHEEL_SIDE;
		const y = Math.max(
			GAP,
			hub.y -
				RING.buttonOrbit -
				RING.buttonRadius -
				GAP -
				WHEEL_SIDE,
		);
		return htmlSafe(`left: ${x}px; top: ${y}px`);
	}

	fling() {
		this.#spin = reducedMotion() ? 0 : flingSpeed(this.#trail);
		this.#trail = [];
		if (this.#spin) this.runClock();
	}

	leave() {
		if (reducedMotion()) return this.closeAfterPick();
		this.#hover = null;
		this.#spin = 0;
		this.#arrivalStart = null;
		this.#departureStart = now();
		this.runClock();
	}

	closeAfterPick() {
		this.closeRing();
		if (this.#departingPick) caption.show(this.#departingPick);
		this.#departingPick = null;
	}

	flyIn() {
		this.#arrivalStart = reducedMotion() ? null : now();
		this.draw();
		if (this.#arrivalStart !== null) this.runClock();
	}

	runClock() {
		if (this.#raf) return;
		this.#lastTick = null;
		this.#raf = requestAnimationFrame(this.tick);
	}

	tick = () => {
		this.#raf = 0;
		const t = now();
		const dt = this.#lastTick === null ? 0 : t - this.#lastTick;
		this.#lastTick = t;
		if (
			this.#arrivalStart !== null &&
			t - this.#arrivalStart > ARRIVAL_TOTAL
		)
			this.#arrivalStart = null;
		if (this.#swivel && t - this.#swivel.start > SWIVEL)
			this.#swivel = null;
		if (
			this.#departureStart !== null &&
			t - this.#departureStart > DEPARTURE_TOTAL
		) {
			this.#departureStart = null;
			this.closeAfterPick();
			return;
		}
		const set = this.activeSet;
		if (this.#spin !== 0 && set) {
			this.#offsets[this.type] = set.wrapped(
				this.offset + this.#spin * dt,
			);
			this.#spin = coast(this.#spin, dt);
			if (this.#hover) this.hoverAt(this.#hover.point);
		} else this.#spin = 0;
		this.render();
		if (
			this.#arrivalStart !== null ||
			this.#departureStart !== null ||
			this.#swivel ||
			this.#spin !== 0
		)
			this.#raf = requestAnimationFrame(this.tick);
		else this.#lastTick = null;
	};

	selectionAngle(previous?: number): number {
		if (this.#heldArc !== null) return this.#heldArc;
		const destination = typeStart(previous ?? this.typeIndex);
		if (!this.#swivel) return destination;
		const t = (now() - this.#swivel.start) / SWIVEL;
		return (
			this.#swivel.from +
			(destination - this.#swivel.from) * ease(t)
		);
	}

	#arrival(angle: number, row: number) {
		return this.#arrivalStart === null
			? 1
			: arrival(now() - this.#arrivalStart, angle, row);
	}

	#departure(angle: number, row: number, hex?: string) {
		return this.#departureStart === null
			? 1
			: departure(
					now() - this.#departureStart,
					angle,
					row,
					hex !== undefined &&
						hex === this.#picked,
				);
	}

	fade() {
		return this.#departureStart === null
			? 1
			: departureFade(now() - this.#departureStart);
	}

	draw() {
		if (this.#drawQueued || this.#raf) return;
		this.#drawQueued = requestAnimationFrame(() => {
			this.#drawQueued = 0;
			this.render();
		});
	}

	render() {
		const p = this.#paint;
		if (!p) return;
		const { ctx } = p;
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
		if (!this.shown) return;
		ctx.setTransform(this.#dpr, 0, 0, this.#dpr, 0, 0);
		if (this.sampling) {
			if (this.#samplePoint)
				this.drawLoupe(p, this.#samplePoint);
			return;
		}
		if (this.isSliders) this.drawSliders(p);
		else if (this.type === 'starred' || this.type === 'recent')
			this.drawRows(p);
		else if (this.activeSet) {
			this.drawSet(p, this.activeSet);
			if (this.type === 'freetone')
				this.drawCredit(p, this.activeSet);
		}
		ctx.save();
		ctx.globalAlpha = this.fade();
		this.drawTypes(p);
		ctx.restore();
		this.drawHub(p);
		if (this.#hover && !this.#drag) this.drawHover(p, this.#hover);
		this.drawFocus(p);
	}

	flying(
		p: RingPaint,
		cell: Cell,
		row: number,
		hex: string | undefined,
		body: (c: Cell) => void,
	) {
		const landed =
			this.#arrival(cell.start, row) *
			this.#departure(cell.start, row, hex);
		if (landed <= 0) return;
		const lift = (1 - landed) * ARRIVAL.lift;
		p.ctx.save();
		p.ctx.globalAlpha = landed;
		body({
			...cell,
			inner: cell.inner - lift,
			outer: cell.outer - lift,
		});
		p.ctx.restore();
	}

	drawSet(p: RingPaint, set: SwatchSet) {
		const { ctx, theme } = p;
		for (const column of set.columns) {
			for (const turn of this.turnsOf(set, column)) {
				if (column.label !== null) {
					const label =
						column.label.toUpperCase();
					this.flying(
						p,
						this.cellOf(
							set,
							column,
							0,
							turn,
						),
						0,
						undefined,
						(c) =>
							p.radialText(
								label,
								c.inner + 4,
								(c.start +
									c.end) /
									2,
								FONT.heading(
									theme,
								),
								theme.mutedForeground,
								'outward',
								true,
							),
					);
					continue;
				}
				column.swatches.forEach((swatch, row) => {
					const landed = this.cellOf(
						set,
						column,
						row,
						turn,
					);
					this.flying(
						p,
						landed,
						row,
						swatch.hex,
						(c) => {
							const colours = paint(
								swatch.hex,
							);
							const starred =
								shelf.isStarred(
									swatch.hex,
								);
							if (
								set.chips &&
								swatch.code
							) {
								p.swatch(
									colours.fill,
									colours.ink,
									{
										...c,
										outer:
											c.outer -
											12,
									},
									this
										.#picked ===
										swatch.hex,
									null,
									false,
								);
								p.sector(
									c.outer -
										13,
									c.outer -
										1,
									c.start +
										0.25,
									c.end -
										0.25,
								);
								ctx.fillStyle =
									theme.card;
								ctx.fill();
								p.tangentText(
									starred
										? `★${swatch.code}`
										: swatch.code,
									c.outer -
										7,
									(c.start +
										c.end) /
										2,
									FONT.code(
										theme,
									),
									theme.mutedForeground,
								);
							} else
								p.swatch(
									colours.fill,
									colours.ink,
									c,
									this
										.#picked ===
										swatch.hex,
									swatch.code,
									starred,
								);
						},
					);
				});
			}
		}
	}

	drawCredit(p: RingPaint, set: SwatchSet) {
		const head = set.columns[0];
		if (!head) return;
		const font = FONT.credit(p.theme);
		const length = p.width(CREDIT, font);
		let radius = RING.swatchesInner + set.deepest * set.depth;
		for (let i = 0; i < 3; i++) {
			const span = degrees(length, radius);
			const under = set.columns
				.filter((c) => c.start < span)
				.map((c) => c.swatches.length);
			radius =
				RING.swatchesInner +
				Math.max(0, ...under) * set.depth +
				8;
		}
		const span = degrees(length, radius);
		const first = this.cellOf(set, head, 0);
		const from = Math.ceil(
			(DRAWN[0] - first.start - span) / set.total,
		);
		const to = Math.floor((DRAWN[1] - first.start) / set.total);
		p.ctx.save();
		p.ctx.globalAlpha =
			this.#arrival(
				first.start,
				Math.floor(
					(radius - RING.swatchesInner) /
						set.depth,
				),
			) * this.fade();
		for (let turn = from; turn <= to; turn++)
			p.arcText(
				CREDIT,
				radius,
				first.start + turn * set.total + span / 2,
				font,
				p.theme.mutedForeground,
			);
		p.ctx.restore();
	}

	drawRows(p: RingPaint) {
		const { theme } = p;
		const rows = this.rows;
		const headings =
			this.type === 'recent'
				? ['Recent', 'Document']
				: ['Starred'];
		if (
			this.type === 'starred' &&
			rows.every((r) => r.length === 0)
		) {
			p.radialText(
				'No stars',
				RING.swatchesInner + 40,
				45,
				FONT.footnote(theme, 500),
				theme.mutedForeground,
				'centred',
				true,
			);
			return;
		}
		rows.forEach((list, row) => {
			const first = SwatchRows.cell(row, 0);
			const heading = headings[row];
			if (heading)
				p.radialText(
					heading.toUpperCase(),
					first.inner - 9,
					QUARTER[0] + 1,
					FONT.heading(theme),
					theme.mutedForeground,
					'outward',
					true,
				);
			list.forEach((hex, column) => {
				const cell = SwatchRows.cell(row, column);
				this.flying(p, cell, row, hex, (c) => {
					const colours = paint(hex);
					p.swatch(
						colours.fill,
						colours.ink,
						c,
						this.#picked ===
							hex.slice(0, 7),
						swatchFor(hex).code,
						shelf.isStarred(hex),
					);
				});
			});
		});
	}

	drawSliders(p: RingPaint) {
		const { ctx, theme } = p;
		const width =
			(SLIDER_ARC[1] - SLIDER_ARC[0]) / SLIDER_MODES.length;
		SLIDER_MODES.forEach((mode, i) => {
			const start = SLIDER_ARC[0] + i * width;
			const on = mode === this.sliderMode;
			p.sector(
				LANES.mode[0],
				LANES.mode[1],
				start + 0.4,
				start + width - 0.4,
			);
			ctx.fillStyle = on ? theme.primary : theme.card;
			ctx.fill();
			ctx.strokeStyle = theme.border;
			ctx.lineWidth = 1;
			ctx.stroke();
			p.radialText(
				SLIDER_TITLES[mode],
				(LANES.mode[0] + LANES.mode[1]) / 2,
				start + width / 2,
				FONT.caption(theme),
				on ? theme.primaryForeground : theme.foreground,
			);
		});
		const current = this.current;
		const values = channels(this.sliderMode, current);
		const names = CHANNEL_NAMES[this.sliderMode];
		const shown = figures(this.sliderMode, values);
		for (let track = 0; track < 3; track++) {
			const lane = LANES.inner + (2 - track) * LANES.step;
			const place = {
				inner: lane,
				outer: lane + LANES.depth,
				start: DRAWN[0] + track * 30,
				end: 0,
			};
			this.flying(p, place, track, undefined, (c) =>
				this.drawTrack(
					p,
					c.inner,
					c.outer,
					values,
					track,
					names[track]!,
					shown[track]!,
				),
			);
		}
	}

	drawTrack(
		p: RingPaint,
		inner: number,
		outer: number,
		values: number[],
		track: number,
		name: string,
		figure: string,
	) {
		const { ctx, theme, geometry } = p;
		const [from, to] = SLIDER_ARC;
		const steps = 72;
		for (let step = 0; step < steps; step++) {
			const a = from + ((to - from) * step) / steps;
			const b = from + ((to - from) * (step + 1)) / steps;
			p.sector(inner, outer, a, b + 0.15);
			const at = [...values];
			at[track] = step / (steps - 1);
			ctx.fillStyle = hexOf(
				fromChannels(this.sliderMode, at, 1),
				false,
			);
			ctx.fill();
		}
		p.sector(inner, outer, from, to);
		ctx.strokeStyle = theme.border;
		ctx.lineWidth = 1;
		ctx.stroke();
		const middle = (inner + outer) / 2;
		const value = clamp(values[track]!, 0, 1);
		const knob = geometry.point(middle, from + (to - from) * value);
		const side = Math.min(26, outer - inner);
		ctx.beginPath();
		ctx.arc(knob.x, knob.y, side / 2, 0, Math.PI * 2);
		ctx.fillStyle = theme.card;
		ctx.fill();
		ctx.strokeStyle = theme.foreground;
		ctx.lineWidth = 2;
		ctx.stroke();
		ctx.beginPath();
		ctx.arc(knob.x, knob.y, (side * 8) / 13 / 2, 0, Math.PI * 2);
		ctx.fillStyle = hexOf(this.current, false);
		ctx.fill();
		p.tangentText(
			name,
			middle,
			to + degrees(10, middle),
			FONT.footnote(theme),
			theme.mutedForeground,
		);
		p.radialText(
			figure,
			middle,
			from - degrees(10, middle),
			FONT.figure(theme),
			theme.foreground,
		);
	}

	drawTypes(p: RingPaint) {
		const { ctx, theme } = p;
		const arc = this.selectionAngle();
		p.sector(
			RING.typesInner,
			RING.typesOuter,
			arc + 0.6,
			arc + TYPE_SPAN - 0.6,
		);
		ctx.fillStyle = theme.primary;
		ctx.fill();
		RING_TYPES.forEach((ring, index) => {
			const middle = typeStart(index) + TYPE_SPAN / 2;
			const covered =
				Math.abs(middle - (arc + TYPE_SPAN / 2)) <
				TYPE_SPAN / 2;
			p.radialText(
				ring.title,
				(RING.typesInner + RING.typesOuter) / 2 + 6,
				middle,
				FONT.footnote(
					theme,
					index === this.typeIndex ? 600 : 500,
				),
				covered
					? theme.primaryForeground
					: theme.foreground,
				'centred',
				!covered,
			);
		});
	}

	drawHub(p: RingPaint) {
		const { ctx, theme, geometry } = p;
		this.drawWell(p);
		ctx.save();
		ctx.globalAlpha = this.fade();
		const symbols: [string, number, boolean][] = [
			['pipette', RING.eyedropperAngle, false],
			['star', RING.starAngle, this.starred],
			['hash', RING.hexAngle, false],
			['', RING.hueWheelAngle, false],
		];
		for (const [name, angle, filled] of symbols) {
			const c = geometry.point(RING.buttonOrbit, angle);
			ctx.beginPath();
			ctx.arc(c.x, c.y, RING.buttonRadius, 0, Math.PI * 2);
			ctx.fillStyle = theme.card;
			ctx.fill();
			ctx.strokeStyle = theme.border;
			ctx.lineWidth = 1;
			ctx.stroke();
			if (!name) {
				this.drawHueIcon(ctx, c);
				continue;
			}
			const image = p.symbol(
				name,
				filled ? theme.primary : theme.foreground,
				filled,
			);
			if (image)
				ctx.drawImage(image, c.x - 8, c.y - 8, 16, 16);
		}
		ctx.restore();
	}

	drawHueIcon(ctx: CanvasRenderingContext2D, c: Point) {
		const steps = 36;
		ctx.save();
		ctx.lineWidth = 3.5;
		for (let i = 0; i < steps; i++) {
			const from = i / steps;
			const to = (i + 1) / steps;
			ctx.strokeStyle = HUE_ICON[i]!;
			ctx.beginPath();
			ctx.arc(
				c.x,
				c.y,
				7.5,
				(from - 0.25) * 2 * Math.PI,
				(to - 0.25) * 2 * Math.PI + 0.02,
			);
			ctx.stroke();
		}
		ctx.restore();
	}

	drawWell(p: RingPaint) {
		const { ctx, theme, geometry } = p;
		const { x, y } = geometry.hub;
		const well = RING.well;
		ctx.save();
		ctx.beginPath();
		ctx.arc(x, y, well, 0, Math.PI * 2);
		ctx.clip();
		const checks = p.checks();
		if (checks) {
			ctx.fillStyle = checks;
			ctx.fillRect(x - well, y - well, well * 2, well * 2);
		}
		ctx.fillStyle = hexOf(this.current);
		ctx.fillRect(x - well, y - well, well * 2, well * 2);
		ctx.restore();
		ctx.beginPath();
		ctx.arc(x, y, well + 2, 0, Math.PI * 2);
		ctx.strokeStyle = theme.card;
		ctx.lineWidth = 4;
		ctx.stroke();
		ctx.beginPath();
		ctx.arc(x, y, well + 4.5, 0, Math.PI * 2);
		ctx.strokeStyle = theme.border;
		ctx.lineWidth = 1;
		ctx.stroke();
	}

	drawHover(p: RingPaint, hover: Hover) {
		const { ctx, theme, geometry } = p;
		const c = hover.cell;
		p.sector(
			c.inner + 1,
			c.outer - 1,
			c.start + 0.25,
			c.end - 0.25,
		);
		ctx.strokeStyle = theme.foreground;
		ctx.lineWidth = 2;
		ctx.stroke();
		const { swatch } = hover;
		const head = swatch.name
			? `${swatch.code}  ${swatch.name}`
			: swatch.code;
		const headFont = FONT.subheadline(theme);
		const hexFont = FONT.hex(theme);
		const headHeight = 20;
		const hexHeight = 14;
		const width =
			Math.max(
				p.width(head, headFont),
				p.width(swatch.hex, hexFont),
			) + 48;
		const height = Math.max(44, headHeight + hexHeight + 14);
		const x = geometry.mirrored
			? hover.point.x + 16
			: hover.point.x - width - 16;
		const y = Math.max(GAP, hover.point.y - height - 16);
		ctx.fillStyle = theme.border;
		ctx.fillRect(x - 1, y - 1, width + 2, height + 2);
		ctx.fillStyle = theme.card;
		ctx.fillRect(x, y, width, height);
		ctx.fillStyle = paint(swatch.hex).fill;
		ctx.fillRect(x + 8, y + 8, 22, height - 16);
		ctx.textAlign = 'left';
		ctx.textBaseline = 'top';
		ctx.font = headFont;
		ctx.fillStyle = theme.foreground;
		ctx.fillText(head, x + 38, y + 7);
		ctx.font = hexFont;
		ctx.fillStyle = theme.mutedForeground;
		ctx.fillText(swatch.hex, x + 38, y + 7 + headHeight);
	}

	drawLoupe(p: RingPaint, point: Point) {
		const { ctx, theme } = p;
		const colour = this.sample(point);
		const centre = { x: point.x, y: point.y - 64 };
		const radius = 32;
		ctx.beginPath();
		ctx.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
		ctx.fillStyle = colour ? hexOf(colour) : 'transparent';
		ctx.fill();
		ctx.strokeStyle = theme.card;
		ctx.lineWidth = 6;
		ctx.stroke();
		ctx.beginPath();
		ctx.arc(centre.x, centre.y, radius + 3.5, 0, Math.PI * 2);
		ctx.strokeStyle = theme.border;
		ctx.lineWidth = 1;
		ctx.stroke();
		if (colour) {
			const hex = hexOf(colour, false);
			ctx.font = FONT.hex(theme);
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillStyle = paint(hex).ink;
			ctx.fillText(hex, centre.x, centre.y);
		}
		ctx.strokeStyle = theme.foreground;
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.moveTo(point.x - 8, point.y);
		ctx.lineTo(point.x + 8, point.y);
		ctx.moveTo(point.x, point.y - 8);
		ctx.lineTo(point.x, point.y + 8);
		ctx.stroke();
	}

	drawFocus(p: RingPaint) {
		const key = this.focusKey;
		if (!key) return;
		const { ctx, theme, geometry } = p;
		const [kind, which] = key.split(':');
		ctx.save();
		ctx.strokeStyle = theme.foreground;
		ctx.lineWidth = 2;
		if (kind === 'type') {
			const start = typeStart(Number(which));
			p.sector(
				RING.typesInner - 3,
				RING.typesOuter + 3,
				start,
				start + TYPE_SPAN,
			);
			ctx.stroke();
		} else if (kind === 'button') {
			const angle = {
				eyedropper: RING.eyedropperAngle,
				star: RING.starAngle,
				hex: RING.hexAngle,
				wheel: RING.hueWheelAngle,
			}[which as 'hex'];
			const c = geometry.point(RING.buttonOrbit, angle);
			ctx.beginPath();
			ctx.arc(
				c.x,
				c.y,
				RING.buttonRadius + 3,
				0,
				Math.PI * 2,
			);
			ctx.stroke();
		} else if (kind === 'mode') {
			const width =
				(SLIDER_ARC[1] - SLIDER_ARC[0]) /
				SLIDER_MODES.length;
			const start = SLIDER_ARC[0] + Number(which) * width;
			p.sector(
				LANES.mode[0] - 2,
				LANES.mode[1] + 2,
				start,
				start + width,
			);
			ctx.stroke();
		} else if (kind === 'track') {
			const lane =
				LANES.inner + (2 - Number(which)) * LANES.step;
			p.sector(
				lane - 3,
				lane + LANES.depth + 3,
				SLIDER_ARC[0],
				SLIDER_ARC[1],
			);
			ctx.stroke();
		}
		ctx.restore();
	}

	frame(inner: number, outer: number, start: number, end: number) {
		const corners = [
			[inner, start],
			[inner, end],
			[outer, start],
			[outer, end],
			[outer, (start + end) / 2],
		].map(([r, a]) => this.geometry.point(r!, a!));
		const xs = corners.map((c) => c.x);
		const ys = corners.map((c) => c.y);
		const x = Math.min(...xs);
		const y = Math.min(...ys);
		return htmlSafe(
			`left: ${x}px; top: ${y}px; width: ${Math.max(...xs) - x}px; height: ${Math.max(...ys) - y}px`,
		);
	}

	typeFrame = (index: number) => {
		void this.layout;
		const start = typeStart(index);
		return this.frame(
			RING.typesInner,
			RING.typesOuter,
			start,
			start + TYPE_SPAN,
		);
	};

	buttonFrame = (angle: number) => {
		void this.layout;
		const c = this.geometry.point(RING.buttonOrbit, angle);
		const reach = RING.buttonReach;
		return htmlSafe(
			`left: ${c.x - reach}px; top: ${c.y - reach}px; width: ${reach * 2}px; height: ${reach * 2}px`,
		);
	};

	modeFrame = (index: number) => {
		void this.layout;
		const width =
			(SLIDER_ARC[1] - SLIDER_ARC[0]) / SLIDER_MODES.length;
		const start = SLIDER_ARC[0] + index * width;
		return this.frame(
			LANES.mode[0],
			LANES.mode[1],
			start,
			start + width,
		);
	};

	trackFrame = (track: number) => {
		void this.layout;
		const lane = LANES.inner + (2 - track) * LANES.step;
		return this.frame(
			lane,
			lane + LANES.depth,
			SLIDER_ARC[0],
			SLIDER_ARC[1],
		);
	};

	get bandFrame() {
		void this.layout;
		return this.frame(
			RING.swatchesInner,
			this.outerRadius,
			QUARTER[0],
			QUARTER[1],
		);
	}

	get angles() {
		return {
			eyedropper: RING.eyedropperAngle,
			star: RING.starAngle,
			hex: RING.hexAngle,
			wheel: RING.hueWheelAngle,
		};
	}

	channelName = (track: number) => CHANNEL_NAMES[this.sliderMode][track];

	get shownChannels() {
		void this.store.current;
		void this.writer.targetColour;
		return channels(this.sliderMode, this.current);
	}

	channelFigure = (track: number) =>
		figures(this.sliderMode, this.shownChannels)[track];

	channelValue = (track: number) =>
		Math.round((this.shownChannels[track] ?? 0) * 100);

	focused = (key: string, e: FocusEvent) => {
		const target = e.target as HTMLElement;
		this.focusKey = target.matches(':focus-visible') ? key : null;
		this.draw();
	};

	blurred = () => {
		this.focusKey = null;
		if (this.#cursor) {
			this.#cursor = null;
			this.#hover = null;
		}
		this.draw();
	};

	nudge = (track: number, e: KeyboardEvent) => {
		const big = e.shiftKey ? 0.05 : 0.01;
		const step = {
			ArrowUp: big,
			ArrowRight: big,
			ArrowDown: -big,
			ArrowLeft: -big,
		}[e.key];
		if (step === undefined) return;
		e.preventDefault();
		const values = channels(this.sliderMode, this.current);
		values[track] = clamp(values[track]! + step, 0, 1);
		this.write(
			fromChannels(
				this.sliderMode,
				values,
				this.current.alpha,
			),
			true,
		);
	};

	bandKey = (e: KeyboardEvent) => {
		const moves: Record<string, [number, number]> = {
			ArrowRight: [1, 0],
			ArrowLeft: [-1, 0],
			ArrowUp: [0, 1],
			ArrowDown: [0, -1],
		};
		if ((e.key === 'Enter' || e.key === ' ') && this.#hover) {
			e.preventDefault();
			this.pickAndLeave(this.#hover.swatch);
			return;
		}
		const move = moves[e.key];
		if (!move) return;
		e.preventDefault();
		this.moveCursor(move[0], move[1]);
	};

	moveCursor(dx: number, dy: number) {
		this.#spin = 0;
		const set = this.activeSet;
		if (set) {
			const filled = set.columns
				.map((c, i) => [c, i] as const)
				.filter(([c]) => c.swatches.length > 0)
				.map(([, i]) => i);
			if (!filled.length) return;
			let at = this.#cursor;
			if (!at) at = this.firstVisible(set, filled);
			else {
				const place = filled.indexOf(at.column);
				const column =
					filled[
						(place + dx + filled.length) %
							filled.length
					]!;
				const depth =
					set.columns[column]!.swatches.length;
				at = {
					column,
					row: clamp(at.row + dy, 0, depth - 1),
				};
			}
			this.#cursor = at;
			this.placeCursor(set, at);
			return;
		}
		const rows = this.rows.filter((r) => r.length);
		if (!rows.length) return;
		let at = this.#cursor ?? { column: 0, row: 0 };
		if (this.#cursor) {
			const row = clamp(at.row + dy, 0, this.rows.length - 1);
			const length = this.rows[row]!.length;
			if (!length) return;
			at = {
				row,
				column: clamp(at.column + dx, 0, length - 1),
			};
		}
		this.#cursor = at;
		const hex = this.rows[at.row]?.[at.column];
		if (!hex) return;
		const cell = SwatchRows.cell(at.row, at.column);
		this.showCursor(swatchFor(hex), cell);
	}

	firstVisible(set: SwatchSet, filled: number[]): Cursor {
		const picked = this.#picked;
		for (const column of filled) {
			const row = set.columns[column]!.swatches.findIndex(
				(s) => s.hex === picked,
			);
			if (row >= 0) return { column, row };
		}
		const middle = set.wrapped(45 - QUARTER[0] + this.offset);
		const column =
			filled.find((i) => {
				const c = set.columns[i]!;
				return (
					middle >= c.start &&
					middle < c.start + c.width
				);
			}) ?? filled[0]!;
		return { column, row: 0 };
	}

	placeCursor(set: SwatchSet, at: Cursor) {
		const column = set.columns[at.column]!;
		const lapped = () => {
			const base = this.cellOf(set, column, at.row);
			const lap = Math.round(
				(45 - (base.start + base.end) / 2) / set.total,
			);
			return this.cellOf(set, column, at.row, lap);
		};
		let cell = lapped();
		let shift = 0;
		if (cell.start < QUARTER[0]) shift = cell.start - QUARTER[0];
		else if (cell.end > QUARTER[1]) shift = cell.end - QUARTER[1];
		if (shift) {
			this.#offsets[this.type] = set.wrapped(
				this.offset + shift,
			);
			cell = lapped();
		}
		this.showCursor(column.swatches[at.row]!, cell);
	}

	showCursor(swatch: Swatch, cell: Cell) {
		const point = this.geometry.point(
			(cell.inner + cell.outer) / 2,
			(cell.start + cell.end) / 2,
		);
		this.#hover = { swatch, cell, point };
		this.announce = swatch.name
			? `${swatch.code} ${swatch.name}`
			: swatch.hex;
		this.draw();
	}

	rootKey = (e: KeyboardEvent) => {
		if (e.key !== 'Escape') return;
		e.preventDefault();
		e.stopPropagation();
		if (this.sampling) {
			this.sampling = false;
			this.#snapshot = null;
			this.draw();
		} else if (this.keypadOpen || this.wheelOpen) this.finish();
		else this.closeRing();
	};

	get rootClass() {
		return [
			'sub-ring',
			this.shown ? 'is-shown' : '',
			this.leaving ? 'is-leaving' : '',
			this.sampling ? 'is-sampling' : '',
		].join(' ');
	}

	<template>
		<div
			class={{this.rootClass}}
			role="dialog"
			aria-label="Colour"
			{{this.setup}}
			{{this.watch editorUi.ringOpen}}
		>
			<canvas
				class="sub-ring-canvas"
				aria-hidden="true"
				{{this.pointer}}
			></canvas>
			{{#if this.shown}}
				<div class="sub-ring-keys">
					<div
						role="radiogroup"
						aria-label="Type"
					>
						{{#each this.types as |ring i|}}
							<button
								type="button"
								role="radio"
								class="sub-ring-key"
								aria-checked={{if
									(eq
										i
										this.typeIndex
									)
									"true"
									"false"
								}}
								style={{this.typeFrame
									i
								}}
								{{on
									"click"
									(fn
										this.pickType
										i
									)
								}}
								{{on
									"focus"
									(fn
										this.focused
										(concatKey
											"type"
											i
										)
									)
								}}
								{{on
									"blur"
									this.blurred
								}}
							>{{ring.title}}</button>
						{{/each}}
					</div>
					<button
						type="button"
						class="sub-ring-key"
						aria-label="Eyedropper"
						aria-pressed={{if
							this.sampling
							"true"
							"false"
						}}
						style={{this.buttonFrame
							this.angles.eyedropper
						}}
						{{on
							"click"
							this.startSampling
						}}
						{{on
							"focus"
							(fn
								this.focused
								"button:eyedropper"
							)
						}}
						{{on "blur" this.blurred}}
					></button>
					<button
						type="button"
						class="sub-ring-key"
						aria-label="Favourite"
						aria-pressed={{if
							this.starred
							"true"
							"false"
						}}
						style={{this.buttonFrame
							this.angles.star
						}}
						{{on "click" this.toggleStar}}
						{{on
							"focus"
							(fn
								this.focused
								"button:star"
							)
						}}
						{{on "blur" this.blurred}}
					></button>
					<button
						type="button"
						class="sub-ring-key"
						aria-label="Hex"
						aria-expanded={{if
							this.keypadOpen
							"true"
							"false"
						}}
						style={{this.buttonFrame
							this.angles.hex
						}}
						{{on "click" this.editHex}}
						{{on
							"focus"
							(fn
								this.focused
								"button:hex"
							)
						}}
						{{on "blur" this.blurred}}
					></button>
					<button
						type="button"
						class="sub-ring-key"
						aria-label="Colour Wheel"
						aria-expanded={{if
							this.wheelOpen
							"true"
							"false"
						}}
						style={{this.buttonFrame
							this.angles.wheel
						}}
						{{on "click" this.openWheel}}
						{{on
							"focus"
							(fn
								this.focused
								"button:wheel"
							)
						}}
						{{on "blur" this.blurred}}
					></button>
					{{#if this.isSliders}}
						<div
							role="radiogroup"
							aria-label="Model"
						>
							{{#each
								this.modes
								as |mode i|
							}}
								<button
									type="button"
									role="radio"
									class="sub-ring-key"
									aria-checked={{if
										(eq
											mode
											this.sliderMode
										)
										"true"
										"false"
									}}
									style={{this.modeFrame
										i
									}}
									{{on
										"click"
										(fn
											this.pickMode
											mode
										)
									}}
									{{on
										"focus"
										(fn
											this.focused
											(concatKey
												"mode"
												i
											)
										)
									}}
									{{on
										"blur"
										this.blurred
									}}
								>{{titleOf
										mode
									}}</button>
							{{/each}}
						</div>
						{{#each (tracks) as |track|}}
							<span
								class="sub-ring-key"
								role="slider"
								tabindex="0"
								aria-label={{this.channelName
									track
								}}
								aria-valuemin="0"
								aria-valuemax="100"
								aria-valuenow={{this.channelValue
									track
								}}
								aria-valuetext={{this.channelFigure
									track
								}}
								style={{this.trackFrame
									track
								}}
								{{on
									"keydown"
									(fn
										this.nudge
										track
									)
								}}
								{{on
									"focus"
									(fn
										this.focused
										(concatKey
											"track"
											track
										)
									)
								}}
								{{on
									"blur"
									this.blurred
								}}
							></span>
						{{/each}}
					{{else}}
						<div
							class="sub-ring-key sub-ring-band"
							role="application"
							tabindex="0"
							aria-label={{this.typeTitle}}
							style={{this.bandFrame}}
							{{on
								"keydown"
								this.bandKey
							}}
							{{on
								"blur"
								this.blurred
							}}
						></div>
					{{/if}}
				</div>
				<output
					class="sub-ring-live"
					aria-live="polite"
				>{{this.announce}}</output>
				{{#if this.keypadOpen}}
					<HexKeypad
						class="sub-ring-pad"
						style={{this.keypadStyle}}
						@digits={{this.digits}}
						@onChange={{this.typed}}
						@onDone={{this.finish}}
					/>
				{{/if}}
				{{#if this.wheelOpen}}
					<div
						class="sub-ring-pad"
						style={{this.wheelStyle}}
					><HueWheel
							@colour={{this.current}}
							@onChange={{this.wheeled}}
						/></div>
				{{/if}}
			{{/if}}
		</div>
	</template>
}

function concatKey(kind: string, index: number) {
	return `${kind}:${index}`;
}

function titleOf(mode: SliderMode) {
	return SLIDER_TITLES[mode];
}

function tracks() {
	return [0, 1, 2];
}
