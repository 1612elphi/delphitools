import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import CanonFigure from 'delphicanon/components/canon-figure';
import CanonGrid from 'delphicanon/components/canon-grid';
import FxEffectsSample from './fx-effects-sample';
import drag, { type Drag } from './fx-drag';
import {
	commit,
	defaultOf,
	labelOf,
	numberOf,
	preview,
	write,
	type FxContext,
} from './fx-context';
import { angleOf, padRange } from './fx-maths';

const HEIGHT = 200;
const REACH = HEIGHT / 2 - 8;
const LIMIT = 500;

const limit = (v: number) => Math.min(LIMIT, Math.max(-LIMIT, Math.round(v)));

export default class FxShadowPad extends Component<{
	Args: { ctx: FxContext };
}> {
	@tracked held?: number;
	@tracked guides = false;
	#grab = { x: 0, y: 0 };
	#fade?: number;

	get x() {
		return numberOf(this.args.ctx, 'offsetX');
	}

	get y() {
		return numberOf(this.args.ctx, 'offsetY');
	}

	get range() {
		const n = (k: string) => numberOf(this.args.ctx, k);
		return (
			this.held ??
			padRange(this.x, this.y, n('blur'), n('spread'))
		);
	}

	get scale() {
		return REACH / this.range;
	}

	get rangeText() {
		return `±${this.range} px`;
	}

	get lineStyle() {
		const dx = this.x * this.scale;
		const dy = this.y * this.scale;
		return htmlSafe(
			`--sub-pad-x: ${dx}px; --sub-pad-y: ${dy}px; --sub-pad-length: ${Math.hypot(dx, dy)}px; --sub-pad-angle: ${Math.atan2(dy, dx)}rad`,
		);
	}

	get xText() {
		return String(this.x);
	}

	get yText() {
		return String(this.y);
	}

	get distance() {
		const d = Math.hypot(this.x, this.y);
		return d.toFixed(Math.round(d) === d ? 0 : 1);
	}

	get angle() {
		return String(angleOf(this.x, this.y));
	}

	get valueText() {
		return `${this.x} px, ${this.y} px`;
	}

	get label() {
		return `${labelOf(this.args.ctx, 'offsetX')}, ${labelOf(this.args.ctx, 'offsetY')}`;
	}

	show() {
		this.guides = true;
		window.clearTimeout(this.#fade);
		this.#fade = window.setTimeout(() => {
			if (this.held === undefined) this.guides = false;
		}, 1000);
	}

	offsetAt(pad: HTMLElement, clientX: number, clientY: number) {
		const box = pad.getBoundingClientRect();
		return {
			x: limit(
				(clientX - box.left - box.width / 2) /
					this.scale,
			),
			y: limit(
				(clientY - box.top - box.height / 2) /
					this.scale,
			),
		};
	}

	put(x: number, y: number) {
		write(this.args.ctx, { offsetX: limit(x), offsetY: limit(y) });
		this.show();
	}

	dragSpec: Drag = {
		axis: 'any',
		start: (event) => {
			const box = (
				event.currentTarget as HTMLElement
			).getBoundingClientRect();
			this.#grab = {
				x:
					box.left +
					box.width / 2 +
					this.x * this.scale -
					event.clientX,
				y:
					box.top +
					box.height / 2 +
					this.y * this.scale -
					event.clientY,
			};
			this.show();
		},
		move: (event) => {
			this.held ??= this.range;
			const next = this.offsetAt(
				event.currentTarget as HTMLElement,
				event.clientX + this.#grab.x,
				event.clientY + this.#grab.y,
			);
			if (next.x !== this.x || next.y !== this.y)
				preview(this.args.ctx, {
					offsetX: next.x,
					offsetY: next.y,
				});
		},
		end: (dragged, event) => {
			if (dragged) {
				commit();
				this.held = undefined;
			} else if (event && event.detail < 2) {
				const at = this.offsetAt(
					event.currentTarget as HTMLElement,
					event.clientX,
					event.clientY,
				);
				this.put(at.x, at.y);
			}
			this.show();
		},
	};

	reset = () => {
		const x = defaultOf(this.args.ctx, 'offsetX');
		const y = defaultOf(this.args.ctx, 'offsetY');
		this.put(Number(x ?? 0), Number(y ?? 0));
	};

	key = (event: KeyboardEvent) => {
		const by = event.shiftKey ? 10 : 1;
		const move = {
			ArrowRight: [by, 0],
			ArrowLeft: [-by, 0],
			ArrowDown: [0, by],
			ArrowUp: [0, -by],
		}[event.key];
		if (!move) return;
		event.preventDefault();
		this.put(this.x + move[0]!, this.y + move[1]!);
	};

	willDestroy() {
		super.willDestroy();
		window.clearTimeout(this.#fade);
		commit();
	}

	<template>
		<div
			class="sub-fxp-pad {{if this.guides 'is-guided'}}"
			data-fx-param="offset"
			style={{this.lineStyle}}
			{{drag this.dragSpec}}
		>
			<FxEffectsSample
				@ctx={{@ctx}}
				@scale={{this.scale}}
				@side={{72}}
			/>
			<span
				class="sub-fxp-pad-cross"
				aria-hidden="true"
			></span>
			<span
				class="sub-fxp-pad-line"
				aria-hidden="true"
			></span>
			<span class="sub-fxp-pad-dot" aria-hidden="true"></span>
			<span
				class="sub-fxp-pad-range"
				aria-hidden="true"
			>{{this.rangeText}}</span>
			<span
				class="sub-fxp-cover"
				role="slider"
				tabindex="0"
				aria-label={{this.label}}
				aria-valuetext={{this.valueText}}
				aria-valuenow={{this.x}}
				{{on "keydown" this.key}}
				{{on "dblclick" this.reset}}
			></span>
		</div>
		<CanonGrid
			class="sub-fxp-pad-figures"
			@columns={{4}}
			aria-hidden="true"
		>
			<div class="sub-fxp-pad-figure"><span
				>x</span><CanonFigure
					@text={{this.xText}}
					@unit=" px"
					@size={{15}}
					@colour="var(--canon-foreground)"
				/></div>
			<div class="sub-fxp-pad-figure"><span
				>y</span><CanonFigure
					@text={{this.yText}}
					@unit=" px"
					@size={{15}}
					@colour="var(--canon-foreground)"
				/></div>
			<div class="sub-fxp-pad-figure"><span
				>Distance</span><CanonFigure
					@text={{this.distance}}
					@unit=" px"
					@size={{15}}
					@colour="var(--canon-foreground)"
				/></div>
			<div class="sub-fxp-pad-figure"><span
				>Angle</span><CanonFigure
					@text={{this.angle}}
					@unit="°"
					@size={{15}}
					@colour="var(--canon-foreground)"
				/></div>
		</CanonGrid>
	</template>
}
