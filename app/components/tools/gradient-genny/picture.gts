import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import CanonFigure from 'delphicanon/components/canon-figure';
import { getColourName } from 'delphitools-v2/lib/colour-names';
import type { GradientModel } from './model';
import {
	bearing,
	clamp,
	cornerKeys,
	cornerTitles,
	cssLine,
	railNormal,
	railPoint,
	railProject,
	renderGradient,
	snapAngle,
	type CornerKey,
	type FreeformPoint,
	type Point,
	type Rail,
	type Stop,
} from './paint';

interface Signature {
	Args: {
		model: GradientModel;
		width: number;
		height: number;
		onSelect: (id: string) => void;
	};
	Element: HTMLDivElement;
}

type Grab =
	| { kind: 'stop' | 'point'; id: string; offset: Point }
	| { kind: 'corner'; id: string }
	| { kind: 'turn' }
	| { kind: 'centre'; offset: Point; grip: Point };

interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

const margin = 30;
const hintRoom = 22;
const reach = 24;
const pullDistance = 64;
const pullOutside = 36;
const gripReach = 44;
const slop = 4;
const pixelCap = 640;

const corner = (key: CornerKey, r: Rect): Point => ({
	x: key.endsWith('Left') ? r.x : r.x + r.width,
	y: key.startsWith('top') ? r.y : r.y + r.height,
});

const px = (value: number) => `${value.toFixed(1)}px`;
const pair = (p: Point) =>
	`${Math.round(p.x * 100)} %, ${Math.round(p.y * 100)} %`;

export default class GradientPicture extends Component<Signature> {
	@tracked box = { width: 0, height: 0 };
	@tracked grab: Grab | null = null;
	@tracked lifted: Point | null = null;
	@tracked tether: Point | null = null;
	@tracked pulled: Stop | FreeformPoint | null = null;
	@tracked figure: { text: string; unit: string; top: boolean } | null =
		null;

	#lastRingT = 0;
	#turnFrom = { angle: 0, bearing: 0 };
	#down: { x: number; y: number; moved: boolean } | null = null;

	get model() {
		return this.args.model;
	}

	get image(): Rect {
		const { width, height } = this.box;
		const area = {
			width: width - margin * 2,
			height: height - margin * 2 - hintRoom,
		};
		const { width: w, height: h } = this.args;
		if (area.width <= 0 || area.height <= 0 || w <= 0 || h <= 0)
			return { x: 0, y: 0, width: 0, height: 0 };
		const scale = Math.min(area.width / w, area.height / h);
		const fitted = {
			width: Math.round(w * scale),
			height: Math.round(h * scale),
		};
		return {
			x: Math.round(margin + (area.width - fitted.width) / 2),
			y: Math.round(
				margin + (area.height - fitted.height) / 2,
			),
			...fitted,
		};
	}

	view(unit: Point): Point {
		const r = this.image;
		return {
			x: r.x + unit.x * r.width,
			y: r.y + unit.y * r.height,
		};
	}

	unit(p: Point): Point {
		const r = this.image;
		return {
			x: clamp((p.x - r.x) / Math.max(1, r.width), 0, 1),
			y: clamp((p.y - r.y) / Math.max(1, r.height), 0, 1),
		};
	}

	get centre(): Point {
		const r = this.image;
		return this.model.mode === 'linear'
			? { x: r.x + r.width / 2, y: r.y + r.height / 2 }
			: this.view(this.model.centre);
	}

	get rail(): Rail {
		const r = this.image;
		const { mode, angle } = this.model;
		const c = this.centre;
		if (mode === 'radial') {
			const far = [
				{ x: r.x, y: r.y },
				{ x: r.x + r.width, y: r.y },
				{ x: r.x, y: r.y + r.height },
				{ x: r.x + r.width, y: r.y + r.height },
			].reduce((best, p) =>
				Math.hypot(p.x - c.x, p.y - c.y) >
				Math.hypot(best.x - c.x, best.y - c.y)
					? p
					: best,
			);
			return { kind: 'line', from: c, to: far };
		}
		if (mode === 'conic') {
			const edge = Math.min(
				c.x - r.x,
				r.x + r.width - c.x,
				c.y - r.y,
				r.y + r.height - c.y,
			);
			const radius = Math.max(
				28,
				Math.min(
					Math.min(r.width, r.height) * 0.32,
					edge + margin - 50,
				),
			);
			return {
				kind: 'ring',
				centre: c,
				radius,
				start: angle,
			};
		}
		const line = cssLine(angle, r.width, r.height);
		return {
			kind: 'line',
			from: { x: r.x + line.start.x, y: r.y + line.start.y },
			to: { x: r.x + line.end.x, y: r.y + line.end.y },
		};
	}

