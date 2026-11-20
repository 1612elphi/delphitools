import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import { repeatTiming } from 'delphicanon/components/canon-button';
import press from 'delphicanon/modifiers/canon-press';
import { IconSvg } from 'delphitools-v2/components/icon';
import {
	arrangement,
	role,
	sideBySide,
	spoken,
	typeHeight,
} from 'delphitools-v2/components/tools/sci-calc/entry';

export interface KeypadSignature {
	Args: { onPress: (key: string) => void };
}

const track = (index: number) => (index < 4 ? index + 1 : index + 2);

const repeats = modifier(
	(
		button: HTMLButtonElement,
		[key, onPress]: [string, (key: string) => void],
	) => {
		if (key !== '⌫') return;
		let timer: number | undefined;
		let held = false;
		let didRepeat = false;
		const schedule = (seconds: number, count: number) => {
			timer = window.setTimeout(() => {
				if (!held) return;
				didRepeat = true;
				onPress(key);
				schedule(
					count < 10
						? repeatTiming.interval
						: repeatTiming.fast,
					count + 1,
				);
			}, seconds * 1000);
		};
		const hold = (event: PointerEvent) => {
			if (event.button !== 0) return;
			held = true;
			didRepeat = false;
			window.clearTimeout(timer);
			schedule(repeatTiming.delay, 0);
		};
		const letGo = () => {
			held = false;
			window.clearTimeout(timer);
		};
		const click = (event: MouseEvent) => {
			if (!didRepeat) return;
			didRepeat = false;
			event.stopImmediatePropagation();
		};
		const ends = [
			'pointerup',
			'pointerleave',
			'pointercancel',
		] as const;
		button.addEventListener('pointerdown', hold);
		button.addEventListener('click', click, { capture: true });
		ends.forEach((type) => button.addEventListener(type, letGo));
		return () => {
			letGo();
			button.removeEventListener('pointerdown', hold);
			button.removeEventListener('click', click, {
				capture: true,
			});
			ends.forEach((type) =>
				button.removeEventListener(type, letGo),
			);
		};
	},
);

export default class Keypad extends Component<KeypadSignature> {
	@tracked wide = false;
	@tracked scale = 1;

	measure = modifier((element: HTMLElement) => {
		const run = () => {
			const { clientWidth: width, clientHeight: height } =
				element;
			if (!width) return;
			const wide = sideBySide(width, height);
			const rows = wide ? 5 : 9;
			const keyHeight = (height - rows - 1) / rows;
			this.wide = wide;
			this.scale = Math.min(
				Math.max(keyHeight / typeHeight, 0.85),
				1.5,
			);
		};
		const size = new ResizeObserver(run);
		size.observe(element);
		return () => size.disconnect();
	});

	get keys() {
		return arrangement(this.wide).map((placed) => {
			const row = this.wide
				? placed.row + 1
				: track(placed.row);
			const column = this.wide
				? track(placed.column)
				: placed.column + 1;
			return {
				id: placed.key,
				role: role(placed.key),
				label: spoken(placed.key),
				named: spoken(placed.key) !== placed.key,
				backspace: placed.key === '⌫',
				style: htmlSafe(
					`grid-area: ${row} / ${column} / span ${placed.rows} / span ${placed.columns}`,
				),
			};
		});
	}

	get style() {
		return htmlSafe(`--sci-scale: ${this.scale}`);
	}

	<template>
		<div
			class="sci-keypad {{if this.wide 'sci-keypad--wide'}}"
			style={{this.style}}
			{{this.measure}}
		>
			{{#each this.keys key="id" as |key|}}
				<button
					type="button"
					class="sci-key sci-key--{{key.role}}"
					style={{key.style}}
					data-key={{key.id}}
					aria-label={{if key.named key.label}}
					{{press}}
					{{repeats key.id @onPress}}
					{{on "click" (fn @onPress key.id)}}
				>
					{{#if key.backspace}}
						<IconSvg @name="delete" />
					{{else}}
						{{key.id}}
					{{/if}}
				</button>
			{{/each}}
		</div>
	</template>
}
