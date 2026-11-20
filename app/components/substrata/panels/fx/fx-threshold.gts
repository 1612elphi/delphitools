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

const clampLevel = (v: number) => Math.min(255, Math.max(0, Math.round(v)));

export default class FxThreshold extends Component<{
	Args: { ctx: FxContext };
}> {
	#start?: number;

	get level() {
		return numberOf(this.args.ctx, 'level');
	}

	get text() {
		return readoutOf(this.args.ctx, 'level')(this.level);
	}

	get label() {
		return labelOf(this.args.ctx, 'level');
	}

	get bins() {
		const { layer, stack, fx } = this.args.ctx;
		return histogram(layer, stack, fx.id);
	}

	get handles(): TonesHandle[] {
		return [
			{
				key: 'level',
				label: this.label,
				track: 0,
				position: this.level,
				fill: 'grey',
				text: this.text,
			},
		];
	}

	drag = (_key: string, travel: number) => {
		const start = (this.#start ??= this.level);
		const next = clampLevel(start + travel);
		if (next !== this.level)
			preview(this.args.ctx, { level: next });
	};

	end = () => {
		this.#start = undefined;
		commit();
	};

	settle(raw: number) {
		const next = clampLevel(raw);
		if (next !== this.level) write(this.args.ctx, { level: next });
	}

	step = (_key: string, dir: 1 | -1) => this.settle(this.level + 5 * dir);

	reset = () => {
		const d = defaultOf(this.args.ctx, 'level');
		if (typeof d === 'number') this.settle(d);
	};

	willDestroy() {
		super.willDestroy();
		commit();
	}

	<template>
		<FxTonesGraph
			@bins={{this.bins}}
			@handles={{this.handles}}
			@split={{this.level}}
			@barTrack={{0}}
			@shadeBelow={{this.level}}
			@onDrag={{this.drag}}
			@onEnd={{this.end}}
			@onStep={{this.step}}
			@onReset={{this.reset}}
		/>
		<CanonRow @title={{this.label}} class="sub-fxp-figure-row">
			<CanonFigure
				@text={{this.text}}
				@size={{17}}
				@colour="var(--canon-foreground)"
			/>
		</CanonRow>
	</template>
}
