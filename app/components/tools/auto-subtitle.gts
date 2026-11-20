import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import type Owner from '@ember/owner';
import { service } from '@ember/service';
import CanonBar from 'delphicanon/components/canon-bar';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonDialog from 'delphicanon/components/canon-dialog';
import CanonDropZone from 'delphicanon/components/canon-drop-zone';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonLoader from 'delphicanon/components/canon-loader';
import CanonPopover from 'delphicanon/components/canon-popover';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import type CanonToastService from 'delphicanon/services/canon-toast';
import { IconSvg } from 'delphitools-v2/components/icon';
import CueRow from 'delphitools-v2/components/tools/media/cue-row';
import { peakBuckets } from 'delphitools-v2/components/tools/media/frames';
import LanguagePick from 'delphitools-v2/components/tools/auto-subtitle/language-pick';
import Picture from 'delphitools-v2/components/tools/auto-subtitle/picture';
import {
	MIME,
	altered,
	failure,
	output,
	outputName,
	stats,
	type Failure,
} from 'delphitools-v2/components/tools/auto-subtitle/result';
import filePaste, { matchesAccept } from 'delphitools-v2/modifiers/file-paste';
import {
	audioContext,
	channelsOf,
	extractPeaks,
	type WaveformPeaks,
} from 'delphitools-v2/lib/audio';
import { downloadText } from 'delphitools-v2/lib/download';
import { downloadIcon, passAlong } from 'delphitools-v2/lib/flow-hooks';
import {
	parseSubtitles,
	type Cue,
	type SubtitleFormat,
} from 'delphitools-v2/lib/subtitles';
import {
	AUDIO_ACCEPT,
	VIDEO_ACCEPT,
	acceptAttr,
} from 'delphitools-v2/lib/tools';
import { MODELS, transcribe, type Mode } from 'delphitools-v2/lib/transcribe';
import { bandHeight } from 'delphitools-v2/components/tools/media/strips';
import './media/media.css';
import './auto-subtitle/auto-subtitle.css';

const ACCEPT = acceptAttr([...AUDIO_ACCEPT, ...VIDEO_ACCEPT]);
const FORMATS: SubtitleFormat[] = ['srt', 'vtt'];
const FORMAT_LABELS = ['SRT', 'VTT'];
const MODES: Mode[] = ['fast', 'reasonable', 'accurate'];
const MODE_LABELS = ['Rough', 'Decent', 'Experimental'];

const DROP_TITLE = 'Drop an audio or video file';
const FAILURES: Record<Exclude<Failure, ''>, string> = {
	decode: "Couldn't read that file, try WAV or MP4",
	webgpu: 'WebGPU required',
	generic: 'Transcription failed. Try again',
};
const EXPERIMENTAL_WARNING =
	'This will download 760 MB of engine files to work, and needs a pretty beefy computer, are you sure?';

const Wave = <template><IconSvg @name="audio-waveform" /></template>;
const Trash = <template><IconSvg @name="trash-2" /></template>;
const Captions = <template><IconSvg @name="captions" /></template>;
const Cancel = <template><IconSvg @name="x" /></template>;
const Info = <template><IconSvg @name="info" /></template>;
const Copy = <template><IconSvg @name="copy" /></template>;
const Save = <template><IconSvg @name={{(downloadIcon)}} /></template>;

const keepPaste = (event: Event) => event.stopPropagation();

const device = () =>
	typeof navigator !== 'undefined' && 'gpu' in navigator
		? 'webgpu'
		: 'wasm';

const MODEL_ROWS = MODES.map((id, index) => ({
	label: MODE_LABELS[index]!,
	name: MODELS[id].name,
	href: `https://huggingface.co/${MODELS[id].model}`,
	size: `${MODELS[id].sizeMb[device()]} MB`,
}));

const flag = (query: URLSearchParams, key: string) => {
	const value = Number(query.get(key));
	return query.has(key) && Number.isInteger(value) ? value : undefined;
};

export default class AutoSubtitleTool extends Component {
	@service('canon-toast') declare toast: CanonToastService;

	@tracked file: File | null = null;
	@tracked peaks: WaveformPeaks | null = null;
	@tracked duration = 0;
	@tracked detail = '';
	@tracked mode: Mode = 'reasonable';
	@tracked language = '';
	@tracked target: SubtitleFormat = 'srt';
	@tracked busy = false;
	@tracked percent = 0;
	@tracked problem: Failure = '';
	@tracked cues: Cue[] = [];
	@tracked original: Cue[] = [];
	@tracked finished = false;
	@tracked warning = false;
	@tracked refused = 0;

