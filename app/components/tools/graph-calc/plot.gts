import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { modifier } from 'ember-modifier';
import { capture } from 'delphicanon/lib/motion';
import {
	format,
	minorDivisions,
	niceCeil,
	paint,
	runs,
	spread,
	tickLabel,
	ticks,
	type Evaluator,
	type Plane,
	type Relation,
} from 'delphitools-v2/components/tools/graph-calc/graph';
import type { GraphView } from 'delphitools-v2/components/tools/graph-calc/view';

export interface PlotCurve {
	name: string;
	colour: number;
	relation: Relation;
	evaluate: Evaluator;
}

interface PlotSignature {
	Args: {
		view: GraphView;
		curves: PlotCurve[];
		grid: boolean;
		axes: boolean;
		numbers: boolean;
	};
	Element: HTMLDivElement;
}

export const spacing = { x: 72, y: 48, minor: 9 };
export const grab = 24;
export const tag = { height: 22, gap: 3 };
const labelHeight = 13;
const tapSlop = 6;

let context: CanvasRenderingContext2D | null | undefined;
function measure(text: string, font: string): number {
	context ??= document.createElement('canvas').getContext('2d');
	if (!context) return text.length * 7;
	context.font = font;
	return context.measureText(text).width;
}

interface Label {
	key: string;
	text: string;
	x: number;
	y: number;
}

interface Tag {
	key: string;
	text: string;
	x: number;
	y: number;
	width: number;
	fill: string;
	ink: string;
	guide: string;
	dot?: { x: number; y: number };
	stroke: string;
}

export default class GraphPlot extends Component<PlotSignature> {
	@tracked family = 'sans-serif';

	get view() {
		return this.args.view;
	}

	get width() {
		return this.view.size.width;
	}

	get height() {
		return this.view.size.height;
	}

	get viewBox() {
		return `0 0 ${this.width} ${this.height}`;
	}

	sx(x: number, p: Plane) {
		return ((x - p.xMin) / (p.xMax - p.xMin)) * this.width;
	}

	sy(y: number, p: Plane) {
		return ((p.yMax - y) / (p.yMax - p.yMin)) * this.height;
	}

	px(screen: number, p: Plane) {
		return p.xMin + (screen / this.width) * (p.xMax - p.xMin);
	}

