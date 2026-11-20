import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import CanonLoupe from 'delphicanon/components/canon-loupe';
import { frame, type LoupeSides } from 'delphicanon/lib/loupe';
import {
	pixelAt,
	pixelsAround,
	type Still,
} from 'delphitools-v2/components/substrata/colour/still';
import type { RingColour } from 'delphitools-v2/lib/substrata/colour-ring/model';

interface Signature {
	Args: {
		still: Still;
		onPick: (colour: RingColour) => void;
	};
}

const SIDE = 120;
const GAP = 28;
const ACROSS = 15;

export default class Eyedropper extends Component<Signature> {
	@tracked loupe: {
		style: ReturnType<typeof htmlSafe>;
		pixels: ImageData;
		colour: [number, number, number];
	} | null = null;
	#sides: LoupeSides | null = null;

	track = modifier((cover: HTMLElement) => {
		let id: number | null = null;
		const local = (e: PointerEvent) => {
			const box = cover.getBoundingClientRect();
			const editor =
				cover.parentElement?.getBoundingClientRect() ??
				box;
			return {
				x: e.clientX - box.left,
				y: e.clientY - box.top,
				inEditor: {
					x: e.clientX - editor.left,
					y: e.clientY - editor.top,
				},
				size: { width: box.width, height: box.height },
			};
		};
		const show = (e: PointerEvent) => {
			const at = local(e);
			const colour = pixelAt(
				this.args.still,
				at.inEditor.x,
				at.inEditor.y,
			);
			if (!colour) return;
			const placed = frame(
				at,
				SIDE,
				GAP,
				at.size,
				8,
				this.#sides ?? undefined,
			);
			this.#sides ??= {
				left: placed.x + SIDE / 2 < at.x,
				above: placed.y + SIDE / 2 < at.y,
			};
			this.loupe = {
				style: htmlSafe(
					`left: ${placed.x}px; top: ${placed.y}px`,
				),
				pixels: pixelsAround(
					this.args.still,
					at.inEditor.x,
					at.inEditor.y,
					ACROSS,
				),
				colour: [colour.r, colour.g, colour.b],
			};
		};
		const down = (e: PointerEvent) => {
			if (e.button !== 0) return;
			id = e.pointerId;
			cover.setPointerCapture(id);
			show(e);
		};
		const move = (e: PointerEvent) => {
			if (e.pointerId === id) show(e);
		};
		const up = (e: PointerEvent) => {
			if (e.pointerId !== id) return;
			id = null;
			this.loupe = null;
			this.#sides = null;
			if (e.type === 'pointercancel') return;
			const at = local(e);
			const colour = pixelAt(
				this.args.still,
				at.inEditor.x,
				at.inEditor.y,
			);
			if (colour) this.args.onPick(colour);
		};
		cover.addEventListener('pointerdown', down);
		cover.addEventListener('pointermove', move);
		cover.addEventListener('pointerup', up);
		cover.addEventListener('pointercancel', up);
		return () => {
			cover.removeEventListener('pointerdown', down);
			cover.removeEventListener('pointermove', move);
			cover.removeEventListener('pointerup', up);
			cover.removeEventListener('pointercancel', up);
		};
	});

	<template>
		<div class="sub-eyedropper" {{this.track}}>
			{{#if this.loupe}}
				<div
					class="sub-eyedropper-loupe"
					style={{this.loupe.style}}
				><CanonLoupe
						@pixels={{this.loupe.pixels}}
						@colour={{this.loupe.colour}}
					/></div>
			{{/if}}
		</div>
	</template>
}
