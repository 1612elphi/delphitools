import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonLamps, { type CanonLamp } from 'delphicanon/components/canon-lamps';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonTimecode from 'delphicanon/components/canon-timecode';
import { IconSvg } from 'delphitools-v2/components/icon';

const rates = [24, 25, 30];
const rateNames = rates.map(String);
const lamps: CanonLamp[] = ['record'];
const Record = <template><IconSvg @name="circle-dot" /></template>;
const Stop = <template><IconSvg @name="square" /></template>;
const Reset = <template><IconSvg @name="rotate-ccw" /></template>;
const pad = (value: number) => String(value).padStart(2, '0');

export default class TimecodePattern extends Component {
	@tracked rate = 1;
	@tracked seconds = 0;
	@tracked running = false;

	#frame = 0;
	#from = 0;

	willDestroy() {
		super.willDestroy();
		cancelAnimationFrame(this.#frame);
	}

	get lit(): CanonLamp[] {
		return this.running ? lamps : [];
	}

	smpte = (seconds: number) => {
		const fps = rates[this.rate]!;
		const whole = Math.floor(seconds);
		return [
			Math.floor(whole / 3600),
			Math.floor(whole / 60) % 60,
			whole % 60,
			Math.floor((seconds - whole) * fps),
		]
			.map(pad)
			.join(':');
	};

	tick = (now: number) => {
		this.seconds = (now - this.#from) / 1000;
		this.#frame = requestAnimationFrame(this.tick);
	};

	toggle = () => {
		this.running = !this.running;
		cancelAnimationFrame(this.#frame);
		if (!this.running) return;
		this.#from = performance.now() - this.seconds * 1000;
		this.#frame = requestAnimationFrame(this.tick);
	};

	reset = () => {
		this.seconds = 0;
		this.#from = performance.now();
	};

	pickRate = (index: number) => (this.rate = index);

	<template>
		<CanonCanvas @height={{104}}>
			<div class="cd-timecode">
				<CanonTimecode
					@seconds={{this.seconds}}
					@format={{this.smpte}}
					@size={{36}}
					@label="Timecode"
				/>
				<CanonLamps
					@lamps={{lamps}}
					@lit={{this.lit}}
				/>
			</div>
		</CanonCanvas>
		<CanonSegmented
			aria-label="Frame rate"
			@items={{rateNames}}
			@selected={{this.rate}}
			@onChange={{this.pickRate}}
		/>
		<CanonGrid>
			<CanonButton
				@kind="primary"
				@text={{if this.running "Stop" "Record"}}
				@icon={{if this.running Stop Record}}
				@onClick={{this.toggle}}
			/>
			<CanonButton
				@text="Reset"
				@icon={{Reset}}
				@onClick={{this.reset}}
			/>
		</CanonGrid>
	</template>
}
