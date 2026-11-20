import Component from '@glimmer/component';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import { hex, rgb255 } from 'delphicanon/lib/colour';
import {
	channels,
	spaceNames,
	type SolidSpace,
} from 'delphicanon/lib/colour-space';
import {
	colourOf,
	letters,
	stops,
	sweep,
	wrapped,
} from 'delphitools-v2/components/tools/colour-converter/notation';

interface RibbonsSignature {
	Args: {
		space: SolidSpace;
		values: number[];
		lit?: number;
		animated: boolean;
		onPick: (
			space: SolidSpace,
			values: number[],
			animated: boolean,
		) => void;
	};
}

const keySteps: Record<string, number> = {
	ArrowRight: 1,
	ArrowUp: 1,
	ArrowLeft: -1,
	ArrowDown: -1,
	PageUp: 10,
	PageDown: -10,
};

export default class Ribbons extends Component<RibbonsSignature> {
	get name() {
		return spaceNames[this.args.space];
	}

	get bands() {
		const { space, values, lit } = this.args;
		const ink = hex(colourOf(values, space));
		return channels(space).map((channel, index) => {
			const gradient = sweep(values, space, index)
				.map(({ colour, inGamut }, step) => {
					const [r, g, b] = rgb255(colour);
					const alpha = inGamut ? 1 : 0.22;
					return `rgb(${r} ${g} ${b} / ${alpha}) ${(step * 100) / stops}%`;
				})
				.join(', ');
			let value = values[index]!;
			if (channel.min === 0 && channel.max === 360)
				value = wrapped(value);
			const share = Math.min(
				Math.max(
					(value - channel.min) /
						(channel.max - channel.min),
					0,
				),
				1,
			);
			return {
				index,
				letter: letters[space][index],
				lit: index === lit,
				label: `${this.name} ${channel.name}`,
				min: channel.min,
				max: channel.max,
				now: value.toFixed(channel.decimals),
				style: htmlSafe(
					`background-image: linear-gradient(to right, ${gradient})`,
				),
				tick: htmlSafe(
					`inset-inline-start: ${share * 100}%; background: ${ink}`,
				),
			};
		});
	}

	#setChannel(index: number, value: number, animated: boolean) {
		const channel = channels(this.args.space)[index]!;
		const next = [...this.args.values];
		next[index] = Math.min(
			Math.max(value, channel.min),
			channel.max,
		);
		this.args.onPick(this.args.space, next, animated);
	}

	#pickAt(
		index: number,
		element: HTMLElement,
		x: number,
		animated: boolean,
	) {
		const box = element.getBoundingClientRect();
		const share = Math.min(
			Math.max((x - box.left) / box.width, 0),
			1,
		);
		const { min, max } = channels(this.args.space)[index]!;
		this.#setChannel(index, min + (max - min) * share, animated);
	}

	press = modifier((ribbon: HTMLElement, [index]: [number]) => {
		const move = (event: PointerEvent) => {
			if (ribbon.hasPointerCapture(event.pointerId))
				this.#pickAt(
					index,
					ribbon,
					event.clientX,
					false,
				);
		};
		const down = (event: PointerEvent) => {
			ribbon.setPointerCapture(event.pointerId);
			this.#pickAt(index, ribbon, event.clientX, true);
		};
		ribbon.addEventListener('pointerdown', down);
		ribbon.addEventListener('pointermove', move);
		return () => {
			ribbon.removeEventListener('pointerdown', down);
			ribbon.removeEventListener('pointermove', move);
		};
	});

	key = (index: number, event: KeyboardEvent) => {
		const { min, max } = channels(this.args.space)[index]!;
		const value = this.args.values[index]!;
		const steps = keySteps[event.key];
		if (steps !== undefined)
			this.#setChannel(
				index,
				value + ((max - min) / 100) * steps,
				true,
			);
		else if (event.key === 'Home')
			this.#setChannel(index, min, true);
		else if (event.key === 'End')
			this.#setChannel(index, max, true);
		else return;
		event.preventDefault();
	};

	<template>
		<div
			class="cc-ribbons {{if @animated 'cc-ribbons--eases'}}"
			role="group"
			aria-label={{this.name}}
		>
			{{#each this.bands key="index" as |band|}}
				<span
					class="cc-ribbon-letter
						{{if
							band.lit
							'cc-ribbon-letter--lit'
						}}"
					aria-hidden="true"
				>{{band.letter}}</span>
				<span
					class="cc-ribbon"
					role="slider"
					tabindex="0"
					aria-label={{band.label}}
					aria-valuemin={{band.min}}
					aria-valuemax={{band.max}}
					aria-valuenow={{band.now}}
					style={{band.style}}
					{{this.press band.index}}
					{{on
						"keydown"
						(fn this.key band.index)
					}}
				><span
						class="cc-ribbon-tick"
						style={{band.tick}}
					></span></span>
			{{/each}}
		</div>
	</template>
}
