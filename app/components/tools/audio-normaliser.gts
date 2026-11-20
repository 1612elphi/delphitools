import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonEmptyRow from 'delphicanon/components/canon-empty-row';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonLoader from 'delphicanon/components/canon-loader';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonTiles from 'delphicanon/components/canon-tiles';
import { IconSvg } from 'delphitools-v2/components/icon';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import { downloadBlob } from 'delphitools-v2/lib/download';
import { formatBytes } from 'delphitools-v2/lib/image-compress';
import {
	AudioIntake,
	channelsOf,
	encodeWav,
	extractPeaks,
	integratedLufs,
	peakDb,
	type WaveformPeaks,
} from 'delphitools-v2/lib/audio';
import { dbToGain, planGain } from 'delphitools-v2/lib/normalise';
import { AUDIO_ACCEPT, acceptAttr } from 'delphitools-v2/lib/tools';
import Drop from 'delphitools-v2/components/tools/media/drop';
import Job from 'delphitools-v2/components/tools/media/job';
import Slot from 'delphitools-v2/components/tools/media/slot';
import { bandHeight } from 'delphitools-v2/components/tools/media/strips';
import { peakBuckets } from 'delphitools-v2/components/tools/media/frames';
import Picture from 'delphitools-v2/components/tools/audio-normaliser/picture';
import './media/media.css';
import './audio-normaliser/audio-normaliser.css';

const ACCEPT = acceptAttr(AUDIO_ACCEPT);

const TARGETS: { lufs: number; label: string; hint: string }[] = [
	{ lufs: -14, label: '-14', hint: 'Streaming' },
	{ lufs: -16, label: '-16', hint: 'Podcast' },
	{ lufs: -23, label: '-23', hint: 'Broadcast' },
];
const targetLabels = TARGETS.map((t) => t.label);

const LIMITED_NOTE = 'Gain capped at -1 dBFS peak';
const WRITE_ERROR = "Couldn't write the normalised file.";

const levelFloor = -60;
const level = (value: number) =>
	Number.isFinite(value)
		? Math.min(1, Math.max(0, 1 - value / levelFloor))
		: undefined;
const db = (value: number, unit: string) =>
	Number.isFinite(value) ? `${value.toFixed(1)} ${unit}` : '–';
const blankTiles = ['Loudness', 'Peak', 'Gain', 'Output peak'].map((label) => ({
	label,
	value: '\u2014',
	level: label === 'Gain' ? undefined : 0,
}));
const signed = (value: number) =>
	`${value >= 0 ? '+' : ''}${value.toFixed(1)} dB`;

const Trash = <template><IconSvg @name="trash-2" /></template>;
const Gauge = <template><IconSvg @name="gauge" /></template>;

interface Measurement {
	lufs: number;
	peakDb: number;
	peaks: WaveformPeaks;
}

export default class AudioNormaliser extends Component {
	intake = new AudioIntake({
		onLoad: () => this.#reset(),
		onDecoded: (buffer) => void this.#measure(buffer),
	});
	drop = new Drop(ACCEPT, (file) => this.intake.load(file));

	@tracked measured: Measurement | null = null;
	@tracked target = -14;
	@tracked result: Blob | null = null;
	@tracked resultUrl = '';
	@tracked resultLufs = 0;
	@tracked busy = false;
	@tracked failed = false;

	#token = 0;

	willDestroy() {
		super.willDestroy();
		this.#token++;
		this.#releaseResult();
	}

	get loaded() {
		return this.intake.fileName !== '';
	}

	get plan() {
		const m = this.measured;
		return m ? planGain(m.lufs, m.peakDb, this.target) : null;
	}

	get targetIndex() {
		return TARGETS.findIndex((t) => t.lufs === this.target);
	}

	get hint() {
		return TARGETS[this.targetIndex]?.hint ?? '';
	}

	get unreadable() {
		return this.loaded && !!this.intake.error;
	}

	get measuring() {
		return this.loaded && !this.intake.error && !this.measured;
	}

	get detail() {
		if (this.intake.error) return this.intake.error;
		const buffer = this.intake.buffer;
		if (!buffer) return formatBytes(this.intake.fileBytes);
		return `${buffer.duration.toFixed(2)} s · ${buffer.sampleRate} Hz · ${buffer.numberOfChannels} ch`;
	}

	get tiles() {
		const m = this.measured;
		const plan = this.plan;
		if (!this.loaded) return blankTiles;
		if (!m || !plan) return [];
		return [
			{
				label: 'Loudness',
				value: db(m.lufs, 'LUFS'),
				level: level(m.lufs),
			},
			{
				label: 'Peak',
				value: db(m.peakDb, 'dBFS'),
				level: level(m.peakDb),
			},
			{ label: 'Gain', value: signed(plan.gainDb) },
			{
				label: 'Output peak',
				value: db(plan.outPeakDb, 'dBFS'),
				level: level(plan.outPeakDb),
			},
		];
	}

	get ready() {
		return !!this.plan && !this.busy && !!this.intake.buffer;
	}

	get baseName() {
		return this.intake.baseName || 'audio';
	}

	get fileName() {
		return `${this.baseName}-normalised.wav`;
	}

	get resultRow() {
		if (!this.result) return null;
		return {
			name: this.fileName,
			detail: `wav · ${formatBytes(this.result.size)} · ${db(this.resultLufs, 'LUFS')}`,
		};
	}