	@cached
	get frame() {
		const p = this.view.plane;
		const { width: w, height: h } = this;
		const empty = {
			minor: '',
			major: '',
			axes: '',
			labels: [] as Label[],
			curves: [] as {
				key: string;
				line: string;
				region: string;
				stroke: string;
				opacity: number;
				dash?: string;
				offset: number;
			}[],
		};
		if (!p || !(w > 0) || !(h > 0)) return empty;
		const per = this.view.perPixel;
		const stepX = niceCeil(per.x * spacing.x);
		const stepY = niceCeil(per.y * spacing.y);

		let minor = '';
		let major = '';
		if (this.args.grid) {
			for (const [step, lo, hi, vertical] of [
				[stepX, p.xMin, p.xMax, true],
				[stepY, p.yMin, p.yMax, false],
			] as const) {
				const divisions = minorDivisions(step);
				const fine = step / divisions;
				const showsMinor =
					fine / (vertical ? per.x : per.y) >=
					spacing.minor;
				for (const count of ticks(lo, hi, fine)) {
					const isMajor = count % divisions === 0;
					if (!showsMinor && !isMajor) continue;
					const value = count * fine;
					const line = vertical
						? `M${this.sx(value, p).toFixed(2)} 0V${h}`
						: `M0 ${this.sy(value, p).toFixed(2)}H${w}`;
					if (isMajor) major += line;
					else minor += line;
				}
			}
		}

		const ox = this.sx(0, p);
		const oy = this.sy(0, p);
		let axes = '';
		if (this.args.axes) {
			if (oy >= 0 && oy <= h)
				axes += `M0 ${oy.toFixed(2)}H${w}`;
			if (ox >= 0 && ox <= w)
				axes += `M${ox.toFixed(2)} 0V${h}`;
		}

		const labels: Label[] = [];
		if (this.args.numbers) {
			const font = `500 10px ${this.family}`;
			const inner = {
				minX: 4,
				maxX: w - 4,
				minY: 3,
				maxY: h - 3,
			};
			const place = (
				key: string,
				text: string,
				at: (width: number) => [number, number],
			) => {
				const [x, y] = at(
					Math.ceil(measure(text, font)),
				);
				labels.push({
					key,
					text,
					x,
					y: y + labelHeight / 2,
				});
			};
			const rowY = Math.min(
				Math.max(oy + 4, inner.minY),
				inner.maxY - labelHeight,
			);
			for (const count of ticks(p.xMin, p.xMax, stepX)) {
				if (count === 0) continue;
				const x = this.sx(count * stepX, p);
				place(
					`x${count}`,
					tickLabel(count, stepX),
					(lw) => [
						Math.min(
							Math.max(
								x - lw / 2,
								inner.minX,
							),
							inner.maxX - lw,
						),
						rowY,
					],
				);
			}
			for (const count of ticks(p.yMin, p.yMax, stepY)) {
				if (count === 0) continue;
				const y = this.sy(count * stepY, p);
				if (
					y - labelHeight / 2 <= inner.minY ||
					y + labelHeight / 2 >= inner.maxY
				)
					continue;
				place(
					`y${count}`,
					tickLabel(count, stepY),
					(lw) => {
						const left = ox - 5 - lw;
						return [
							left < inner.minX
								? Math.max(
										ox +
											5,
										inner.minX,
									)
								: Math.min(
										left,
										inner.maxX -
											lw,
									),
							y - labelHeight / 2,
						];
					},
				);
			}
			if (ox > 12 && ox < w - 12 && oy > 12 && oy < h - 12)
				place('origin', '0', (lw) => [
					ox - 5 - lw,
					oy + 4,
				]);
		}

		const samples = Math.max(
			2,
			Math.min(
				Math.round(w * (window.devicePixelRatio || 1)),
				1600,
			),
		);
		const curves = this.args.curves.map((curve, index) => {
			const { fill } = paint(curve.colour);
			const found = runs(
				samples,
				0,
				w,
				p.yMax - p.yMin,
				(screen) => this.px(screen, p),
				(value) => this.sy(value, p),
				[-h * 4, h * 5],
				curve.evaluate,
			);
			const edge =
				curve.relation === '='
					? undefined
					: curve.relation === '<' ||
						  curve.relation === '≤'
						? h
						: 0;
			let line = '';
			let region = '';
			for (const run of found) {
				const points = run
					.map(
						(pt) =>
							`${pt.x.toFixed(2)},${pt.y.toFixed(2)}`,
					)
					.join('L');
				line += `M${points}`;
				if (edge !== undefined)
					region += `M${run[0]!.x.toFixed(2)},${edge}L${points}L${run.at(-1)!.x.toFixed(2)},${edge}Z`;
			}
			const strict =
				curve.relation === '<' ||
				curve.relation === '>';
			return {
				key: `${index}`,
				line,
				region,
				stroke: fill,
				opacity: strict ? 0.75 : 1,
				dash: strict ? '7 5' : undefined,
				offset: strict ? -(ox % 12) : 0,
			};
		});
		return { minor, major, axes, labels, curves };
	}

	@cached
	get trace() {
		const p = this.view.plane;
		const { width: w, height: h } = this;
		if (!p || !(w > 0) || !(h > 0)) return undefined;
		const traceX = this.view.traceX;
		const x = this.sx(traceX, p);
		const onScreen = x >= 0 && x <= w;
		const font = `600 12px ${this.family}`;
		const xText = format(traceX);
		const xWidth = Math.ceil(measure(xText, font)) + 12;
		const xTag = {
			text: xText,
			width: xWidth,
			x: Math.min(Math.max(x - xWidth / 2, 0), w - xWidth),
			y: h - tag.height - 8,
		};
		const leading = x > w / 2 + w * 0.2;
		const bottom = h - tag.height / 2 - tag.height - 16;
		const placed = this.args.curves.map((curve) => {
			const value = curve.evaluate(traceX);
			const y = Number.isFinite(value)
				? this.sy(value, p)
				: undefined;
			const visible =
				y !== undefined && y >= 0 && y <= h && onScreen;
			const wish =
				y === undefined
					? h / 2
					: Math.min(
							Math.max(
								y,
								tag.height / 2 +
									4,
							),
							bottom,
						);
			return { curve, value, y, visible, wish };
		});
		const highest = 4 + tag.height / 2;
		const centres = spread(
			placed.map((entry) => entry.wish),
			tag.height + tag.gap,
			Math.max(highest, bottom),
		);
		const tags: Tag[] = [];
		placed.forEach((entry, index) => {
			if (!onScreen || entry.y === undefined) return;
			const { fill, ink } = paint(entry.curve.colour);
			const text = format(entry.value);
			const width = Math.ceil(measure(text, font)) + 12;
			const centre = centres[index]!;
			const tagX = leading ? 0 : w - width;
			const end = leading ? tagX + width : tagX;
			tags.push({
				key: `${index}`,
				text,
				x: tagX,
				y: centre - tag.height / 2,
				width,
				fill,
				ink,
				stroke: fill,
				guide: entry.visible
					? `M${x.toFixed(2)},${entry.y.toFixed(2)}L${end},${centre.toFixed(2)}`
					: '',
				dot: entry.visible
					? { x, y: entry.y }
					: undefined,
			});
		});
		return {
			line: onScreen ? `M${x.toFixed(2)} 0V${h}` : '',
			xTag: onScreen ? xTag : undefined,
			tags,
		};
	}

