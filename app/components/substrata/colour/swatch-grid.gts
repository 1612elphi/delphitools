import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import {
	FONT,
	readTheme,
	type RingTheme,
} from 'delphitools-v2/components/substrata/colour/ring-paint';
import type { Swatch } from 'delphitools-v2/lib/substrata/colour-ring/geometry';
import { paint } from 'delphitools-v2/lib/substrata/colour-ring/library';
import { shelf } from 'delphitools-v2/lib/substrata/colour-ring/model';

export interface GridColumn {
	label: string | null;
	swatches: Swatch[];
}

interface Laid {
	x: number;
	width: number;
	label: string | null;
	swatches: Swatch[];
}

interface Signature {
	Args: {
		columns: GridColumn[];
		flows: boolean;
		picked: string | null;
		label: string;
		onPick: (swatch: Swatch) => void;
	};
}

const SWATCH_WIDTH = 44;
const HEADING_WIDTH = 22;
const TALLEST = 56;
const FLOW_HEIGHT = 44;
const LABELLED = 16;

export default class SwatchGrid extends Component<Signature> {
	@tracked announce = '';
	#laid: Laid[] = [];
	#swatchHeight = 0;
	#height = 0;
	#scroller: HTMLElement | null = null;
	#canvas: HTMLCanvasElement | null = null;
	#theme: RingTheme | null = null;
	#cursor: { column: number; row: number } | null = null;
	#queued = 0;

