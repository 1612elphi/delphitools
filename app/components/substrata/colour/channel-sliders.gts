import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSlider from 'delphicanon/components/canon-slider';
import {
	CHANNEL_NAMES,
	SLIDER_MODES,
	SLIDER_TITLES,
	channels,
	figures,
	fromChannels,
	hexOf,
	type RingColour,
	type SliderMode,
} from 'delphitools-v2/lib/substrata/colour-ring/model';
import {
	loadLayout,
	saveLayout,
} from 'delphitools-v2/lib/substrata/layout-storage';

interface Signature {
	Args: {
		colour: RingColour;
		onColour: (colour: RingColour, final: boolean) => void;
	};
}

const MODE_KEY = 'colourTraySliders';

export default class ChannelSliders extends Component<Signature> {
	@tracked mode: SliderMode = SLIDER_MODES.includes(
		loadLayout<SliderMode>(MODE_KEY, 'lab'),
	)
		? loadLayout<SliderMode>(MODE_KEY, 'lab')
		: 'lab';
	#moved = false;

	titles = SLIDER_MODES.map((m) => SLIDER_TITLES[m]);

	get modeIndex() {
		return SLIDER_MODES.indexOf(this.mode);
	}

	get values() {
		return channels(this.mode, this.args.colour);
	}

	get rows() {
		const values = this.values;
		const shown = figures(this.mode, values);
		return CHANNEL_NAMES[this.mode].map((name, index) => ({
			index,
			name,
			value: values[index]!,
			figure: shown[index]!,
			track: htmlSafe(
				`--sub-ct-track: linear-gradient(to right, ${Array.from(
					{ length: 7 },
					(_, step) => {
						const stop = [...values];
						stop[index] = step / 6;
						return hexOf(
							fromChannels(
								this.mode,
								stop,
								1,
							),
							false,
						);
					},
				).join(', ')})`,
			),
		}));
	}

	pickMode = (index: number) => {
		this.mode = SLIDER_MODES[index] ?? 'lab';
		saveLayout(MODE_KEY, this.mode);
	};

	readout = (index: number) => (value: number) => {
		const values = [...this.values];
		values[index] = value;
		return figures(this.mode, values)[index]!;
	};

	change = (index: number, value: number, dragging: boolean) => {
		const values = [...this.values];
		values[index] = value;
		this.#moved = dragging;
		this.args.onColour(
			fromChannels(this.mode, values, this.args.colour.alpha),
			!dragging,
		);
	};

	released = () => {
		if (!this.#moved) return;
		this.#moved = false;
		this.args.onColour(this.args.colour, true);
	};

	<template>
		<div class="sub-ct-sliders">
			<CanonSegmented
				@items={{this.titles}}
				@selected={{this.modeIndex}}
				@onChange={{this.pickMode}}
			/>
			{{#each this.rows as |row|}}
				<div
					class="sub-ct-slider-row"
					style={{row.track}}
					{{on "pointerup" this.released}}
					{{on "pointercancel" this.released}}
				>
					<span
						class="sub-ct-slider-name"
					>{{row.name}}</span>
					<CanonSlider
						@value={{row.value}}
						@label={{row.name}}
						@readout={{this.readout
							row.index
						}}
						@onChange={{fn
							this.change
							row.index
						}}
					/>
				</div>
			{{/each}}
		</div>
	</template>
}
