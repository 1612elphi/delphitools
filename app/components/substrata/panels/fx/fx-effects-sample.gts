import Component from '@glimmer/component';
import { htmlSafe } from '@ember/template';
import { numberOf, stringOf, type FxContext } from './fx-context';
import { glowOpacity, lightness, rgbOf } from './fx-maths';

interface Signature {
	Args: {
		ctx: FxContext;
		scale: number;
		side: number;
		x?: number;
		y?: number;
	};
	Element: HTMLDivElement;
}

export default class FxEffectsSample extends Component<Signature> {
	get type() {
		return this.args.ctx.fx.type;
	}

	get rgb() {
		return rgbOf(stringOf(this.args.ctx, 'colour'));
	}

	colour(alpha: number) {
		const [r, g, b] = this.rgb.map((v) => Math.round(v * 255));
		return `rgb(${r} ${g} ${b} / ${alpha})`;
	}

	get tone() {
		const l = lightness(this.rgb);
		return l > 0.67 ? 'is-pale' : l < 0.41 ? 'is-deep' : '';
	}

	get shadow(): string {
		const ctx = this.args.ctx;
		const n = (k: string) => numberOf(ctx, k);
		const s = this.args.scale;
		const x = (this.args.x ?? n('offsetX')) * s;
		const y = (this.args.y ?? n('offsetY')) * s;
		const band = n('width') * s;
		switch (this.type) {
			case 'drop-shadow':
				return `${x}px ${y}px ${n('blur') * s}px ${n('spread') * s}px ${this.colour(n('opacity') / 100)}`;
			case 'outer-glow':
				return `0 0 ${n('blur') * s}px 0 ${this.colour(glowOpacity(n('intensity')))}`;
			case 'inner-shadow':
				return `inset ${x}px ${y}px ${n('blur') * s}px 0 ${this.colour(n('opacity') / 100)}`;
			case 'inner-glow':
				return `inset 0 0 ${n('blur') * s}px 0 ${this.colour(glowOpacity(n('intensity')))}`;
			case 'colour-overlay':
				return `inset 0 0 0 999px ${this.colour(n('opacity') / 100)}`;
			case 'stroke': {
				const position = stringOf(ctx, 'position');
				if (position === 'inner')
					return `inset 0 0 0 ${band}px ${this.colour(1)}`;
				if (position === 'centre')
					return `0 0 0 ${band / 2}px ${this.colour(1)}, inset 0 0 0 ${band / 2}px ${this.colour(1)}`;
				return `0 0 0 ${band}px ${this.colour(1)}`;
			}
			default:
				return 'none';
		}
	}

	get squareStyle() {
		return htmlSafe(
			`inline-size: ${this.args.side}px; block-size: ${this.args.side}px; box-shadow: ${this.shadow}`,
		);
	}

	<template>
		<div
			class="sub-fxp-sample {{this.tone}}"
			aria-hidden="true"
			...attributes
		><span
				class="sub-fxp-sample-square"
				style={{this.squareStyle}}
			></span></div>
	</template>
}
