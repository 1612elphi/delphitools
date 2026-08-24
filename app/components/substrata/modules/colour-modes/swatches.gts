import Component from '@glimmer/component';
import { modifier } from 'ember-modifier';
import { htmlSafe } from '@ember/template';
import { rgbToHex } from 'delphitools-v2/lib/substrata/colour-convert';
import { hslToRgb } from 'delphitools-v2/lib/substrata/colour-hsv';
import {
	setRgb,
	type ColourSnapshot,
} from 'delphitools-v2/lib/substrata/colour-store';

const CELL = 24;
const ROWS = 11;
const HUE_COLS = 36;
const DRAG_SLOP = 4;

const LS = [96, 89, 80, 70, 60, 50, 42, 34, 26, 18, 11];
const SS = [30, 42, 52, 58, 60, 60, 58, 55, 50, 45, 38];

interface Cell {
	i: number;
	h: number;
	s: number;
	l: number;
	hex: string;
}

const CELLS: Cell[] = (() => {
	const out: Cell[] = [];
	const push = (h: number, s: number, l: number) => {
		out.push({
			i: out.length,
			h,
			s,
			l,
			hex: rgbToHex(hslToRgb({ h, s, l })),
		});
	};
	for (let r = 0; r < ROWS; r++) push(0, 0, (LS[r] as number) / 100);
	for (let c = 0; c < HUE_COLS; c++) {
		const h = c * 10;
		for (let r = 0; r < ROWS; r++)
			push(
				h,
				(SS[r] as number) / 100,
				(LS[r] as number) / 100,
			);
	}
	return out;
})();

function cellStyle(hex: string) {
	return htmlSafe(`background: ${hex}`);
}

export interface SwatchesModeSignature {
	Args: { colour: ColourSnapshot };
}

export default class SwatchesMode extends Component<SwatchesModeSignature> {
	cells = CELLS;

	// avoid tracked scroll resets
	#openingHue = this.args.colour.hsv.h;

	#wrap: HTMLElement | null = null;
	#drag = { down: false, moved: false, sx: 0, sy: 0, sl: 0, st: 0 };

	isSelected = (hex: string) => hex === this.args.colour.hex;

	#pick(clientX: number, clientY: number) {
		const hit = document.elementFromPoint(clientX, clientY);
		const cellEl =
			hit instanceof HTMLElement
				? hit.closest<HTMLElement>('[data-sw]')
				: null;
		if (!cellEl) return;
		const cell = CELLS[Number(cellEl.dataset['sw'])];
		if (cell) setRgb(hslToRgb({ h: cell.h, s: cell.s, l: cell.l }));
	}

	onPointerDown = (event: PointerEvent) => {
		const el = this.#wrap;
		if (!el) return;
		this.#drag = {
			down: true,
			moved: false,
			sx: event.clientX,
			sy: event.clientY,
			sl: el.scrollLeft,
			st: el.scrollTop,
		};
		el.setPointerCapture(event.pointerId);
	};

	onPointerMove = (event: PointerEvent) => {
		const d = this.#drag;
		const el = this.#wrap;
		if (!d.down || !el) return;
		if (
			Math.abs(event.clientX - d.sx) +
				Math.abs(event.clientY - d.sy) >
			DRAG_SLOP
		)
			d.moved = true;
		el.scrollLeft = d.sl - (event.clientX - d.sx);
		el.scrollTop = d.st - (event.clientY - d.sy);
	};

	onPointerUp = (event: PointerEvent) => {
		const d = this.#drag;
		d.down = false;
		this.#wrap?.releasePointerCapture?.(event.pointerId);
		if (!d.moved) this.#pick(event.clientX, event.clientY);
	};

	wall = modifier((element: HTMLElement) => {
		this.#wrap = element;
		const col = Math.round(this.#openingHue / 10) % HUE_COLS;
		element.scrollLeft = (1 + col) * CELL - element.clientWidth / 2;

		element.addEventListener('pointerdown', this.onPointerDown);
		element.addEventListener('pointermove', this.onPointerMove);
		element.addEventListener('pointerup', this.onPointerUp);
		// cancelled drags clear state
		element.addEventListener('pointercancel', this.onPointerUp);
		return () => {
			this.#wrap = null;
			element.removeEventListener(
				'pointerdown',
				this.onPointerDown,
			);
			element.removeEventListener(
				'pointermove',
				this.onPointerMove,
			);
			element.removeEventListener(
				'pointerup',
				this.onPointerUp,
			);
			element.removeEventListener(
				'pointercancel',
				this.onPointerUp,
			);
		};
	});

	<template>
			<div
			class="sub-cp-wall"
			role="group"
			aria-label="Colour swatch wall"
			{{this.wall}}
		>
			<div class="sub-cp-wall-grid">
				{{#each this.cells key="i" as |cell|}}
					<div
						data-sw={{cell.i}}
						class="sub-cp-swcell
							{{if
								(this.isSelected
									cell.hex
								)
								'is-selected'
							}}"
						style={{cellStyle cell.hex}}
					></div>
				{{/each}}
			</div>
		</div>
	</template>
}
