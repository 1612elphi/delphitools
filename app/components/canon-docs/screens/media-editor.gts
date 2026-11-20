import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonReadoutBand, {
	readoutBandHeight,
} from 'delphicanon/components/canon-readout-band';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSlider from 'delphicanon/components/canon-slider';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonSwitch from 'delphicanon/components/canon-switch';
import CanonTiles from 'delphicanon/components/canon-tiles';
import { IconSvg } from 'delphitools-v2/components/icon';
import {
	applyFades,
	encodeWav,
	extractPeaks,
	peakDb,
} from 'delphitools-v2/lib/audio';
import { downloadBlob } from 'delphitools-v2/lib/download';
import { formatBytes } from 'delphitools-v2/lib/image-compress';
import { peakBuckets } from 'delphitools-v2/components/tools/media/frames';
import Job from 'delphitools-v2/components/tools/media/job';
import Playback from 'delphitools-v2/components/tools/media/playback';
import Strips from 'delphitools-v2/components/tools/media/strips';
import Transport from 'delphitools-v2/components/tools/media/transport';
import '../../tools/media/media.css';

const rate = 22050;
const seconds = 6;
const bandHeight = readoutBandHeight(120);
const scales = ['Major', 'Minor', 'Pent'];
const steps = [
	[0, 2, 4, 5, 7, 9, 11, 12],
	[0, 2, 3, 5, 7, 8, 10, 12],
	[0, 2, 4, 7, 9, 12, 9, 7],
];
const Export = <template><IconSvg @name="download" /></template>;
const db = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(1)} dB`;

function melody(scale: number) {
	const samples = new Float32Array(rate * seconds);
	const step = (seconds / 8) * rate;
	steps[scale]!.forEach((semitones, n) => {
		const frequency = 220 * 2 ** (semitones / 12);
		const from = Math.round(n * step);
		for (let i = 0; from + i < samples.length; i++) {
			const t = i / rate;
			samples[from + i]! +=
				0.4 *
				Math.min(1, t * 200) *
				Math.exp(-3 * t) *
				Math.sin(2 * Math.PI * frequency * t);
		}
	});
	return samples;
}

const frames = (scale: number) =>
	Array.from(
		{ length: 8 },
		(_, i) =>
			`data:image/svg+xml,${encodeURIComponent(
				`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="hsl(${scale * 120 + i * 15} 55% ${40 + i * 4}%)"/><circle cx="${20 + i * 17}" cy="45" r="14" fill="hsl(${scale * 120 + 180} 70% 85%)"/></svg>`,
			)}`,
	);

export default class MediaEditorScreen extends Component {
	playback = new Playback();
	@tracked scale = 0;
	@tracked gain = 0;
	@tracked fadeIn = false;
	@tracked fadeOut = true;
	@tracked busy = false;
	@tracked progress = 0;
	@tracked result: Blob | null = null;
	@tracked url = this.preview();

	#job = 0;

	willDestroy() {
		super.willDestroy();
		this.#job++;
		this.playback.unload();
		URL.revokeObjectURL(this.url);
	}

	@cached
	get channels() {
		const samples = melody(this.scale);
		applyFades(
			[samples],
			rate,
			this.fadeIn ? 1.5 : 0,
			this.fadeOut ? 1.5 : 0,
		);
		return [samples];
	}

	get amplitude() {
		return 10 ** (this.gain / 20);
	}

	@cached
	get peaks() {
		const scaled = this.channels[0]!.map((v) => v * this.amplitude);
		return extractPeaks([scaled], peakBuckets);
	}

	@cached
	get thumbnails() {
		return frames(this.scale);
	}

	get readings() {
		const peak = peakDb(this.channels) + this.gain;
		return [
			{ label: 'Length', value: `${seconds} s` },
			{ label: 'Rate', value: `${rate} Hz` },
			{
				label: 'Peak',
				value: `${peak.toFixed(1)} dBFS`,
				level: Math.min(1, 10 ** (peak / 20)),
			},
		];
	}

	get resultRow() {
		if (!this.result) return null;
		return {
			name: 'melody.wav',
			detail: `wav · ${formatBytes(this.result.size)}`,
		};
	}

	preview() {
		return URL.createObjectURL(
			new Blob(
				[
					encodeWav(
						this.channels,
						rate,
						this.amplitude,
					),
				],
				{
					type: 'audio/wav',
				},
			),
		);
	}

	edit(change: () => void) {
		this.playback.stop();
		change();
		this.result = null;
		URL.revokeObjectURL(this.url);
		this.url = this.preview();
	}

	setScale = (scale: number) => this.edit(() => (this.scale = scale));
	setGain = (gain: number) => this.edit(() => (this.gain = gain));
	setFadeIn = (on: boolean) => this.edit(() => (this.fadeIn = on));
	setFadeOut = (on: boolean) => this.edit(() => (this.fadeOut = on));

	run = () => void this.#render();

	async #render() {
		const job = ++this.#job;
		this.busy = true;
		this.result = null;
		for (let i = 1; i <= 10; i++) {
			this.progress = i / 10;
			await new Promise(requestAnimationFrame);
			if (job !== this.#job) return;
		}
		this.result = new Blob(
			[encodeWav(this.channels, rate, this.amplitude)],
			{ type: 'audio/wav' },
		);
		this.busy = false;
	}

	cancel = () => {
		this.#job++;
		this.busy = false;
	};

	save = () => {
		if (this.result) downloadBlob(this.result, 'melody.wav');
	};

	<template>
		<CanonSplit @bannerSticks={{true}}>
			<:banner>
				<CanonCanvas @height={{bandHeight}}>
					<CanonReadoutBand
						@transport={{this.playback.transport}}
						@idle={{seconds}}
						@readout="below"
					>
						<Strips
							@thumbnails={{this.thumbnails}}
							@waveform={{true}}
							@peaks={{this.peaks}}
							@duration={{seconds}}
							@playhead={{this.playback.playhead}}
							@onScrub={{this.playback.scrub}}
						/>
					</CanonReadoutBand>
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Source" />
					<CanonSegmented
						aria-label="Scale"
						@items={{scales}}
						@selected={{this.scale}}
						@onChange={{this.setScale}}
					/>
					<CanonHeading @text="Edit" />
					<CanonRow
						@title="Gain"
						@form="stacked"
						as |titleId|
					>
						<CanonSlider
							@value={{this.gain}}
							@min={{-12}}
							@max={{6}}
							@step={{0.5}}
							@readout={{db}}
							@labelledBy={{titleId}}
							@onChange={{this.setGain}}
						/>
					</CanonRow>
					<CanonRow @title="Fade in" as |titleId|>
						<CanonSwitch
							@on={{this.fadeIn}}
							@onChange={{this.setFadeIn}}
							aria-labelledby={{titleId}}
						/>
					</CanonRow>
					<CanonRow
						@title="Fade out"
						as |titleId|
					>
						<CanonSwitch
							@on={{this.fadeOut}}
							@onChange={{this.setFadeOut}}
							aria-labelledby={{titleId}}
						/>
					</CanonRow>
				</CanonRows>
				{{! template-lint-disable require-media-caption }}
				<audio
					src={{this.url}}
					hidden
					{{this.playback.register}}
				></audio>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Readings" />
					<CanonTiles @items={{this.readings}} />
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Export" />
					<Job
						@title="Export"
						@icon={{Export}}
						@failure="Failed"
						@busy={{this.busy}}
						@progress={{this.progress}}
						@failed={{false}}
						@result={{this.resultRow}}
						@onRun={{this.run}}
						@onCancel={{this.cancel}}
						@onSave={{this.save}}
					/>
				</CanonRows>
			</:main>
			<:footer>
				<Transport
					@playback={{this.playback}}
					@ready={{true}}
				/>
			</:footer>
		</CanonSplit>
	</template>
}
