import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { eq, not } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import DownloadLabel from 'delphitools-v2/components/download-label';
import { downloadText } from 'delphitools-v2/lib/download';
import {
	decode,
	encode,
	looksLikeMorse,
	timings,
} from 'delphitools-v2/lib/morse';

type Direction = 'auto' | 'encode' | 'decode';

const DIRECTIONS: { id: Direction; label: string }[] = [
	{ id: 'auto', label: 'Auto' },
	{ id: 'encode', label: 'Encode' },
	{ id: 'decode', label: 'Decode' },
];

const TONE_HZ = 600;
// ~5 ms to 92% of the target; an instant step clicks.
const RAMP_S = 0.002;
const COPIED_MS = 2000;

export default class MorseCodeTool extends Component {
	@tracked input = '';
	@tracked direction: Direction = 'auto';
	@tracked wpm = 20;
	@tracked playing = false;
	@tracked copied = false;

	#audio: AudioContext | null = null;
	#osc: OscillatorNode | null = null;
	#gain: GainNode | null = null;
	#endTimer?: ReturnType<typeof setTimeout>;
	#copiedTimer?: ReturnType<typeof setTimeout>;

	willDestroy() {
		super.willDestroy();
		clearTimeout(this.#copiedTimer);
		this.stop();
		void this.#audio?.close();
	}

	get decoding() {
		return (
			this.direction === 'decode' ||
			(this.direction === 'auto' &&
				looksLikeMorse(this.input))
		);
	}

	get output() {
		return this.decoding ? decode(this.input) : encode(this.input);
	}

	get morse() {
		return this.decoding ? this.input : this.output;
	}

	get playable() {
		return looksLikeMorse(this.morse);
	}

	setInput = (event: Event) => {
		this.input = (event.target as HTMLTextAreaElement).value;
	};

	setDirection = (direction: Direction) => {
		this.direction = direction;
	};

	setWpm = (event: Event) => {
		const value = Number((event.target as HTMLInputElement).value);
		this.wpm = Math.min(40, Math.max(5, value || 20));
	};

	toggle = () => {
		if (this.playing) this.stop();
		else this.play();
	};

	play = () => {
		const steps = timings(this.morse, this.wpm);
		if (!steps.length) return;
		this.#audio ??= new AudioContext();
		const ctx = this.#audio;
		void ctx.resume();
		const gain = ctx.createGain();
		gain.gain.value = 0;
		gain.connect(ctx.destination);
		const osc = ctx.createOscillator();
		osc.frequency.value = TONE_HZ;
		osc.connect(gain);
		let t = ctx.currentTime + 0.05;
		for (const step of steps) {
			gain.gain.setTargetAtTime(step.on ? 1 : 0, t, RAMP_S);
			t += step.ms / 1000;
		}
		t += 0.05;
		osc.start();
		osc.stop(t);
		this.#osc = osc;
		this.#gain = gain;
		this.playing = true;
		this.#endTimer = setTimeout(
			() => this.#end(),
			(t - ctx.currentTime) * 1000,
		);
	};

	stop = () => {
		if (this.#audio && this.#osc && this.#gain) {
			const now = this.#audio.currentTime;
			this.#gain.gain.cancelScheduledValues(now);
			this.#gain.gain.setTargetAtTime(0, now, RAMP_S);
			this.#osc.stop(now + 0.05);
		}
		this.#end();
	};

	#end() {
		clearTimeout(this.#endTimer);
		this.#osc = null;
		this.#gain = null;
		this.playing = false;
	}

	copy = () => {
		void navigator.clipboard.writeText(this.output);
		this.copied = true;
		clearTimeout(this.#copiedTimer);
		this.#copiedTimer = setTimeout(
			() => (this.copied = false),
			COPIED_MS,
		);
	};

	download = () => downloadText(this.output, 'morse.txt');

	<template>
		<div class="dt-morse">
			<div class="dt-morse-frame">
				<div class="segmented dt-morse-dirs">
					{{#each
						DIRECTIONS key="id"
						as |option|
					}}
						<button
							type="button"
							class="dt-morse-dir
								{{if
									(eq
										option.id
										this.direction
									)
									'is-active'
								}}"
							{{on
								"click"
								(fn
									this.setDirection
									option.id
								)
							}}
						>{{option.label}}</button>
					{{/each}}
				</div>

				<textarea
					class="dt-morse-input"
					aria-label="Input"
					spellcheck="false"
					value={{this.input}}
					{{on "input" this.setInput}}
				></textarea>

				<output
					class="dt-morse-output"
					aria-label="Output"
				>
					{{~this.output~}}
				</output>

				<div class="dt-morse-bar">
					<label class="dt-morse-wpm">
						<span>WPM</span>
						<input
							type="number"
							min="5"
							max="40"
							value={{this.wpm}}
							{{on
								"change"
								this.setWpm
							}}
						/>
					</label>
					<button
						type="button"
						class="dt-morse-btn
							{{if
								this.playing
								'is-playing'
							}}"
						disabled={{not this.playable}}
						{{on "click" this.toggle}}
					>
						<Icon
							@name={{if
								this.playing
								"square"
								"play"
							}}
						/>
						{{if
							this.playing
							"Stop"
							"Play"
						}}
					</button>
					<button
						type="button"
						class="dt-morse-btn"
						disabled={{not this.output}}
						{{on "click" this.download}}
					>
						<DownloadLabel />
					</button>
					<button
						type="button"
						class="dt-morse-btn is-primary"
						disabled={{not this.output}}
						{{on "click" this.copy}}
					>
						<Icon
							@name={{if
								this.copied
								"check"
								"copy"
							}}
						/>
						{{if
							this.copied
							"Copied"
							"Copy"
						}}
					</button>
				</div>
			</div>
		</div>
	</template>
}
