import Component from '@glimmer/component';
import CanonFigure from 'delphicanon/components/canon-figure';
import type { WaveformPeaks } from 'delphitools-v2/lib/audio';
import type { Cue } from 'delphitools-v2/lib/subtitles';
import CueTimeline, {
	type CueLane,
} from 'delphitools-v2/components/tools/media/cue-timeline';
import Strips from 'delphitools-v2/components/tools/media/strips';

export interface PictureSignature {
	Args: {
		peaks: WaveformPeaks | null;
		duration: number;
		cues: Cue[];
		done: boolean;
		figure: string;
		unit: string;
		label: string;
	};
}

const noFrames: string[] = [];

export default class Picture extends Component<PictureSignature> {
	get lanes(): CueLane[] {
		return [{ cues: this.args.cues, lit: true }];
	}

	get span() {
		return this.args.duration * 1000 || undefined;
	}

	<template>
		<div class="as-picture {{if @done 'as-picture--done'}}">
			<div
				class="as-picture-name"
				role="img"
				aria-label={{@label}}
				aria-hidden={{unless @label "true"}}
			></div>
			<Strips
				class="as-wave"
				aria-hidden="true"
				@thumbnails={{noFrames}}
				@waveform={{true}}
				@peaks={{@peaks}}
				@duration={{@duration}}
			/>
			<CueTimeline
				class="as-lane"
				aria-hidden="true"
				@lanes={{this.lanes}}
				@span={{this.span}}
			/>
			{{#if @figure}}
				<CanonFigure
					class="as-figure"
					aria-hidden="true"
					@text={{@figure}}
					@unit={{@unit}}
					@halo="var(--canon-muted)"
				/>
			{{/if}}
		</div>
	</template>
}
