import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonReadoutBand, {
	readoutBandHeight,
} from 'delphicanon/components/canon-readout-band';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import { encodeWav, extractPeaks } from 'delphitools-v2/lib/audio';
import { peakBuckets } from 'delphitools-v2/components/tools/media/frames';
import Playback from 'delphitools-v2/components/tools/media/playback';
import Strips from 'delphitools-v2/components/tools/media/strips';
import Transport from 'delphitools-v2/components/tools/media/transport';
import '../../tools/media/media.css';

const rate = 22050;
const seconds = 2;
const notes = ['A3', 'A4', 'A5'];
const hertz = [220, 440, 880];
const bandHeight = readoutBandHeight(72);
const noFrames: string[] = [];

function pluck(root: number) {
	const samples = new Float32Array(rate * seconds);
	[0, 4, 7, 12].forEach((semitones, n) => {
		const frequency = root * 2 ** (semitones / 12);
		const from = Math.round((n * rate * seconds) / 5);
		const decay = n === 3 ? 2.5 : 6;
		for (let i = 0; from + i < samples.length; i++) {
			const t = i / rate;
			const phase = 2 * Math.PI * frequency * t;
			const envelope =
				Math.min(1, t * 100) * Math.exp(-decay * t);
			samples[from + i]! +=
				0.45 *
				envelope *
				(Math.sin(phase) + 0.3 * Math.sin(2 * phase));
		}
	});
	return [samples];
}

const wavUrl = (channels: Float32Array[]) =>
	URL.createObjectURL(
		new Blob([encodeWav(channels, rate)], { type: 'audio/wav' }),
	);

export default class TonePattern extends Component {
	playback = new Playback();
	@tracked note = 1;
	@tracked url = wavUrl(pluck(hertz[1]!));

	@cached
	get peaks() {
		return extractPeaks(pluck(hertz[this.note]!), peakBuckets);
	}

	willDestroy() {
		super.willDestroy();
		this.playback.unload();
		URL.revokeObjectURL(this.url);
	}

	pick = (note: number) => {
		this.playback.stop();
		URL.revokeObjectURL(this.url);
		this.note = note;
		this.url = wavUrl(pluck(hertz[note]!));
	};

	<template>
		<CanonCanvas @height={{bandHeight}}>
			<CanonReadoutBand
				@transport={{this.playback.transport}}
				@idle={{seconds}}
				@readout="over"
			>
				<Strips
					@thumbnails={{noFrames}}
					@waveform={{true}}
					@peaks={{this.peaks}}
					@duration={{seconds}}
					@playhead={{this.playback.playhead}}
					@onScrub={{this.playback.scrub}}
				/>
			</CanonReadoutBand>
		</CanonCanvas>
		<CanonSegmented
			aria-label="Note"
			@items={{notes}}
			@selected={{this.note}}
			@onChange={{this.pick}}
		/>
		<Transport @playback={{this.playback}} @ready={{true}} />
		{{! template-lint-disable require-media-caption }}
		<audio
			src={{this.url}}
			hidden
			{{this.playback.register}}
		></audio>
	</template>
}
