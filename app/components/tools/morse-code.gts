import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import type Owner from '@ember/owner';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonReadoutBand, {
	readoutBandHeight,
} from 'delphicanon/components/canon-readout-band';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSlider from 'delphicanon/components/canon-slider';
import CanonSplit from 'delphicanon/components/canon-split';
import { IconSvg } from 'delphitools-v2/components/icon';
import {
	keyOfEvent,
	pressKey,
	type MorseKey,
} from 'delphitools-v2/components/tools/morse-code/keypad';
import MorsePlayer from 'delphitools-v2/components/tools/morse-code/player';
import Tape, {
	collapsedStrip,
	stripHeight,
} from 'delphitools-v2/components/tools/morse-code/tape';
import { tapeOf } from 'delphitools-v2/components/tools/morse-code/layout';
import Result from 'delphitools-v2/components/tools/text-tool/result';
import Source from 'delphitools-v2/components/tools/text-tool/source';
import { decode, encode, looksLikeMorse } from 'delphitools-v2/lib/morse';
import './morse-code/morse-code.css';

const directions = ['Auto', 'Encode', 'Decode'];
const speed = { min: 5, max: 40, start: 20 };

const PlayIcon = <template><IconSvg @name="play" /></template>;
const PauseIcon = <template><IconSvg @name="pause" /></template>;
const StopIcon = <template><IconSvg @name="square" /></template>;
const LoopIcon = <template><IconSvg @name="repeat" /></template>;
const DitIcon = <template><IconSvg @name="dot" /></template>;
const DahIcon = <template><IconSvg @name="minus" /></template>;
const LetterGapIcon = <template><IconSvg @name="space" /></template>;
const WordGapIcon = <template><IconSvg @name="slash" /></template>;
const BackspaceIcon = <template><IconSvg @name="delete" /></template>;

const wpmText = (value: number) => `${Math.round(value)} WPM`;

export default class MorseCode extends Component {
	@tracked input = '';
	@tracked direction = 0;
	@tracked wpm = speed.start;
	@tracked looping = false;
	@tracked playing = false;
	@tracked paused = false;
	@tracked playhead?: number;
	@tracked passes = 0;