	grabsTrace(point: { x: number; y: number }) {
		const p = this.view.plane;
		if (!p) return false;
		if (Math.abs(point.x - this.sx(this.view.traceX, p)) < grab)
			return true;
		const xTag = this.trace?.xTag;
		return (
			!!xTag &&
			point.x >= xTag.x - 12 &&
			point.x <= xTag.x + xTag.width + 12 &&
			point.y >= xTag.y - 12 &&
			point.y <= xTag.y + tag.height + 12
		);
	}

	traceTo(screenX: number) {
		const p = this.view.plane;
		if (!p) return;
		const clamped = Math.min(Math.max(screenX, 0), this.width);
		this.view.drag(this.view.snapped(this.px(clamped, p)));
	}

	surface = modifier((element: HTMLElement) => {
		this.family =
			getComputedStyle(element).fontFamily || 'sans-serif';
		const view = this.view;
		const observer = new ResizeObserver(([entry]) => {
			const box = entry?.contentRect;
			if (box)
				view.resize({
					width: box.width,
					height: box.height,
				});
		});
		observer.observe(element);

		const pointers = new Map<number, { x: number; y: number }>();
		let mode: 'none' | 'trace' | 'pan' | 'pinch' = 'none';
		let travelled = 0;
		let start = { x: 0, y: 0 };
		let last = { x: 0, y: 0, t: 0 };
		let velocity = { x: 0, y: 0 };
		let pinch:
			| { centre: { x: number; y: number }; distance: number }
			| undefined;

		const local = (event: PointerEvent) => {
			const box = element.getBoundingClientRect();
			return {
				x: event.clientX - box.left,
				y: event.clientY - box.top,
			};
		};
		const twoFinger = () => {
			const [a, b] = [...pointers.values()];
			return {
				centre: {
					x: (a!.x + b!.x) / 2,
					y: (a!.y + b!.y) / 2,
				},
				distance: Math.max(
					Math.hypot(a!.x - b!.x, a!.y - b!.y),
					1,
				),
			};
		};
		const startPan = (
			point: { x: number; y: number },
			t: number,
		) => {
			mode = 'pan';
			start = point;
			last = { ...point, t };
			velocity = { x: 0, y: 0 };
		};

		const down = (event: PointerEvent) => {
			if (event.pointerType === 'mouse' && event.button !== 0)
				return;
			const point = local(event);
			pointers.set(event.pointerId, point);
			capture(element, event.pointerId);
			view.stopMotion();
			if (pointers.size === 1) {
				travelled = 0;
				if (this.grabsTrace(point)) {
					mode = 'trace';
					this.traceTo(point.x);
				} else {
					startPan(point, event.timeStamp);
				}
			} else if (pointers.size === 2 && mode !== 'trace') {
				mode = 'pinch';
				travelled = Infinity;
				pinch = twoFinger();
			}
		};
		const move = (event: PointerEvent) => {
			if (!pointers.has(event.pointerId)) return;
			const point = local(event);
			pointers.set(event.pointerId, point);
			if (mode === 'trace') {
				this.traceTo(point.x);
			} else if (mode === 'pan') {
				const dx = point.x - last.x;
				const dy = point.y - last.y;
				travelled = Math.max(
					travelled,
					Math.hypot(
						point.x - start.x,
						point.y - start.y,
					),
				);
				if (travelled < tapSlop) return;
				view.pan(dx, dy);
				const dt =
					Math.max(event.timeStamp - last.t, 1) /
					1000;
				velocity = {
					x: velocity.x * 0.2 + (dx / dt) * 0.8,
					y: velocity.y * 0.2 + (dy / dt) * 0.8,
				};
				last = { ...point, t: event.timeStamp };
			} else if (
				mode === 'pinch' &&
				pinch &&
				pointers.size === 2
			) {
				const now = twoFinger();
				view.zoom(
					pinch.distance / now.distance,
					pinch.centre,
					{
						x:
							now.centre.x -
							pinch.centre.x,
						y:
							now.centre.y -
							pinch.centre.y,
					},
				);
				pinch = now;
			}
		};
		const up = (event: PointerEvent) => {
			if (!pointers.delete(event.pointerId)) return;
			if (mode === 'pinch') {
				const rest = [...pointers.values()][0];
				if (rest) startPan(rest, event.timeStamp);
				else mode = 'none';
				travelled = Infinity;
				pinch = undefined;
				return;
			}
			if (pointers.size > 0) return;
			if (mode === 'pan') {
				if (
					travelled < tapSlop &&
					event.type === 'pointerup'
				) {
					const p = view.plane;
					if (p)
						view.setTrace(
							view.snapped(
								this.px(
									start.x,
									p,
								),
							),
							true,
						);
				} else if (event.timeStamp - last.t < 80) {
					view.coast(velocity);
				}
			}
			mode = 'none';
		};
		const wheel = (event: WheelEvent) => {
			event.preventDefault();
			const box = element.getBoundingClientRect();
			const unit =
				event.deltaMode === 1
					? 16
					: event.deltaMode === 2
						? box.height
						: 1;
			const factor = Math.exp(
				event.deltaY *
					unit *
					(event.ctrlKey ? 0.01 : 0.002),
			);
			view.stopMotion();
			view.zoom(factor, {
				x: event.clientX - box.left,
				y: event.clientY - box.top,
			});
		};

		element.addEventListener('pointerdown', down);
		element.addEventListener('pointermove', move);
		element.addEventListener('pointerup', up);
		element.addEventListener('pointercancel', up);
		element.addEventListener('wheel', wheel, { passive: false });
		return () => {
			observer.disconnect();
			element.removeEventListener('pointerdown', down);
			element.removeEventListener('pointermove', move);
			element.removeEventListener('pointerup', up);
			element.removeEventListener('pointercancel', up);
			element.removeEventListener('wheel', wheel);
		};
	});