	#token = 0;
	#scan = 0;
	#experimentalOk = false;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		const mode = MODES[flag(query, 'asMode') ?? -1];
		if (mode) this.mode = mode;
		const format = FORMATS[flag(query, 'asFormat') ?? -1];
		if (format) this.target = format;
		const cues = parseSubtitles(query.get('asCues') ?? '');
		if (cues.length) {
			this.cues = cues;
			this.original = cues;
			this.finished = true;
		}
		this.warning = query.get('asOffer') === 'yes';
		const sample = query.get('asSample');
		if (sample?.startsWith('/') && !sample.startsWith('//'))
			void this.#fetchSample(sample);
	}

	async #fetchSample(url: string) {
		const response = await fetch(url).catch(() => null);
		if (!response?.ok || this.isDestroying) return;
		const blob = await response.blob();
		const name = url.split('/').pop() || 'audio';
		this.#open(new File([blob], name, { type: blob.type }), false);
	}

	willDestroy() {
		super.willDestroy();
		this.#token++;
		this.#scan++;
	}

	get fileName() {
		return this.file?.name ?? '';
	}

	get modeIndex() {
		return MODES.indexOf(this.mode);
	}

	get formatIndex() {
		return FORMATS.indexOf(this.target);
	}

	get modeKeys() {
		return [this.refused];
	}

	get model() {
		return MODEL_ROWS[this.modeIndex]!;
	}

	get unready() {
		return !this.file || this.busy;
	}

	get showsResult() {
		return this.busy || this.finished;
	}

	get hasCues() {
		return this.cues.length > 0;
	}

	get noCues() {
		return this.finished && !this.busy && !this.hasCues;
	}

	get downloading() {
		return this.percent > 0 && this.percent < 100;
	}

	get status() {
		return this.downloading
			? `Downloading… ${this.percent}%`
			: 'Transcribing…';
	}

	get share() {
		return this.percent / 100;
	}

	get problemText() {
		return this.problem ? FAILURES[this.problem] : '';
	}

	@cached
	get output() {
		return output(this.cues, this.target);
	}

	get stats() {
		return stats(this.cues);
	}

	get figure() {
		if (this.busy)
			return this.downloading ? String(this.percent) : '';
		return this.hasCues ? String(this.cues.length) : '';
	}

	get unit() {
		return this.busy ? '%' : 'cues';
	}

	get pictureLabel() {
		return this.stats || this.fileName;
	}

	get downloadText() {
		return passAlong('Download');
	}

	isAltered = (cue: Cue, index: number) =>
		altered(this.original, cue, index);

	#reset() {
		this.#token++;
		this.busy = false;
		this.percent = 0;
		this.problem = '';
		this.cues = [];
		this.original = [];
		this.finished = false;
	}

	#open(file: File, reset = true) {
		if (reset) this.#reset();
		this.file = file;
		this.peaks = null;
		this.duration = 0;
		this.detail = '';
		void this.#decode(file, ++this.#scan);
	}

	load = (file: File) => this.#open(file);

	loadFiles = (files: File[]) => {
		if (files[0]) this.load(files[0]);
	};

	async #decode(file: File, scan: number) {
		try {
			const buffer = await audioContext().decodeAudioData(
				await file.arrayBuffer(),
			);
			if (scan !== this.#scan) return;
			this.peaks = extractPeaks(
				channelsOf(buffer),
				peakBuckets,
			);
			this.duration = buffer.duration;
			this.detail = `${buffer.duration.toFixed(2)} s · ${buffer.sampleRate} Hz · ${buffer.numberOfChannels} ch`;
		} catch {
			// no waveform; the run reports what it cannot read
		}
	}

	allowDrop = (event: DragEvent) => {
		if (event.dataTransfer?.types.includes('Files'))
			event.preventDefault();
	};

	dropAnywhere = (event: DragEvent) => {
		if (event.defaultPrevented) return;
		const file = [...(event.dataTransfer?.files ?? [])].find((f) =>
			matchesAccept(f, ACCEPT),
		);
		if (!file) return;
		event.preventDefault();
		this.load(file);
	};

	clear = () => {
		this.#reset();
		this.#scan++;
		this.file = null;
		this.peaks = null;
		this.duration = 0;
		this.detail = '';
	};

	pickMode = (index: number) => {
		const mode = MODES[index];
		if (!mode) return;
		if (mode === 'accurate' && !this.#experimentalOk) {
			this.warning = true;
			return;
		}
		this.mode = mode;
		this.problem = '';
	};

	closeWarning = (returnValue: string) => {
		this.warning = false;
		if (returnValue !== 'confirm') {
			this.refused++;
			return;
		}
		this.#experimentalOk = true;
		this.mode = 'accurate';
		this.problem = '';
	};

	setLanguage = (code: string) => {
		this.language = code;
	};

	pickFormat = (index: number) => {
		this.target = FORMATS[index] ?? 'srt';
	};

	run = () => void this.#run();

	async #run() {
		const file = this.file;
		if (!file || this.busy) return;
		this.#reset();
		const token = this.#token;
		this.busy = true;
		try {
			const cues = await transcribe(file, {
				mode: this.mode,
				language: this.language || undefined,
				onProgress: (p) => {
					if (token === this.#token)
						this.percent = p;
				},
			});
			if (token !== this.#token) return;
			this.cues = cues;
			this.original = cues;
			this.finished = true;
		} catch (error) {
			if (token !== this.#token) return;
			console.error('Transcription failed:', error);
			this.problem = failure(error);
		} finally {
			if (token === this.#token) {
				this.busy = false;
				this.percent = 0;
			}
		}
	}

	// ponytail: drops the run; a model download in flight keeps going in the background
	cancel = () => this.#reset();

	editCue = (index: number, cue: Cue) => {
		const next = this.cues.slice();
		next[index] = cue;
		this.cues = next;
	};

	copy = () => void this.toast.copy(this.output);

	download = () => {
		if (!this.output) return;
		downloadText(
			this.output,
			outputName(this.fileName, this.target),
			MIME[this.target],
		);
	};

	<template>
		<CanonSplit
			class="auto-subtitle"
			@collapsesTo={{72}}
			@mainLeadsStacked={{true}}
			@footerHidden={{if this.hasCues false true}}
			{{filePaste this.load accept=ACCEPT}}
			{{on "dragover" this.allowDrop}}
			{{on "drop" this.dropAnywhere}}
		>
			<:banner>
				<CanonCanvas
					@height={{bandHeight}}
					@background="var(--canon-muted)"
				>
					<Picture
						@peaks={{this.peaks}}
						@duration={{this.duration}}
						@cues={{this.cues}}
						@done={{this.finished}}
						@figure={{this.figure}}
						@unit={{this.unit}}
						@label={{this.pictureLabel}}
					/>
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<CanonRows class="as-controls" @framed={{true}}>
					<CanonHeading @text="Model" />
					{{#each this.modeKeys key="@identity"}}
						<CanonSegmented
							class="as-mode"
							aria-label="Model"
							@items={{MODE_LABELS}}
							@selected={{this.modeIndex}}
							@disabled={{this.busy}}
							@onChange={{this.pickMode}}
						/>
					{{/each}}
					<CanonRow
						class="as-model"
						@title={{this.model.name}}
						@detail={{this.model.size}}
						@form="flush"
					>
						<CanonPopover
							class="as-models"
							@placement="bottom-end"
						>
							<:trigger as |p|>
								<CanonButton
									class="as-models-open"
									@kind="cell"
									@label="Models used"
									@icon={{Info}}
									{{p.trigger}}
								/>
							</:trigger>
							<:content>
								<CanonRows
									class="as-models-panel"
									role="dialog"
									aria-label="Models used"
									@framed={{true}}
								>
									{{#each
										MODEL_ROWS
										as |row|
									}}
										<CanonRow
											class="as-models-row"
											@title={{row.label}}
											@detail={{row.size}}
										>
											<a
												class="as-models-link"
												href={{row.href}}
												target="_blank"
												rel="noopener noreferrer"
											>{{row.name}}</a>
										</CanonRow>
									{{/each}}
									<CanonStatus
										@text="Experimental requires WebGPU"
										@tone="muted"
										@row={{true}}
									/>
								</CanonRows>
							</:content>
						</CanonPopover>
					</CanonRow>
					<CanonHeading @text="Language" />
					<LanguagePick
						@value={{this.language}}
						@disabled={{this.busy}}
						@onChange={{this.setLanguage}}
					/>
					<CanonHeading @text="Format" />
					<CanonSegmented
						class="as-format"
						aria-label="Format"
						@items={{FORMAT_LABELS}}
						@selected={{this.formatIndex}}
						@disabled={{this.busy}}
						@onChange={{this.pickFormat}}
					/>
					<CanonButton
						class="as-run"
						@kind="primary"
						@text="Transcribe"
						@icon={{Captions}}
						@iconStyle="oversized"
						@disabled={{this.unready}}
						@onClick={{this.run}}
					/>
					{{#if this.problemText}}
						<CanonStatus
							class="as-problem"
							role="alert"
							@text={{this.problemText}}
							@tone="warn"
							@row={{true}}
						/>
					{{/if}}
				</CanonRows>
				<CanonDialog
					class="as-warning"
					@open={{this.warning}}
					@message={{EXPERIMENTAL_WARNING}}
					@onClose={{this.closeWarning}}
					aria-label="Experimental mode"
				>
					<:header>
						<img
							class="as-warning-art"
							src="/art/760mb.webp"
							width="960"
							height="435"
							alt=""
						/>
					</:header>
					<:footer as |close|>
						<CanonButton
							class="as-warning-cancel"
							@text="Cancel"
							@onClick={{fn
								close
								"cancel"
							}}
						/>
						<CanonButton
							class="as-warning-proceed"
							@kind="primary"
							@text="Proceed"
							@onClick={{fn
								close
								"confirm"
							}}
						/>
					</:footer>
				</CanonDialog>
			</:sidebar>
			<:main>
				<CanonRows class="as-source" @framed={{true}}>
					<CanonHeading @text="Source" />
					{{#if this.file}}
						<CanonRow
							class="as-file"
							@title={{this.fileName}}
							@detail={{this.detail}}
							@form="flush"
						>
							<CanonButton
								class="as-clear"
								@kind="cell"
								@text="Clear"
								@icon={{Trash}}
								@onClick={{this.clear}}
							/>
						</CanonRow>
					{{else}}
						<CanonDropZone
							class="as-drop"
							@prompt={{DROP_TITLE}}
							@icon={{Wave}}
							@accept={{ACCEPT}}
							@paste={{false}}
							@onFiles={{this.loadFiles}}
							{{on "paste" keepPaste}}
						/>
					{{/if}}
				</CanonRows>
				{{#if this.showsResult}}
					<CanonRows
						class="as-result"
						@framed={{true}}
					>
						<CanonHeading
							@text="Subtitles"
						/>
						{{#if this.busy}}
							<CanonRow
								class="as-busy"
								@title={{this.status}}
							>
								<span
									class="as-busy-cell"
								>
									<CanonLoader
										@cell={{5}}
										@gap={{1}}
									/>
									{{#if
										this.downloading
									}}
										<span
											role="status"
										>{{this.percent}}%</span>
									{{/if}}
								</span>
							</CanonRow>
							{{#if this.downloading}}
								<CanonBar
									class="as-bar"
									role="progressbar"
									aria-label="Progress"
									aria-valuemin="0"
									aria-valuemax="100"
									aria-valuenow={{this.percent}}
									@share={{this.share}}
								/>
							{{/if}}
							<CanonButton
								class="as-cancel"
								@text="Cancel"
								@icon={{Cancel}}
								@onClick={{this.cancel}}
							/>
						{{else if this.noCues}}
							<CanonStatus
								class="as-empty"
								@text="No cues found."
								@tone="warn"
								@row={{true}}
							/>
						{{else}}
							<CanonRow
								class="as-stats"
								@title={{this.stats}}
							/>
							{{#each
								this.cues
								key="@index"
								as |cue index|
							}}
								<CueRow
									@index={{index}}
									@cue={{cue}}
									@editable={{true}}
									@marked={{this.isAltered
										cue
										index
									}}
									@onChange={{fn
										this.editCue
										index
									}}
								/>
							{{/each}}
						{{/if}}
					</CanonRows>
				{{/if}}
			</:main>
			<:footer>
				<CanonGrid class="as-actions">
					<CanonButton
						class="as-copy"
						aria-label="Copy subtitles"
						@text="Copy"
						@icon={{Copy}}
						@onClick={{this.copy}}
					/>
					<CanonButton
						class="as-download"
						@kind="primary"
						@text={{this.downloadText}}
						@icon={{Save}}
						@onClick={{this.download}}
					/>
				</CanonGrid>
			</:footer>
		</CanonSplit>
	</template>
}
