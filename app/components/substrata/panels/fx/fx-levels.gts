import Component from '@glimmer/component';
import CanonRow from 'delphicanon/components/canon-row';
import CanonFigure from 'delphicanon/components/canon-figure';
import FxTonesGraph, { type TonesHandle } from './fx-tones-graph';
import { histogram } from './fx-histogram';
import {
	commit,
	defaultOf,
	labelOf,
	numberOf,
	preview,
	readoutOf,
	write,
	type FxContext,
} from './fx-context';
import {
	clampLevels,
	gammaAt,
	gammaPosition,
	type LevelKey,
	type Levels,
} from './fx-maths';

const KEYS: LevelKey[] = [
	'inBlack',
	'gamma',
	'inWhite',
	'outBlack',
	'outWhite',
];

export default class FxLevels extends Component<{ Args: { ctx: FxContext } }> {
	#start?: Levels;

	get values(): Levels {
		const n = (k: LevelKey) => numberOf(this.args.ctx, k);
		return {
			inBlack: n('inBlack'),
			inWhite: n('inWhite'),
			gamma: n('gamma'),
			outBlack: n('outBlack'),
			outWhite: n('outWhite'),
		};
	}

	get bins() {
		const { layer, stack, fx } = this.args.ctx;
		return histogram(layer, stack, fx.id);
	}

	text(key: LevelKey, v: number) {
		return readoutOf(this.args.ctx, key)(v);
	}

	get handles(): TonesHandle[] {
		const v = this.values;
		return KEYS.map((key) => ({
			key,
			label: labelOf(this.args.ctx, key),
			track: key.startsWith('out') ? 1 : 0,
			position:
				key === 'gamma'
					? gammaPosition(
							v.gamma,
							v.inBlack,
							v.inWhite,
						)
					: v[key],
			fill:
				key === 'gamma'
					? 'grey'
					: key.endsWith('Black')
						? 'black'
						: 'white',
			text: this.text(key, v[key]),
		}));
	}

	get input() {
		const v = this.values;
		return [
			this.text('inBlack', v.inBlack),
			this.text('gamma', v.gamma),
			this.text('inWhite', v.inWhite),
		].join('  ');
	}

	get output() {
		const v = this.values;
		return [
			this.text('outBlack', v.outBlack),
			this.text('outWhite', v.outWhite),
		].join('  ');
	}

	drag = (key: string, travel: number) => {
		const k = key as LevelKey;
		const start = (this.#start ??= this.values);
		const next = { ...this.values };
		if (k === 'gamma') {
			const position =
				gammaPosition(
					start.gamma,
					start.inBlack,
					start.inWhite,
				) + travel;
			next.gamma = gammaAt(
				position,
				next.inBlack,
				next.inWhite,
			);
		} else {
			next[k] = Math.round(start[k] + travel);
		}
		const clamped = clampLevels(next, k);
		if (clamped[k] !== this.values[k])
			preview(this.args.ctx, { [k]: clamped[k] });
	};

	end = () => {
		this.#start = undefined;
		commit();
	};

	settle(k: LevelKey, raw: number) {
		const next = clampLevels({ ...this.values, [k]: raw }, k);
		if (next[k] !== this.values[k])
			write(this.args.ctx, { [k]: next[k] });
	}

	step = (key: string, dir: 1 | -1) => {
		const k = key as LevelKey;
		this.settle(
			k,
			Math.round(
				(this.values[k] +
					dir * (k === 'gamma' ? 0.1 : 5)) *
					100,
			) / 100,
		);
	};

	reset = (key: string) => {
		const d = defaultOf(this.args.ctx, key);
		if (typeof d === 'number') this.settle(key as LevelKey, d);
	};

	willDestroy() {
		super.willDestroy();
		commit();
	}

	<template>
		<FxTonesGraph
			@bins={{this.bins}}
			@handles={{this.handles}}
			@split={{null}}
			@barTrack={{1}}
			@shadeBelow={{this.values.inBlack}}
			@shadeAbove={{this.values.inWhite}}
			@onDrag={{this.drag}}
			@onEnd={{this.end}}
			@onStep={{this.step}}
			@onReset={{this.reset}}
		/>
		<CanonRow @title="Input" class="sub-fxp-figure-row">
			<CanonFigure
				@text={{this.input}}
				@size={{17}}
				@colour="var(--canon-foreground)"
			/>
		</CanonRow>
		<CanonRow @title="Output" class="sub-fxp-figure-row">
			<CanonFigure
				@text={{this.output}}
				@size={{17}}
				@colour="var(--canon-foreground)"
			/>
		</CanonRow>
	</template>
}
