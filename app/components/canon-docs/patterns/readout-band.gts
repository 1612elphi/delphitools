import Component from '@glimmer/component';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonReadoutBand, {
	readoutBandHeight,
} from 'delphicanon/components/canon-readout-band';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSplit from 'delphicanon/components/canon-split';
import { encodeWav, extractPeaks } from 'delphitools-v2/lib/audio';
import { peakBuckets } from 'delphitools-v2/components/tools/media/frames';
import Playback from 'delphitools-v2/components/tools/media/playback';
import Strips from 'delphitools-v2/components/tools/media/strips';
import Transport from 'delphitools-v2/components/tools/media/transport';
import '../../tools/media/media.css';

const rate = 22050;
const seconds = 4;

function sweep() {
	const samples = new Float32Array(rate * seconds);
	let phase = 0;
	for (let i = 0; i < samples.length; i++) {
		const t = i / rate;
		phase += (2 * Math.PI * (220 + (220 * t) / seconds)) / rate;
		samples[i] =
			0.4 *
			Math.sin((Math.PI * t) / seconds) *
			Math.sin(phase);
	}
	return samples;
}

const channels = [sweep()];
const peaks = extractPeaks(channels, peakBuckets);
const bandHeight = readoutBandHeight(96);

const frames = Array.from(
	{ length: 8 },
	(_, i) =>
		`data:image/svg+xml,${encodeURIComponent(
			`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="hsl(${i * 45} 60% 55%)"/></svg>`,
		)}`,
);

export default class ReadoutBandPattern extends Component {
	playback = new Playback();
	url = URL.createObjectURL(
		new Blob([encodeWav(channels, rate)], { type: 'audio/wav' }),
	);

	willDestroy() {
		super.willDestroy();
		this.playback.unload();
		URL.revokeObjectURL(this.url);
	}

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
							@thumbnails={{frames}}
							@waveform={{true}}
							@peaks={{peaks}}
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
					<CanonRow
						@title="sweep.wav"
						@detail="4 s · 22050 Hz"
					/>
				</CanonRows>
				{{! template-lint-disable require-media-caption }}
				<audio
					src={{this.url}}
					hidden
					{{this.playback.register}}
				></audio>
			</:sidebar>
			<:main></:main>
			<:footer>
				<Transport
					@playback={{this.playback}}
					@ready={{true}}
				/>
			</:footer>
		</CanonSplit>
	</template>
}