	lay() {
		const height = Math.max(1, this.#height);
		const { columns, flows } = this.args;
		const deepest = Math.max(
			1,
			...columns.map((c) => c.swatches.length),
		);
		this.#swatchHeight = flows
			? FLOW_HEIGHT
			: Math.min(TALLEST, height / deepest);
		const rows = flows
			? Math.max(1, Math.floor(height / this.#swatchHeight))
			: Infinity;
		let x = 0;
		const laid: Laid[] = [];
		for (const column of columns) {
			if (column.label !== null) {
				laid.push({
					x,
					width: HEADING_WIDTH,
					label: column.label,
					swatches: [],
				});
				x += HEADING_WIDTH;
			}
			const chunk = Math.min(
				rows,
				Math.max(column.swatches.length, 1),
			);
			for (
				let start = 0;
				start < column.swatches.length;
				start += chunk
			) {
				laid.push({
					x,
					width: SWATCH_WIDTH,
					label: null,
					swatches: column.swatches.slice(
						start,
						start + chunk,
					),
				});
				x += SWATCH_WIDTH;
			}
		}
		this.#laid = laid;
		const spacer = this.#scroller?.querySelector<HTMLElement>(
			'.sub-ct-grid-spacer',
		);
		if (spacer) spacer.style.inlineSize = `${x}px`;
	}

	draw = () => {
		if (this.#queued) return;
		this.#queued = requestAnimationFrame(() => {
			this.#queued = 0;
			this.render();
		});
	};

	render() {
		const canvas = this.#canvas;
		const scroller = this.#scroller;
		const theme = this.#theme;
		const ctx = canvas?.getContext('2d');
		if (!canvas || !scroller || !theme || !ctx) return;
		const dpr = window.devicePixelRatio || 1;
		const width = scroller.clientWidth;
		const height = scroller.clientHeight;
		if (canvas.width !== Math.round(width * dpr))
			canvas.width = Math.round(width * dpr);
		if (canvas.height !== Math.round(height * dpr))
			canvas.height = Math.round(height * dpr);
		canvas.style.inlineSize = `${width}px`;
		canvas.style.blockSize = `${height}px`;
		const left = scroller.scrollLeft;
		canvas.style.transform = `translateX(${left}px)`;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, width, height);
		ctx.translate(-left, 0);
		const h = this.#swatchHeight;
		this.#laid.forEach((column, index) => {
			if (
				column.x + column.width <= left ||
				column.x >= left + width
			)
				return;
			if (column.label !== null) {
				ctx.save();
				ctx.font = FONT.heading(theme);
				ctx.fillStyle = theme.mutedForeground;
				ctx.textBaseline = 'middle';
				const w = ctx.measureText(column.label).width;
				ctx.translate(
					column.x + column.width / 2,
					6 + w,
				);
				ctx.rotate(-Math.PI / 2);
				ctx.fillText(column.label, 0, 0);
				ctx.restore();
				return;
			}
			column.swatches.forEach((swatch, row) => {
				const y = row * h;
				const colours = paint(swatch.hex);
				ctx.fillStyle = colours.fill;
				ctx.fillRect(
					column.x + 0.5,
					y + 0.5,
					column.width - 1,
					h - 1,
				);
				if (this.args.picked === swatch.hex) {
					ctx.strokeStyle = colours.ink;
					ctx.lineWidth = 2.5;
					ctx.strokeRect(
						column.x + 3,
						y + 3,
						column.width - 6,
						h - 6,
					);
				}
				const cursor = this.#cursor;
				if (
					cursor &&
					cursor.column === index &&
					cursor.row === row
				) {
					ctx.strokeStyle = theme.foreground;
					ctx.lineWidth = 2;
					ctx.strokeRect(
						column.x + 1.5,
						y + 1.5,
						column.width - 3,
						h - 3,
					);
				}
				const starred = shelf.isStarred(swatch.hex);
				const code =
					h >= LABELLED && swatch.code
						? swatch.code
						: null;
				const text = code
					? starred
						? `★ ${code}`
						: code
					: starred
						? '★'
						: null;
				if (!text) return;
				ctx.font = FONT.code(theme);
				ctx.fillStyle = colours.ink;
				ctx.textBaseline = 'bottom';
				ctx.fillText(text, column.x + 4.5, y + h - 3.5);
			});
		});
	}

	swatchAt(clientX: number, clientY: number): Swatch | null {
		const scroller = this.#scroller;
		if (!scroller || this.#swatchHeight <= 0) return null;
		const box = scroller.getBoundingClientRect();
		const x = clientX - box.left + scroller.scrollLeft;
		const y = clientY - box.top;
		const column = this.#laid.find(
			(c) => x >= c.x && x < c.x + c.width,
		);
		return (
			column?.swatches[Math.floor(y / this.#swatchHeight)] ??
			null
		);
	}

	setup = modifier(
		(
			scroller: HTMLElement,
			[columns, flows, picked]: [
				GridColumn[],
				boolean,
				string | null,
			],
		) => {
			void columns;
			void flows;
			void picked;
			this.#scroller = scroller;
			this.#canvas = scroller.querySelector('canvas');
			this.#theme = readTheme(scroller);
			this.#height = scroller.clientHeight;
			this.lay();
			this.draw();
		},
	);

	gestures = modifier((scroller: HTMLElement) => {
		let start: { x: number; left: number; id: number } | null =
			null;
		let moved = false;
		let held = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const down = (e: PointerEvent) => {
			if (e.button !== 0) return;
			start = {
				x: e.clientX,
				left: scroller.scrollLeft,
				id: e.pointerId,
			};
			moved = false;
			held = false;
			const { clientX, clientY } = e;
			timer = setTimeout(() => {
				const swatch = this.swatchAt(clientX, clientY);
				if (!swatch || moved) return;
				held = true;
				shelf.toggleStar(swatch.hex);
				this.draw();
			}, 450);
		};
		const move = (e: PointerEvent) => {
			if (!start || e.pointerId !== start.id) return;
			if (Math.abs(e.clientX - start.x) > 6) {
				moved = true;
				clearTimeout(timer);
			}
			if (moved && e.pointerType === 'mouse')
				scroller.scrollLeft =
					start.left - (e.clientX - start.x);
		};
		const up = (e: PointerEvent) => {
			if (!start || e.pointerId !== start.id) return;
			clearTimeout(timer);
			start = null;
			if (moved || held || e.type === 'pointercancel') return;
			const swatch = this.swatchAt(e.clientX, e.clientY);
			if (swatch) this.args.onPick(swatch);
		};
		const ro = new ResizeObserver(() => {
			this.#height = scroller.clientHeight;
			this.lay();
			this.draw();
		});
		ro.observe(scroller);
		const themes = new MutationObserver(() => {
			this.#theme = readTheme(scroller);
			this.draw();
		});
		themes.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['class'],
		});
		void document.fonts?.ready.then(this.draw);
		scroller.addEventListener('pointerdown', down);
		scroller.addEventListener('pointermove', move);
		scroller.addEventListener('pointerup', up);
		scroller.addEventListener('pointercancel', up);
		scroller.addEventListener('scroll', this.draw, {
			passive: true,
		});
		return () => {
			clearTimeout(timer);
			cancelAnimationFrame(this.#queued);
			ro.disconnect();
			themes.disconnect();
			scroller.removeEventListener('pointerdown', down);
			scroller.removeEventListener('pointermove', move);
			scroller.removeEventListener('pointerup', up);
			scroller.removeEventListener('pointercancel', up);
			scroller.removeEventListener('scroll', this.draw);
		};
	});

	key = (e: KeyboardEvent) => {
		const filled = this.#laid
			.map((c, i) => [c, i] as const)
			.filter(([c]) => c.swatches.length > 0)
			.map(([, i]) => i);
		if (!filled.length) return;
		const at = this.#cursor;
		const swatch = at && this.#laid[at.column]?.swatches[at.row];
		if ((e.key === 'Enter' || e.key === ' ') && swatch) {
			e.preventDefault();
			this.args.onPick(swatch);
			return;
		}
		const move = {
			ArrowRight: [1, 0],
			ArrowLeft: [-1, 0],
			ArrowDown: [0, 1],
			ArrowUp: [0, -1],
		}[e.key];
		if (!move) return;
		e.preventDefault();
		let next = at ?? { column: filled[0]!, row: 0 };
		if (at) {
			const place = filled.indexOf(at.column);
			const column =
				filled[
					Math.min(
						filled.length - 1,
						Math.max(0, place + move[0]!),
					)
				]!;
			const depth = this.#laid[column]!.swatches.length;
			next = {
				column,
				row: Math.min(
					depth - 1,
					Math.max(0, at.row + move[1]!),
				),
			};
		}
		this.#cursor = next;
		const shown = this.#laid[next.column]!;
		const scroller = this.#scroller;
		if (scroller) {
			if (shown.x < scroller.scrollLeft)
				scroller.scrollLeft = shown.x;
			else if (
				shown.x + shown.width >
				scroller.scrollLeft + scroller.clientWidth
			)
				scroller.scrollLeft =
					shown.x +
					shown.width -
					scroller.clientWidth;
		}
		const s = shown.swatches[next.row]!;
		this.announce = s.name ? `${s.code} ${s.name}` : s.hex;
		this.draw();
	};

	blurred = () => {
		this.#cursor = null;
		this.draw();
	};

	<template>
		<div
			class="sub-ct-grid"
			role="application"
			tabindex="0"
			aria-label={{@label}}
			{{this.setup @columns @flows @picked}}
			{{this.gestures}}
			{{on "keydown" this.key}}
			{{on "blur" this.blurred}}
		>
			<canvas
				class="sub-ct-grid-canvas"
				aria-hidden="true"
			></canvas>
			<div class="sub-ct-grid-spacer"></div>
			<output
				class="sub-ring-live"
				aria-live="polite"
			>{{this.announce}}</output>
		</div>
	</template>
}