	async #measure(buffer: AudioBuffer) {
		const token = ++this.#token;
		await new Promise((resolve) => setTimeout(resolve, 0));
		if (this.isDestroyed || token !== this.#token) return;
		const channels = channelsOf(buffer);
		this.measured = {
			lufs: integratedLufs(channels, buffer.sampleRate),
			peakDb: peakDb(channels),
			peaks: extractPeaks(channels, peakBuckets),
		};
	}

	pickTarget = (index: number) => {
		const lufs = TARGETS[index]?.lufs;
		if (lufs === undefined || lufs === this.target) return;
		this.target = lufs;
		this.failed = false;
		this.#releaseResult();
	};

	normalise = () => void this.#normalise();

	async #normalise() {
		const buffer = this.intake.buffer;
		const plan = this.plan;
		if (!buffer || !plan || !this.ready) return;
		const token = this.#token;
		this.busy = true;
		this.failed = false;
		this.#releaseResult();
		await new Promise((resolve) => setTimeout(resolve, 0));
		if (this.isDestroyed || token !== this.#token) return;
		try {
			const wav = encodeWav(
				channelsOf(buffer),
				buffer.sampleRate,
				dbToGain(plan.gainDb),
			);
			this.result = new Blob([wav], { type: 'audio/wav' });
			this.resultUrl = URL.createObjectURL(this.result);
			this.resultLufs = this.measured!.lufs + plan.gainDb;
		} catch (error) {
			console.error('Normalise failed:', error);
			this.failed = true;
		}
		this.busy = false;
	}

	save = () => {
		if (this.result) downloadBlob(this.result, this.fileName);
	};

	#releaseResult() {
		const url = this.resultUrl;
		this.resultUrl = '';
		if (url) setTimeout(() => URL.revokeObjectURL(url));
		this.result = null;
	}

	#reset() {
		this.#token++;
		this.#releaseResult();
		this.measured = null;
		this.busy = false;
		this.failed = false;
	}

	clear = () => {
		this.#reset();
		this.intake.clear();
	};

	<template>
		<CanonSplit
			class="audio-normaliser"
			{{filePaste this.intake.load accept=ACCEPT}}
			{{on "dragover" this.drop.enter}}
			{{on "dragleave" this.drop.leave}}
			{{on "drop" this.drop.drop}}
		>
			<:banner>
				<CanonCanvas
					@height={{bandHeight}}
					@background="var(--canon-muted)"
				>
					<Picture
						@peaks={{if
							this.measured
							this.measured.peaks
							null
						}}
						@gainDb={{if
							this.plan
							this.plan.gainDb
							null
						}}
						@limited={{if
							this.plan.limited
							true
							false
						}}
						@blank={{if
							this.loaded
							false
							true
						}}
					/>
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Source" />
					{{#if this.loaded}}
						<CanonRow
							class="an-source"
							@title={{this.intake.fileName}}
							@detail={{this.detail}}
							@form="flush"
						>
							<CanonButton
								@kind="cell"
								@text="Clear"
								@icon={{Trash}}
								@onClick={{this.clear}}
							/>
						</CanonRow>
					{{else}}
						<Slot
							class="an-slot"
							@prompt="Drop an audio file"
							@icon="gauge"
							@row={{true}}
							@accept={{ACCEPT}}
							@over={{this.drop.over}}
							@onFile={{this.intake.load}}
						/>
						{{#if this.intake.error}}
							<CanonStatus
								@text={{this.intake.error}}
								@tone="warn"
								@row={{true}}
							/>
						{{/if}}
					{{/if}}
					<CanonRow
						class="an-target"
						@title="Target (LUFS)"
						@detail={{this.hint}}
						@form="stacked"
					>
						<CanonSegmented
							class="an-targets"
							@items={{targetLabels}}
							@selected={{this.targetIndex}}
							@disabled={{this.busy}}
							@onChange={{this.pickTarget}}
						/>
					</CanonRow>
					<Job
						@title="Normalise"
						@icon={{Gauge}}
						@failure={{WRITE_ERROR}}
						@disabled={{if
							this.ready
							false
							true
						}}
						@busy={{this.busy}}
						@failed={{this.failed}}
						@result={{this.resultRow}}
						@onRun={{this.normalise}}
						@onSave={{this.save}}
					/>
					{{#if this.resultUrl}}
						{{! template-lint-disable require-media-caption }}
						<audio
							class="an-player"
							src={{this.resultUrl}}
							controls
						></audio>
					{{/if}}
				</CanonRows>
			</:sidebar>
			<:main>
				{{#unless this.unreadable}}
					<CanonRows
						class="an-readings"
						@framed={{true}}
					>
						{{#if this.measuring}}
							<CanonRow
								class="an-measuring"
								@title="Measuring…"
							>
								<CanonLoader
									@cell={{5}}
									@gap={{1}}
								/>
							</CanonRow>
						{{else}}
							<CanonHeading
								@text="Loudness"
							/>
							<CanonTiles
								@items={{this.tiles}}
							/>
							{{#if
								this.plan.limited
							}}
								<CanonEmptyRow
									@text={{LIMITED_NOTE}}
								/>
							{{/if}}
						{{/if}}
					</CanonRows>
				{{/unless}}
			</:main>
		</CanonSplit>
	</template>
}
