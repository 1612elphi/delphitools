import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { eq } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import NdsLoader from 'delphitools-v2/components/ui/nds-loader';
import DownloadLabel from 'delphitools-v2/components/download-label';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import { downloadBlob } from 'delphitools-v2/lib/download';
import { formatBytes } from 'delphitools-v2/lib/image-compress';
import {
	AudioIntake,
	channelsOf,
	encodeWav,
	integratedLufs,
	peakDb,
} from 'delphitools-v2/lib/audio';
import { dbToGain, planGain } from 'delphitools-v2/lib/normalise';
import { AUDIO_ACCEPT, acceptAttr } from 'delphitools-v2/lib/tools';

const ACCEPT = acceptAttr(AUDIO_ACCEPT);

const TARGETS: { lufs: number; label: string; hint: string }[] = [
	{ lufs: -14, label: '-14', hint: 'Streaming' },
	{ lufs: -16, label: '-16', hint: 'Podcast' },
	{ lufs: -23, label: '-23', hint: 'Broadcast' },
];

const DROP_TITLE = 'Drop an audio file';

const LIMITED_NOTE = 'Gain capped at -1 dBFS peak';

const db = (value: number, unit: string) =>
	Number.isFinite(value) ? `${value.toFixed(1)} ${unit}` : '–';
const signed = (value: number) =>
	`${value >= 0 ? '+' : ''}${value.toFixed(1)} dB`;

interface Measurement {
	lufs: number;
	peakDb: number;
}

export default class AudioNormaliserTool extends Component {
	intake = new AudioIntake({
		onLoad: () => this.#reset(),
		onDecoded: (buffer) => void this.#measure(buffer),
	});

	@tracked measured: Measurement | null = null;
	@tracked target = -14;
	@tracked result: Blob | null = null;
	@tracked resultUrl = '';
	@tracked resultLufs = 0;
	@tracked busy = false;

	#token = 0;

	willDestroy() {
		super.willDestroy();
		this.#token++;
		this.#releaseResult();
	}

	get hasFile() {
		return this.intake.fileName !== '';
	}

	get plan() {
		const m = this.measured;
		if (!m) return null;
		return planGain(m.lufs, m.peakDb, this.target);
	}

	get rows() {
		const m = this.measured;
		const plan = this.plan;
		if (!m || !plan) return [];
		return [
			{ label: 'Loudness', value: db(m.lufs, 'LUFS') },
			{ label: 'Peak', value: db(m.peakDb, 'dBFS') },
			{ label: 'Gain', value: signed(plan.gainDb) },
			{
				label: 'Output peak',
				value: db(plan.outPeakDb, 'dBFS'),
			},
		];
	}

	get status() {
		if (this.intake.busy || (this.intake.buffer && !this.measured))
			return 'Measuring…';
		if (this.plan?.limited) return LIMITED_NOTE;
		return '';
	}

	get ready() {
		return !!this.plan && !this.busy && !!this.intake.buffer;
	}

	get baseName() {
		return this.intake.baseName || 'audio';
	}

	get resultLabel() {
		if (!this.result) return '';
		return `wav · ${formatBytes(this.result.size)} · ${db(this.resultLufs, 'LUFS')}`;
	}

	// One macrotask, so the bar and rows paint before the O(n) LUFS pass.
	async #measure(buffer: AudioBuffer) {
		const token = ++this.#token;
		await new Promise((resolve) => setTimeout(resolve, 0));
		if (this.isDestroyed || token !== this.#token) return;
		const channels = channelsOf(buffer);
		this.measured = {
			lufs: integratedLufs(channels, buffer.sampleRate),
			peakDb: peakDb(channels),
		};
	}

	setTarget = (lufs: number) => {
		this.target = lufs;
		this.#releaseResult();
	};

	normalise = () => void this.#normalise();

	async #normalise() {
		const buffer = this.intake.buffer;
		const plan = this.plan;
		if (!buffer || !plan || !this.ready) return;
		const token = this.#token;
		this.busy = true;
		this.#releaseResult();
		await new Promise((resolve) => setTimeout(resolve, 0));
		if (this.isDestroyed || token !== this.#token) return;
		// One pass: the gain rides inside the WAV writer. The reported loudness
		// is measured + gain; only the -70 LUFS absolute gate could move it, on
		// near-silent programme.
		const wav = encodeWav(
			channelsOf(buffer),
			buffer.sampleRate,
			dbToGain(plan.gainDb),
		);
		this.result = new Blob([wav], { type: 'audio/wav' });
		this.resultUrl = URL.createObjectURL(this.result);
		this.resultLufs = this.measured!.lufs + plan.gainDb;
		this.busy = false;
	}