	inside(p: Point): Point {
		const { width, height } = this.box;
		return {
			x: clamp(p.x, 16, width - 16),
			y: clamp(p.y, 16, height - 16),
		};
	}

	get hubPoint(): Point | undefined {
		const { mode } = this.model;
		const c = this.centre;
		if (this.grab?.kind === 'centre' && mode === 'radial')
			return this.inside({
				x: c.x + this.grab.grip.x,
				y: c.y + this.grab.grip.y,
			});
		const away = railNormal(this.rail, 0);
		if (mode === 'linear')
			return this.inside({
				x: c.x + away.x * gripReach,
				y: c.y + away.y * gripReach,
			});
		if (mode === 'radial')
			return this.inside({
				x: c.x - away.y * gripReach,
				y: c.y + away.x * gripReach,
			});
		if (mode === 'conic') return c;
		return undefined;
	}

	get knobPoint(): Point | undefined {
		const rail = this.rail;
		if (rail.kind !== 'ring') return undefined;
		const radians = (rail.start * Math.PI) / 180;
		return {
			x:
				rail.centre.x +
				(rail.radius + 38) * Math.sin(radians),
			y:
				rail.centre.y -
				(rail.radius + 38) * Math.cos(radians),
		};
	}

	get ready() {
		return this.image.width > 0;
	}

	get hub() {
		const p = this.hubPoint;
		if (!p || !this.ready) return undefined;
		const { mode, angle, centre } = this.model;
		const turns = mode === 'linear';
		return {
			isCentre: !turns,
			label: turns ? 'Angle' : 'Centre',
			valueNow: turns ? angle : Math.round(centre.x * 100),
			valueText: turns ? `${angle}°` : pair(centre),
			style: htmlSafe(
				`left: ${px(p.x)}; top: ${px(p.y)}; rotate: ${turns ? angle : 0}deg`,
			),
		};
	}

	get knob() {
		const p = this.knobPoint;
		if (!p || !this.ready) return undefined;
		const { angle } = this.model;
		return {
			valueText: `${angle}°`,
			style: htmlSafe(
				`left: ${px(p.x)}; top: ${px(p.y)}; rotate: ${angle}deg`,
			),
		};
	}

	get grabbedId() {
		const grab = this.grab;
		return grab && 'id' in grab ? grab.id : undefined;
	}

	get handles() {
		if (!this.ready) return [];
		const { model } = this;
		const selected = model.selected;
		const shown = (
			id: string,
			at: Point,
			colour: string,
			extra: { valueNow?: number; valueText?: string },
		) => {
			const lifted =
				id === this.grabbedId ? this.lifted : null;
			const p = lifted ?? at;
			return {
				id,
				colour,
				name: getColourName(colour),
				chosen: id === selected,
				pulled: this.pulled?.id === id,
				...extra,
				style: htmlSafe(
					`left: ${px(p.x)}; top: ${px(p.y)}; --gg-colour: ${colour}`,
				),
			};
		};
		if (model.mode === 'corners') {
			const r = this.image;
			return cornerKeys.map((key, i) => ({
				...shown(
					key,
					corner(key, r),
					model.corners[key],
					{},
				),
				name: cornerTitles[i]!,
			}));
		}
		if (model.mode === 'freeform') {
			const list = [...model.points];
			if (this.pulled)
				list.push(this.pulled as FreeformPoint);
			return list.map((point) =>
				shown(
					point.id,
					this.view(point),
					point.colour,
					{
						valueNow: Math.round(
							point.x * 100,
						),
						valueText: pair(point),
					},
				),
			);
		}
		const rail = this.rail;
		const list = [...model.stops];
		if (this.pulled) list.push(this.pulled as Stop);
		return list.map((stop) =>
			shown(
				stop.id,
				this.inside(
					railPoint(rail, stop.position / 100),
				),
				stop.colour,
				{
					valueNow: stop.position,
					valueText: `${stop.position} %`,
				},
			),
		);
	}

