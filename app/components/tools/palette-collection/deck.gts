import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import { parseHex, takesBlackInk } from 'delphicanon/lib/colour';
import type CanonToastService from 'delphicanon/services/canon-toast';
import { getColourName } from 'delphitools-v2/lib/colour-names';
import type { CuratedPalette } from 'delphitools-v2/lib/palette-collection';
import { fanIn } from './fan';

interface DeckSignature {
	Args: {
		palette?: CuratedPalette;
		detail?: string;
		emptyTitle: string;
		format: (hex: string) => string;
	};
}

const margin = { top: 14, left: 16, bottom: 12, right: 16 };

const clamp = (value: number, low: number, high: number) =>
	Math.min(Math.max(value, low), high);

export default class Deck extends Component<DeckSignature> {
	@service('canon-toast') declare toast: CanonToastService;

	@tracked room?: { width: number; height: number };

	measure = modifier((element: HTMLElement) => {
		const observer = new ResizeObserver(([entry]) => {
			const box = entry?.contentRect;
			if (box)
				this.room = {
					width:
						box.width -
						margin.left -
						margin.right,
					height:
						box.height -
						margin.top -
						margin.bottom,
				};
		});
		observer.observe(element);
		return () => observer.disconnect();
	});

	get key() {
		return this.args.palette?.id ?? '';
	}

	get colours() {
		return this.args.palette?.colors ?? [];
	}

	get fan() {
		const { room } = this;
		if (!room || room.width <= 0 || room.height <= 0)
			return undefined;
		return fanIn(room.width, room.height, this.colours.length + 1);
	}

	get fanStyle() {
		const { fan } = this;
		if (!fan) return undefined;
		const len = fan.length + fan.tail;
		const text = Math.min(
			len - fan.tail - fan.width * 0.7,
			len * 0.72,
		);
		return htmlSafe(
			[
				`inset-block-start: ${margin.top + fan.y}px`,
				`inset-inline-start: ${margin.left + fan.x}px`,
				`--pc-len: ${fan.length}px`,
				`--pc-chip: ${fan.width}px`,
				`--pc-tail: ${fan.tail}px`,
				`--pc-text-top: ${fan.width * 0.3}px`,
				`--pc-text-len: ${Math.max(text, 0)}px`,
				`--pc-value-size: ${clamp(fan.width * 0.21, 9, 22)}px`,
				`--pc-name-size: ${clamp(fan.width * 0.17, 8, 18)}px`,
				`--pc-title-size: ${clamp(fan.width * 0.3, 12, 34)}px`,
				`--pc-detail-size: ${clamp(fan.width * 0.17, 9, 18)}px`,
			].join('; '),
		);
	}

	get twoLines() {
		return (this.fan?.width ?? 0) >= 34;
	}

	get chips() {
		const angles = this.fan?.angles ?? [];
		const { colours } = this;
		return colours.map((code, i) => {
			const black = takesBlackInk(parseHex(code)!);
			const value = this.args.format(code);
			const name = getColourName(code);
			return {
				key: `${this.key}-${i}`,
				hex: code.toUpperCase(),
				value,
				name,
				label: `${name} ${value}`,
				style: htmlSafe(
					`--pc-angle: ${angles[i]}deg; --pc-delay: ${i * 35}ms; z-index: ${colours.length - i}`,
				),
				face: htmlSafe(
					`background: ${code}; color: ${black ? 'black' : 'white'}`,
				),
			};
		});
	}

	get coverStyle() {
		return htmlSafe(
			`--pc-angle: ${this.fan?.angles.at(-1)}deg; z-index: ${this.colours.length + 1}`,
		);
	}

	copy = (value: string) => void this.toast.copy(value);

	<template>
		<div class="pc-deck" {{this.measure}}>
			{{#if this.fan}}
				<div
					class="pc-deck-fan"
					style={{this.fanStyle}}
				>
					{{#each this.chips key="key" as |chip|}}
						<button
							type="button"
							class="pc-chip"
							style={{chip.style}}
							aria-label={{chip.label}}
							data-hex={{chip.hex}}
							{{on
								"click"
								(fn
									this.copy
									chip.value
								)
							}}
						><span
								class="pc-chip-face"
								style={{chip.face}}
							><span
									class="pc-chip-text"
								><span
										class="pc-chip-hex"
									>{{chip.value}}</span>{{#if
										this.twoLines
									}}<span
											class="pc-chip-name"
										>{{chip.name}}</span>{{/if}}</span></span></button>
					{{/each}}
					<div
						class="pc-chip pc-chip--cover"
						style={{this.coverStyle}}
					>
						<span class="pc-chip-face">
							<span
								class="pc-cover-text"
							>
								{{#if @palette}}
									<span
										class="pc-cover-title"
									>{{@palette.name}}</span>
									<span
										class="pc-cover-detail"
									>{{@detail}}</span>
								{{else}}
									<span
										class="pc-cover-title"
									>{{@emptyTitle}}</span>
								{{/if}}
							</span>
						</span>
					</div>
					<span
						class="pc-rivet"
						aria-hidden="true"
					></span>
				</div>
			{{/if}}
		</div>
	</template>
}