	download = () => {
		if (!this.result) return;
		downloadBlob(this.result, `${this.baseName}-normalised.wav`);
	};

	#releaseResult() {
		if (this.resultUrl) URL.revokeObjectURL(this.resultUrl);
		this.resultUrl = '';
		this.result = null;
	}

	#reset() {
		this.#token++;
		this.#releaseResult();
		this.measured = null;
		this.busy = false;
	}

	clear = () => {
		this.#reset();
		this.intake.clear();
	};

	<template>
		<div class="dt-an" {{filePaste this.intake.load accept=ACCEPT}}>
			<div
				class="dt-an-frame"
				{{on "drop" this.intake.drop}}
				{{on "dragover" this.intake.dragOver}}
			>
				<div class="dt-an-bar">
					<label
						class="dt-an-file"
						aria-label="Open audio file"
					>
						<input
							type="file"
							class="dt-sr-only"
							accept={{ACCEPT}}
							{{on
								"change"
								this.intake.chooseFile
							}}
						/>
						<Icon @name="audio-lines" />
						<span
							class="dt-an-filename"
						>{{if
								this.intake.fileName
								this.intake.fileName
								"Choose audio"
							}}</span>
					</label>
					{{#if this.status}}
						<span
							class="dt-an-status"
							role="status"
						>{{this.status}}</span>
					{{/if}}
					<button
						type="button"
						class="dt-an-go"
						disabled={{unless
							this.ready
							true
						}}
						aria-busy={{if
							this.busy
							"true"
							"false"
						}}
						{{on "click" this.normalise}}
					>
						{{#if this.busy}}
							<NdsLoader />
						{{else}}
							<Icon @name="gauge" />
						{{/if}}
						<span>Normalise</span>
					</button>
					<button
						type="button"
						class="dt-an-clear"
						disabled={{unless
							this.hasFile
							true
						}}
						aria-label="Clear"
						{{on "click" this.clear}}
					>
						<Icon @name="x" />
					</button>
				</div>

				<div class="dt-an-settings">
					<div class="dt-an-set">
						<span class="dt-an-label">Target
							(LUFS)</span>
						<div
							class="segmented dt-an-targets"
						>
							{{#each
								TARGETS
								key="lufs"
								as |t|
							}}
								<button
									type="button"
									class="dt-an-seg
										{{if
											(eq
												this.target
												t.lufs
											)
											'is-active'
										}}"
									aria-pressed={{if
										(eq
											this.target
											t.lufs
										)
										"true"
										"false"
									}}
									title={{t.hint}}
									{{on
										"click"
										(fn
											this.setTarget
											t.lufs
										)
									}}
								>
									<span
									>{{t.label}}</span>
									<small
									>{{t.hint}}</small>
								</button>
							{{/each}}
						</div>
					</div>
				</div>

				{{#if this.rows.length}}
					<dl class="dt-an-meta">
						{{#each
							this.rows key="label"
							as |row|
						}}
							<div class="dt-an-cell">
								<dt
								>{{row.label}}</dt>
								<dd
								>{{row.value}}</dd>
							</div>
						{{/each}}
					</dl>
				{{else}}{{#unless this.hasFile}}
						<label class="dt-an-drop">
							<input
								type="file"
								class="dt-sr-only"
								accept={{ACCEPT}}
								{{on
									"change"
									this.intake.chooseFile
								}}
							/>
							<Icon @name="gauge" />
							<span
								class="dt-an-drop-title"
							>{{DROP_TITLE}}</span>
							{{! hint reused verbatim from Background Remover }}
							<span
								class="dt-an-drop-hint"
							>or click to select a
								file, or paste</span>
						</label>
					{{/unless}}{{/if}}

				{{#if this.result}}
					<div class="dt-an-out">
						<span
							class="dt-an-out-label"
						>Result</span>
						{{! the normalised render, so it can be checked by ear }}
						{{! template-lint-disable require-media-caption }}
						<audio
							class="dt-an-player"
							src={{this.resultUrl}}
							controls
						></audio>
						<span
							class="dt-an-result-label"
						>{{this.resultLabel}}</span>
						<button
							type="button"
							class="dt-an-btn is-primary"
							{{on
								"click"
								this.download
							}}
						>
							<DownloadLabel />
						</button>
					</div>
				{{/if}}

				{{#if this.intake.error}}
					<p
						class="dt-an-error"
						role="alert"
					>{{this.intake.error}}</p>
				{{/if}}
			</div>
		</div>
	</template>
}
