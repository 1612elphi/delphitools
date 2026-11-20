import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import CanonGrid from 'delphicanon/components/canon-grid';
import { IconSvg } from 'delphitools-v2/components/icon';
import type { PairsParam } from 'delphitools-v2/lib/substrata/param-spec';
import FxColourRow from './fx-colour-row';
import drag, { type Drag } from './fx-drag';
import {
	commit,
	labelOf,
	numberOf,
	pickColour,
	preview,
	readoutOf,
	resetOnDouble,
	specOf,
	stringOf,
	write,
	type FxContext,
} from './fx-context';
import { duotoneStops, rgbOf, type Rgb } from './fx-maths';

type Pair = PairsParam['options'][number];

function chipStyle(colours: [string, string]) {
	return htmlSafe(
		`--sub-chip: linear-gradient(135deg, ${colours[1]}, ${colours[0]})`,
	);
}

export default class FxDuotone extends Component<{
	Args: { ctx: FxContext };
}> {
	@tracked chose = false;
	@tracked dragging = false;

	get pairs(): Pair[] {
		return (
			(
				specOf(this.args.ctx, 'pair') as
					PairsParam | undefined
			)?.options ?? []
		);
	}

	get shadow() {
		return stringOf(this.args.ctx, 'shadowColour').toLowerCase();
	}

	get highlight() {
		return stringOf(this.args.ctx, 'highlightColour').toLowerCase();
	}

	get midpoint() {
		return numberOf(this.args.ctx, 'midpoint');
	}

	get matching(): Pair | undefined {
		return this.pairs.find(
			(p) =>
				p.writes['shadowColour']?.toLowerCase() ===
					this.shadow &&
				p.writes['highlightColour']?.toLowerCase() ===
					this.highlight,
		);
	}

	get custom() {
		return this.chose || !this.matching;
	}

	isActive = (pair: Pair) => !this.custom && pair === this.matching;

	get trackStyle() {
		const stops = duotoneStops(
			rgbOf(this.shadow),
			rgbOf(this.highlight, [1, 1, 1] as Rgb),
			this.midpoint,
		);
		return htmlSafe(
			`--sub-duo-ramp: linear-gradient(to right, ${stops.join(', ')}); --sub-duo-at: ${this.midpoint / 100}`,
		);
	}

	get customStyle() {
		return chipStyle([this.shadow, this.highlight]);
	}

	endStyle = (hex: string) => htmlSafe(`background: ${hex}`);

	get text() {
		return readoutOf(this.args.ctx, 'midpoint')(this.midpoint);
	}

	get label() {
		return labelOf(this.args.ctx, 'midpoint');
	}

	get reset() {
		return resetOnDouble(this.args.ctx, 'midpoint');
	}

	pick = (pair: Pair) => {
		this.chose = false;
		write(this.args.ctx, pair.writes);
	};

	chooseCustom = () => {
		this.chose = true;
	};

	pickShadow = () => pickColour(this.args.ctx, 'shadowColour');
	pickHighlight = () => pickColour(this.args.ctx, 'highlightColour');

	percentAt(event: PointerEvent) {
		const box = (
			event.currentTarget as HTMLElement
		).getBoundingClientRect();
		if (box.width <= 0) return this.midpoint;
		return Math.round(
			Math.min(
				1,
				Math.max(
					0,
					(event.clientX - box.left) / box.width,
				),
			) * 100,
		);
	}

	dragSpec: Drag = {
		axis: 'x',
		move: (event) => {
			this.dragging = true;
			const next = this.percentAt(event);
			if (next !== this.midpoint)
				preview(this.args.ctx, { midpoint: next });
		},
		end: () => {
			this.dragging = false;
			commit();
		},
	};

	key = (event: KeyboardEvent) => {
		const dir = {
			ArrowRight: 1,
			ArrowUp: 1,
			ArrowLeft: -1,
			ArrowDown: -1,
		}[event.key];
		if (!dir) return;
		event.preventDefault();
		const next = Math.min(100, Math.max(0, this.midpoint + dir));
		if (next !== this.midpoint)
			write(this.args.ctx, { midpoint: next });
	};

	willDestroy() {
		super.willDestroy();
		commit();
	}

	<template>
		<div class="sub-fxp-duo-bar">
			<button
				type="button"
				class="sub-fxp-duo-end"
				style={{this.endStyle this.shadow}}
				aria-label={{labelOf @ctx "shadowColour"}}
				aria-haspopup="dialog"
				data-fx-param="shadowColour"
				{{on "click" this.pickShadow}}
			></button>
			<div
				class="sub-fxp-duo-track
					{{if this.dragging 'is-active'}}"
				role="slider"
				tabindex="0"
				aria-label={{this.label}}
				aria-valuemin="0"
				aria-valuemax="100"
				aria-valuenow={{this.midpoint}}
				aria-valuetext={{this.text}}
				data-fx-param="midpoint"
				style={{this.trackStyle}}
				{{on "keydown" this.key}}
				{{on "dblclick" this.reset}}
				{{drag this.dragSpec}}
			>
				<span class="sub-fxp-duo-handle"></span>
				<span
					class="sub-fxp-duo-figure"
					aria-hidden="true"
				>{{this.text}}</span>
			</div>
			<button
				type="button"
				class="sub-fxp-duo-end"
				style={{this.endStyle this.highlight}}
				aria-label={{labelOf @ctx "highlightColour"}}
				aria-haspopup="dialog"
				data-fx-param="highlightColour"
				{{on "click" this.pickHighlight}}
			></button>
		</div>
		<CanonGrid @columns={{3}}>
			{{#each this.pairs key="value" as |p|}}
				<button
					type="button"
					class="sub-fxp-chip
						{{if
							(this.isActive p)
							'is-active'
						}}"
					style={{chipStyle p.colours}}
					aria-label={{p.label}}
					aria-pressed={{if
						(this.isActive p)
						"true"
						"false"
					}}
					title={{p.label}}
					{{on "click" (fn this.pick p)}}
				></button>
			{{/each}}
			<button
				type="button"
				class="sub-fxp-chip is-custom
					{{if this.custom 'is-active'}}"
				style={{this.customStyle}}
				aria-label="Custom"
				aria-pressed={{if this.custom "true" "false"}}
				title="Custom"
				{{on "click" this.chooseCustom}}
			><span class="sub-fxp-chip-badge"><IconSvg
						@name="palette"
					/></span></button>
		</CanonGrid>
		{{#if this.custom}}
			<FxColourRow @ctx={{@ctx}} @key="shadowColour" />
			<FxColourRow @ctx={{@ctx}} @key="highlightColour" />
		{{/if}}
	</template>
}