	<template>
		<div class="graph-plot" {{this.surface}} ...attributes>
			<svg
				class="graph-plot-svg"
				width={{this.width}}
				height={{this.height}}
				viewBox={{this.viewBox}}
				role="img"
				aria-label="Graph"
			>
				<path
					class="graph-grid-minor"
					d={{this.frame.minor}}
				/>
				<path
					class="graph-grid-major"
					d={{this.frame.major}}
				/>
				<path
					class="graph-axes"
					d={{this.frame.axes}}
				/>
				<g class="graph-labels">
					{{#each
						this.frame.labels key="key"
						as |label|
					}}
						<text
							x={{label.x}}
							y={{label.y}}
						>{{label.text}}</text>
					{{/each}}
				</g>
				{{#each this.frame.curves key="key" as |curve|}}
					{{#if curve.region}}
						<path
							class="graph-region"
							d={{curve.region}}
							fill={{curve.stroke}}
						/>
					{{/if}}
					<path
						class="graph-curve"
						d={{curve.line}}
						stroke={{curve.stroke}}
						stroke-opacity={{curve.opacity}}
						stroke-dasharray={{curve.dash}}
						stroke-dashoffset={{curve.offset}}
					/>
				{{/each}}
				{{#if this.trace}}
					<path
						class="graph-trace"
						d={{this.trace.line}}
					/>
					{{#each
						this.trace.tags key="key"
						as |t|
					}}
						<path
							class="graph-guide"
							d={{t.guide}}
							stroke={{t.stroke}}
						/>
						{{#if t.dot}}
							<circle
								class="graph-dot"
								cx={{t.dot.x}}
								cy={{t.dot.y}}
								r="5"
								fill={{t.fill}}
							/>
						{{/if}}
					{{/each}}
					{{#each
						this.trace.tags key="key"
						as |t|
					}}
						<g
							class="graph-tag"
							transform="translate({{t.x}} {{t.y}})"
						>
							<rect
								width={{t.width}}
								height={{tag.height}}
								fill={{t.fill}}
							/>
							<text
								x="6"
								y={{half
									tag.height
								}}
								fill={{t.ink}}
							>{{t.text}}</text>
						</g>
					{{/each}}
					{{#if this.trace.xTag}}
						<g
							class="graph-tag graph-tag--x"
							transform="translate({{this.trace.xTag.x}} {{this.trace.xTag.y}})"
						>
							<rect
								width={{this.trace.xTag.width}}
								height={{tag.height}}
							/>
							<text
								x="6"
								y={{half
									tag.height
								}}
							>{{this.trace.xTag.text}}</text>
						</g>
					{{/if}}
				{{/if}}
			</svg>
		</div>
	</template>
}

const half = (value: number) => value / 2;