	player = new MorsePlayer();
	#frame = 0;
	#autoplay?: number;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		const mode = Number(query.get('morseMode'));
		if (mode >= 0 && mode < directions.length)
			this.direction = Math.floor(mode);
		const wpm = Number(query.get('morseWpm'));
		if (wpm)
			this.wpm = Math.min(
				speed.max,
				Math.max(speed.min, wpm),
			);
		this.looping = query.has('morseLoop');
		if (query.has('morseQuiet')) this.player.volume = 0.02;
		this.input = query.get('morseText') ?? '';
		this.player.onEnd = () => this.#show();
		if (query.has('morsePlay'))
			this.#autoplay = window.setTimeout(
				() => this.toggle(),
				0,
			);
	}

	willDestroy() {
		super.willDestroy();
		window.clearTimeout(this.#autoplay);
		cancelAnimationFrame(this.#frame);
		this.player.dispose();
	}

	get directions() {
		return directions;
	}

	get speed() {
		return speed;
	}

	get decoding() {
		return (
			this.direction === 2 ||
			(this.direction === 0 && looksLikeMorse(this.input))
		);
	}

	get keying() {
		return this.decoding || (this.direction === 0 && !this.input);
	}

	get converted() {
		return this.decoding ? decode(this.input) : encode(this.input);
	}

	get morse() {
		return this.decoding ? this.input : this.converted;
	}

	get spoken() {
		return this.decoding ? this.converted : this.input;
	}

	get sourceHeading() {
		return this.decoding ? 'Morse' : 'Text';
	}

	get resultHeading() {
		return this.decoding ? 'Text' : 'Morse';
	}

	get playable() {
		return looksLikeMorse(this.morse);
	}

	get running() {
		return this.playing && !this.paused;
	}

	get unitSeconds() {
		return 1.2 / this.wpm;
	}

	get duration() {
		const { glyphs, total } = tapeOf(this.morse);
		return glyphs.length ? total * this.unitSeconds : null;
	}

	get step() {
		return this.playhead === undefined
			? undefined
			: Math.floor(this.playhead / this.unitSeconds);
	}

	get transport() {
		return {
			playhead: this.playhead,
			playing: this.running,
			paused: this.paused,
			looping: this.looping,
			loops: this.passes,
		};
	}

	#show() {
		this.playing = this.player.playing;
		this.paused = this.player.paused;
		const position = this.player.position;
		this.playhead = position?.seconds;
		this.passes = position?.passes ?? 0;
		cancelAnimationFrame(this.#frame);
		if (this.running)
			this.#frame = requestAnimationFrame(() => this.#show());
	}

	#changed() {
		this.player.stop();
		this.#show();
	}

	setInput = (text: string) => {
		this.input = text;
		this.#changed();
	};

	setDirection = (direction: number) => {
		this.direction = direction;
		this.#changed();
	};

	setWpm = (value: number) => {
		if (Math.round(value) === this.wpm) return;
		this.wpm = Math.round(value);
		this.#changed();
	};

	toggle = () => {
		const { player } = this;
		if (player.paused) player.resume();
		else if (player.playing) player.pause();
		else player.play(this.morse, this.wpm, this.looping);
		this.#show();
	};

	stop = () => {
		this.player.stop();
		this.#show();
	};

	toggleLoop = () => {
		this.looping = !this.looping;
		this.player.looping = this.looping;
	};

	press = (key: MorseKey) => {
		const next = pressKey(this.input, key);
		if (next === this.input) return;
		this.setInput(next);
		if (key === 'dit') this.player.key('.', this.wpm);
		if (key === 'dah') this.player.key('-', this.wpm);
	};

	keypadDown = (event: KeyboardEvent) => {
		const key = keyOfEvent[event.key];
		if (!key || event.metaKey || event.ctrlKey || event.altKey)
			return;
		event.preventDefault();
		this.press(key);
	};

	keypadUp = (event: KeyboardEvent) => {
		if (event.key === ' ') event.preventDefault();
	};

	<template>
		<CanonSplit
			class="morse-code"
			@halves={{true}}
			@collapsesTo={{readoutBandHeight collapsedStrip}}
		>
			<:banner>
				<CanonCanvas
					@height={{readoutBandHeight
						stripHeight
					}}
				>
					<CanonReadoutBand
						@transport={{this.transport}}
						@idle={{this.duration}}
						@readout="below"
					>
						<Tape
							@morse={{this.morse}}
							@step={{this.step}}
							@label={{this.spoken}}
						/>
					</CanonReadoutBand>
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<CanonRows @framed={{true}}>
					<Source
						@heading={{this.sourceHeading}}
						@text={{this.input}}
						@onChange={{this.setInput}}
					/>
					<CanonHeading @text="Direction" />
					<CanonSegmented
						aria-label="Direction"
						@items={{this.directions}}
						@selected={{this.direction}}
						@onChange={{this.setDirection}}
					/>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Speed" />
					<CanonSlider
						class="mc-speed"
						@value={{this.wpm}}
						@min={{this.speed.min}}
						@max={{this.speed.max}}
						@step={{1}}
						@readout={{wpmText}}
						@label="Speed"
						@onChange={{this.setWpm}}
					/>
				</CanonRows>
			</:sidebar>
			<:main>
				<Result
					class="mc-result"
					@heading={{this.resultHeading}}
					@text={{this.converted}}
					@fileName="morse.txt"
				/>
			</:main>
			<:footer>
				{{#if this.keying}}
					{{! template-lint-disable no-invalid-interactive }}
					<div
						class="mc-keypad"
						role="group"
						aria-label="Keypad"
						{{on "keydown" this.keypadDown}}
						{{on "keyup" this.keypadUp}}
					>
						<CanonGrid>
							<CanonButton
								class="mc-key"
								@text="Dit"
								@icon={{DitIcon}}
								@onClick={{fn
									this.press
									"dit"
								}}
								aria-keyshortcuts="."
							/>
							<CanonButton
								class="mc-key"
								@text="Dah"
								@icon={{DahIcon}}
								@onClick={{fn
									this.press
									"dah"
								}}
								aria-keyshortcuts="-"
							/>
						</CanonGrid>
						<CanonGrid>
							<CanonButton
								@text="Letter gap"
								@icon={{LetterGapIcon}}
								@onClick={{fn
									this.press
									"letter"
								}}
								aria-keyshortcuts="Space"
							/>
							<CanonButton
								@text="Word gap"
								@icon={{WordGapIcon}}
								@onClick={{fn
									this.press
									"word"
								}}
								aria-keyshortcuts="/"
							/>
							<CanonButton
								@text="Backspace"
								@icon={{BackspaceIcon}}
								@repeats={{true}}
								@disabled={{if
									this.input
									false
									true
								}}
								@onClick={{fn
									this.press
									"back"
								}}
								aria-keyshortcuts="Backspace"
							/>
						</CanonGrid>
					</div>
				{{/if}}
				<CanonGrid class="mc-transport">
					<CanonButton
						class="mc-loop"
						@text="Loop"
						@icon={{LoopIcon}}
						@selected={{this.looping}}
						@onClick={{this.toggleLoop}}
						aria-pressed={{if
							this.looping
							"true"
							"false"
						}}
					/>
					<CanonButton
						class="mc-play"
						@kind="primary"
						@text={{if
							this.running
							"Pause"
							"Play"
						}}
						@icon={{if
							this.running
							PauseIcon
							PlayIcon
						}}
						@disabled={{if
							this.playable
							false
							true
						}}
						@onClick={{this.toggle}}
					/>
					<CanonButton
						class="mc-stop"
						@text="Stop"
						@icon={{StopIcon}}
						@disabled={{if
							this.playing
							false
							true
						}}
						@onClick={{this.stop}}
					/>
				</CanonGrid>
			</:footer>
		</CanonSplit>
	</template>
}