	get kind() {
		const { mode } = this.model;
		return mode === 'corners'
			? 'corner'
			: mode === 'freeform'
				? 'point'
				: 'stop';
	}

	get isCorners() {
		return this.model.mode === 'corners';
	}

	get lines() {
		if (!this.ready) return '';
		const { mode } = this.model;
		const parts: string[] = [];
		const seg = (a: Point, b: Point) =>
			`M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
		const rail = this.rail;
		if (mode === 'linear' || mode === 'radial') {
			if (rail.kind === 'line')
				parts.push(seg(rail.from, rail.to));
			const c = this.centre;
			const grip = this.hubPoint!;
			const length = Math.max(
				1,
				Math.hypot(grip.x - c.x, grip.y - c.y),
			);
			parts.push(
				seg(c, {
					x:
						grip.x -
						((grip.x - c.x) / length) * 9,
					y:
						grip.y -
						((grip.y - c.y) / length) * 9,
				}),
			);
		} else if (mode === 'conic' && rail.kind === 'ring') {
			const { centre: c, radius, start } = rail;
			parts.push(
				`M${(c.x - radius).toFixed(1)} ${c.y.toFixed(1)}a${radius} ${radius} 0 1 0 ${radius * 2} 0a${radius} ${radius} 0 1 0 ${-radius * 2} 0`,
			);
			const radians = (start * Math.PI) / 180;
			parts.push(
				seg(c, {
					x:
						c.x +
						(radius + 26) *
							Math.sin(radians),
					y:
						c.y -
						(radius + 26) *
							Math.cos(radians),
				}),
			);
		}
		if (this.tether && this.lifted)
			parts.push(seg(this.tether, this.lifted));
		return parts.join('');
	}

	get imageStyle() {
		const r = this.image;
		return htmlSafe(
			`left: ${r.x}px; top: ${r.y}px; width: ${r.width}px; height: ${r.height}px`,
		);
	}

	get hintStyle() {
		const r = this.image;
		return htmlSafe(`top: ${r.y + r.height + 6}px`);
	}

	get figureStyle() {
		const r = this.image;
		const top = this.figure?.top ?? true;
		return htmlSafe(
			`left: ${r.x + r.width / 2}px; top: ${top ? r.y + 10 : r.y + r.height - 10}px; translate: -50% ${top ? '0' : '-100%'}`,
		);
	}

	get hint() {
		const { mode } = this.model;
		if (mode === 'corners') return 'Click dots to change colours';
		if (mode === 'freeform')
			return 'Drag dots to reposition, click to change colour';
		return 'Tap to add a stop, drag one off to remove it';
	}

	observe = modifier((element: HTMLElement) => {
		const read = () => {
			const { width, height } =
				element.getBoundingClientRect();
			if (
				width !== this.box.width ||
				height !== this.box.height
			)
				this.box = { width, height };
		};
		const observer = new ResizeObserver(read);
		observer.observe(element);
		return () => observer.disconnect();
	});

	paint = modifier((canvas: HTMLCanvasElement) => {
		const { width, height } = this.image;
		if (!width) return;
		const { mode } = this.model;
		const perPixel = mode === 'corners' || mode === 'freeform';
		const scale = perPixel
			? Math.min(1, pixelCap / Math.max(width, height))
			: 1;
		renderGradient(
			canvas,
			Math.max(2, Math.round(width * scale)),
			Math.max(2, Math.round(height * scale)),
			this.model,
		);
	});

	target(p: Point): Grab | undefined {
		const selected = this.model.selected;
		let best: { id: string; d: number; at: Point } | undefined;
		for (const handle of this.handles) {
			if (handle.pulled) continue;
			const at = this.handleCentre(handle.id);
			if (!at) continue;
			const d = Math.hypot(at.x - p.x, at.y - p.y);
			if (d >= reach) continue;
			const better =
				!best ||
				(handle.id === selected &&
					best.id !== selected) ||
				(best.id !== selected && d < best.d);
			if (better) best = { id: handle.id, d, at };
		}
		if (best) {
			const offset = {
				x: p.x - best.at.x,
				y: p.y - best.at.y,
			};
			if (this.kind === 'corner')
				return { kind: 'corner', id: best.id };
			return { kind: this.kind, id: best.id, offset };
		}
		const knob = this.knobPoint;
		if (knob && Math.hypot(knob.x - p.x, knob.y - p.y) < reach)
			return { kind: 'turn' };
		const hub = this.hubPoint;
		if (hub && Math.hypot(hub.x - p.x, hub.y - p.y) < reach) {
			if (this.model.mode === 'linear')
				return { kind: 'turn' };
			const c = this.centre;
			return {
				kind: 'centre',
				offset: { x: p.x - c.x, y: p.y - c.y },
				grip: { x: hub.x - c.x, y: hub.y - c.y },
			};
		}
		return undefined;
	}

	handleCentre(id: string): Point | undefined {
		const { model } = this;
		if (model.mode === 'corners')
			return corner(id as CornerKey, this.image);
		if (model.mode === 'freeform') {
			const point = model.points.find(
				(entry) => entry.id === id,
			);
			return point && this.view(point);
		}
		const stop = model.stops.find((entry) => entry.id === id);
		return (
			stop &&
			this.inside(railPoint(this.rail, stop.position / 100))
		);
	}

	get canRemove() {
		const { model } = this;
		const count =
			(model.mode === 'freeform'
				? model.points.length
				: model.stops.length) + (this.pulled ? 1 : 0);
		return model.mode !== 'corners' && count > 2;
	}

	showFigure(text: string, unit: string, near: Point) {
		const r = this.image;
		this.figure = { text, unit, top: near.y > r.y + r.height / 2 };
	}

	begin(grab: Grab, p: Point) {
		if ('id' in grab) this.args.onSelect(grab.id);
		if (grab.kind === 'corner') return;
		this.grab = grab;
		if (grab.kind === 'stop')
			this.#lastRingT =
				(this.model.stops.find(
					(stop) => stop.id === grab.id,
				)?.position ?? 0) / 100;
		if (grab.kind === 'turn')
			this.#turnFrom = {
				angle: this.model.angle,
				bearing: bearing(this.centre, p),
			};
		this.move(p);
	}

	move(p: Point) {
		const grab = this.grab;
		if (!grab) return;
		if (grab.kind === 'stop')
			this.moveStop(grab.id, {
				x: p.x - grab.offset.x,
				y: p.y - grab.offset.y,
			});
		else if (grab.kind === 'point')
			this.movePoint(grab.id, {
				x: p.x - grab.offset.x,
				y: p.y - grab.offset.y,
			});
		else if (grab.kind === 'turn') this.turn(p);
		else if (grab.kind === 'centre') {
			let unit = this.unit({
				x: p.x - grab.offset.x,
				y: p.y - grab.offset.y,
			});
			if (
				Math.abs(unit.x - 0.5) < 0.02 &&
				Math.abs(unit.y - 0.5) < 0.02
			)
				unit = { x: 0.5, y: 0.5 };
			this.model.centre = unit;
			this.showFigure(pair(unit), '', this.view(unit));
		}
	}

	turn(p: Point) {
		const c = this.centre;
		if (Math.hypot(p.x - c.x, p.y - c.y) <= 8) return;
		const turned =
			this.#turnFrom.angle +
			bearing(c, p) -
			this.#turnFrom.bearing;
		this.model.angle = snapAngle(turned).degrees;
		this.showFigure(String(this.model.angle), '°', p);
	}

	moveStop(id: string, p: Point) {
		const { model } = this;
		const rail = this.rail;
		const projected = railProject(rail, p);
		let t = projected.t;
		const off = projected.off;
		if (rail.kind === 'ring') {
			t = clamp(t + Math.round(this.#lastRingT - t), 0, 1);
			this.#lastRingT = t;
		} else {
			t = clamp(t, 0, 1);
		}
		const removing = Math.abs(off) > pullDistance && this.canRemove;
		if (removing && !this.pulled) {
			this.pulled =
				model.stops.find((stop) => stop.id === id) ??
				null;
			model.stops = model.stops.filter(
				(stop) => stop.id !== id,
			);
		} else if (!removing && this.pulled) {
			model.stops = [...model.stops, this.pulled as Stop];
			this.pulled = null;
		}
		if (!this.pulled) model.setPosition(id, t * 100);
		const raw = Math.max(0, Math.abs(off) - 16);
		const lift = this.canRemove ? raw : Math.min(raw, 10);
		const base = this.inside(railPoint(rail, t));
		const normal = railNormal(rail, t);
		const side = off < 0 ? -1 : 1;
		this.lifted = this.inside({
			x: base.x + normal.x * lift * side,
			y: base.y + normal.y * lift * side,
		});
		this.tether = lift > 0 ? base : null;
		if (this.pulled) this.figure = null;
		else
			this.showFigure(
				String(Math.round(t * 100)),
				'%',
				this.lifted,
			);
	}

	movePoint(id: string, p: Point) {
		const { model } = this;
		const r = this.image;
		const outside = Math.hypot(
			Math.max(r.x - p.x, 0, p.x - r.x - r.width),
			Math.max(r.y - p.y, 0, p.y - r.y - r.height),
		);
		const removing = outside > pullOutside && this.canRemove;
		if (removing && !this.pulled) {
			this.pulled =
				model.points.find((point) => point.id === id) ??
				null;
			model.points = model.points.filter(
				(point) => point.id !== id,
			);
		} else if (!removing && this.pulled) {
			model.points = [
				...model.points,
				this.pulled as FreeformPoint,
			];
			this.pulled = null;
		}
		const unit = this.unit(p);
		if (!this.pulled) model.movePoint(id, unit);
		this.lifted = this.inside(p);
		const base = this.view(unit);
		this.tether =
			Math.hypot(
				this.lifted.x - base.x,
				this.lifted.y - base.y,
			) > 2
				? base
				: null;
		if (this.pulled) this.figure = null;
		else this.showFigure(pair(unit), '', this.lifted);
	}

	end() {
		if (!this.grab) return;
		const removed = this.pulled !== null;
		this.pulled = null;
		this.grab = null;
		this.lifted = null;
		this.tether = null;
		this.figure = null;
		if (removed && !this.model.selectedColour) {
			this.model.selectFirst();
			this.args.onSelect(this.model.selected);
		}
	}

	cancel() {
		const { model } = this;
		const back = this.pulled;
		if (back && model.mode === 'freeform')
			model.points = [...model.points, back as FreeformPoint];
		else if (back) model.stops = [...model.stops, back as Stop];
		this.pulled = null;
		this.end();
	}

	tap(p: Point) {
		const { model } = this;
		const r = this.image;
		if (
			model.mode === 'corners' ||
			p.x < r.x - margin ||
			p.x > r.x + r.width + margin ||
			p.y < r.y - margin ||
			p.y > r.y + r.height + margin
		)
			return;
		if (model.mode === 'freeform') {
			model.addPointAt(this.unit(p));
		} else {
			let t = clamp(railProject(this.rail, p).t, 0, 1);
			if (this.rail.kind === 'ring') t %= 1;
			model.addStopAt(t * 100);
		}
		this.args.onSelect(model.selected);
	}

	pointer = modifier((element: HTMLElement) => {
		const local = (event: PointerEvent): Point => {
			const rect = element.getBoundingClientRect();
			return {
				x: event.clientX - rect.left,
				y: event.clientY - rect.top,
			};
		};
		const down = (event: PointerEvent) => {
			if (event.button !== 0) return;
			const p = local(event);
			this.#down = { ...p, moved: false };
			const found = this.target(p);
			if (!found) return;
			element.setPointerCapture(event.pointerId);
			this.begin(found, p);
		};
		const move = (event: PointerEvent) => {
			const start = this.#down;
			if (!start) return;
			const p = local(event);
			if (Math.hypot(p.x - start.x, p.y - start.y) > slop)
				start.moved = true;
			if (
				!this.grab &&
				start.moved &&
				this.model.mode === 'linear'
			) {
				element.setPointerCapture(event.pointerId);
				this.begin({ kind: 'turn' }, start);
			}
			if (this.grab) {
				event.preventDefault();
				this.move(p);
			}
		};
		const up = (event: PointerEvent) => {
			const start = this.#down;
			this.#down = null;
			if (!start) return;
			if (this.grab) this.end();
			else if (!start.moved) this.tap(local(event));
		};
		const cancel = () => {
			this.#down = null;
			this.cancel();
		};
		element.addEventListener('pointerdown', down);
		element.addEventListener('pointermove', move);
		element.addEventListener('pointerup', up);
		element.addEventListener('pointercancel', cancel);
		return () => {
			element.removeEventListener('pointerdown', down);
			element.removeEventListener('pointermove', move);
			element.removeEventListener('pointerup', up);
			element.removeEventListener('pointercancel', cancel);
			this.cancel();
		};
	});

	select = (id: string) => this.args.onSelect(id);

	stepOf(event: KeyboardEvent): Point | undefined {
		const big = event.shiftKey ? 10 : 1;
		switch (event.key) {
			case 'ArrowLeft':
				return { x: -big, y: 0 };
			case 'ArrowRight':
				return { x: big, y: 0 };
			case 'ArrowUp':
				return { x: 0, y: -big };
			case 'ArrowDown':
				return { x: 0, y: big };
		}
		return undefined;
	}

	handleKey = (id: string, event: KeyboardEvent) => {
		const { model } = this;
		if (event.key === 'Delete' || event.key === 'Backspace') {
			event.preventDefault();
			model.remove(id);
			this.args.onSelect(model.selected);
			return;
		}
		if (model.mode === 'freeform') {
			const step = this.stepOf(event);
			const point = model.points.find(
				(entry) => entry.id === id,
			);
			if (!step || !point) return;
			event.preventDefault();
			model.movePoint(id, {
				x: point.x + step.x / 100,
				y: point.y + step.y / 100,
			});
			return;
		}
		const stop = model.stops.find((entry) => entry.id === id);
		if (!stop) return;
		const big = event.shiftKey ? 10 : 1;
		const next =
			{
				ArrowLeft: stop.position - big,
				ArrowDown: stop.position - big,
				ArrowRight: stop.position + big,
				ArrowUp: stop.position + big,
				Home: 0,
				End: 100,
			}[event.key] ?? undefined;
		if (next === undefined) return;
		event.preventDefault();
		model.setPosition(id, next);
	};

	hubKey = (event: KeyboardEvent) => {
		const { model } = this;
		if (model.mode !== 'linear') {
			const step = this.stepOf(event);
			if (!step) return;
			event.preventDefault();
			model.centre = {
				x: clamp(model.centre.x + step.x / 100, 0, 1),
				y: clamp(model.centre.y + step.y / 100, 0, 1),
			};
			return;
		}
		this.angleKey(event);
	};

	angleKey = (event: KeyboardEvent) => {
		const big = event.shiftKey ? 15 : 1;
		const { model } = this;
		const next =
			{
				ArrowLeft: model.angle - big,
				ArrowDown: model.angle - big,
				ArrowRight: model.angle + big,
				ArrowUp: model.angle + big,
				Home: 0,
			}[event.key] ?? undefined;
		if (next === undefined) return;
		event.preventDefault();
		model.angle = ((next % 360) + 360) % 360;
	};

	<template>
		<div
			class="gg-picture {{if this.grab 'is-dragging'}}"
			{{this.observe}}
			{{this.pointer}}
			...attributes
		>
			{{#if this.ready}}
				<canvas
					class="gg-paint"
					style={{this.imageStyle}}
					role="img"
					aria-label="Gradient preview"
					{{this.paint}}
				></canvas>
				<svg class="gg-lines" aria-hidden="true">
					<path
						class="gg-lines-shade"
						d={{this.lines}}
					/>
					<path
						class="gg-lines-ink"
						d={{this.lines}}
					/>
				</svg>
				{{#if this.hub}}
					<div
						class="gg-hub
							{{if
								this.hub.isCentre
								'is-centre'
							}}"
						style={{this.hub.style}}
					>
						<svg
							viewBox="0 0 44 44"
							aria-hidden="true"
						>
							{{#if
								this.hub.isCentre
							}}
								<path
									class="gg-mark-shade"
									d="M30 22a8 8 0 1 1-16 0a8 8 0 1 1 16 0M22 11v-5M22 33v5M11 22h-5M33 22h5"
								/>
								<path
									class="gg-mark-ink"
									d="M30 22a8 8 0 1 1-16 0a8 8 0 1 1 16 0M22 11v-5M22 33v5M11 22h-5M33 22h5"
								/>
							{{else}}
								<path
									class="gg-mark-shade"
									d="M29 22a7 7 0 1 1-14 0a7 7 0 1 1 14 0M22 15v-13M17 7l5-5l5 5"
								/>
								<path
									class="gg-mark-ink"
									d="M29 22a7 7 0 1 1-14 0a7 7 0 1 1 14 0M22 15v-13M17 7l5-5l5 5"
								/>
							{{/if}}
						</svg>
						<div
							class="gg-hub-control"
							role="slider"
							tabindex="0"
							aria-label={{this.hub.label}}
							aria-valuemin="0"
							aria-valuemax={{if
								this.hub.isCentre
								"100"
								"359"
							}}
							aria-valuenow={{this.hub.valueNow}}
							aria-valuetext={{this.hub.valueText}}
							{{on
								"keydown"
								this.hubKey
							}}
						></div>
					</div>
				{{/if}}
				{{#if this.knob}}
					<div
						class="gg-hub gg-knob"
						style={{this.knob.style}}
					>
						<svg
							viewBox="0 0 44 44"
							aria-hidden="true"
						>
							<path
								class="gg-mark-shade"
								d="M31 22a9 9 0 1 1-18 0a9 9 0 1 1 18 0M22 31v5"
							/>
							<path
								class="gg-mark-ink"
								d="M31 22a9 9 0 1 1-18 0a9 9 0 1 1 18 0M22 31v5"
							/>
						</svg>
						<div
							class="gg-hub-control"
							role="slider"
							tabindex="0"
							aria-label="Start"
							aria-valuemin="0"
							aria-valuemax="359"
							aria-valuenow={{this.model.angle}}
							aria-valuetext={{this.knob.valueText}}
							{{on
								"keydown"
								this.angleKey
							}}
						></div>
					</div>
				{{/if}}
				{{#each this.handles key="id" as |handle|}}
					{{#if this.isCorners}}
						<button
							type="button"
							class="gg-handle
								{{if
									handle.chosen
									'is-chosen'
								}}"
							style={{handle.style}}
							aria-label={{handle.name}}
							aria-pressed={{if
								handle.chosen
								"true"
								"false"
							}}
							data-hex={{handle.colour}}
							{{on
								"focus"
								(fn
									this.select
									handle.id
								)
							}}
							{{on
								"click"
								(fn
									this.select
									handle.id
								)
							}}
						></button>
					{{else}}
						<div
							class="gg-handle
								{{if
									handle.chosen
									'is-chosen'
								}}
								{{if
									handle.pulled
									'is-pulled'
								}}"
							style={{handle.style}}
							role="slider"
							tabindex="0"
							aria-label={{handle.name}}
							aria-valuemin="0"
							aria-valuemax="100"
							aria-valuenow={{handle.valueNow}}
							aria-valuetext={{handle.valueText}}
							data-hex={{handle.colour}}
							data-id={{handle.id}}
							{{on
								"focus"
								(fn
									this.select
									handle.id
								)
							}}
							{{on
								"keydown"
								(fn
									this.handleKey
									handle.id
								)
							}}
						></div>
					{{/if}}
				{{/each}}
				{{#if this.figure}}
					<div
						class="gg-figure"
						style={{this.figureStyle}}
					>
						<CanonFigure
							@text={{this.figure.text}}
							@unit={{this.figure.unit}}
							@size={{28}}
							@halo="var(--canon-card)"
						/>
					</div>
				{{/if}}
				<p
					class="gg-hint"
					style={{this.hintStyle}}
				>{{this.hint}}</p>
			{{/if}}
		</div>
	</template>
}
