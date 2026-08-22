import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import Icon from 'delphitools-v2/components/icon';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import { VideoIntake } from 'delphitools-v2/lib/video';
import { VIDEO_ACCEPT, acceptAttr } from 'delphitools-v2/lib/tools';
import {
	analyzeMedia,
	reportText,
	sections,
	type Track,
} from 'delphitools-v2/lib/mediainfo';

const ACCEPT = acceptAttr(VIDEO_ACCEPT);
const COPIED_MS = 1500;

const DROP_TITLE = 'Drop a video here';

const READ_ERROR = "Couldn't read that file's container";

export default class VideoAtlasTool extends Component {
	intake = new VideoIntake({
		onLoad: (file) => void this.#analyze(file),
	});

	@tracked tracks: Track[] = [];
	@tracked busy = false;
	@tracked errorCode = '';
	@tracked copied = false;

	#token = 0;
	#copiedTimer?: ReturnType<typeof setTimeout>;

	willDestroy() {
		super.willDestroy();
		this.#token++;
		clearTimeout(this.#copiedTimer);
		this.intake.release();
	}

	get hasVideo() {
		return this.intake.url !== null;
	}

	@cached
	get sections() {
		return sections(this.tracks);
	}

	get streamSummary() {
		const n = this.sections.filter(
			(s) => s.type !== 'General',
		).length;
		if (!n) return '';
		return n === 1 ? '1 stream' : `${n} streams`;
	}

	get errorMessage() {
		if (this.intake.error) return this.intake.error;
		if (this.errorCode === 'read') return READ_ERROR;
		return '';
	}

	async #analyze(file: File) {
		const token = ++this.#token;
		this.busy = true;
		this.tracks = [];
		this.errorCode = '';
		try {
			const tracks = await analyzeMedia(file);
			if (token !== this.#token) return;
			this.tracks = tracks;
		} catch (error) {
			if (token !== this.#token) return;
			console.error('MediaInfo failed:', error);
			this.errorCode = 'read';
		} finally {
			if (token === this.#token) this.busy = false;
		}
	}

	copy = () => void this.#copy();

	async #copy() {
		if (this.tracks.length === 0) return;
		await navigator.clipboard.writeText(reportText(this.tracks));
		this.copied = true;
		clearTimeout(this.#copiedTimer);
		this.#copiedTimer = setTimeout(
			() => (this.copied = false),
			COPIED_MS,
		);
	}

	clear = () => {
		this.#token++;
		this.intake.clear();
		this.tracks = [];
		this.busy = false;
		this.errorCode = '';
	};

	<template>
		<div class="dt-va" {{filePaste this.intake.load accept=ACCEPT}}>
			<div
				class="dt-va-frame"
				{{on "drop" this.intake.drop}}
				{{on "dragover" this.intake.dragOver}}
			>
				<div class="dt-va-bar">
					<label
						class="dt-va-file"
						aria-label="Open video file"
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
						<Icon @name="film" />
						<span
							class="dt-va-filename"
						>{{if
								this.intake.fileName
								this.intake.fileName
								"Choose video"
							}}</span>
					</label>
					{{#if this.busy}}
						<span
							class="dt-va-status"
							role="status"
						>Reading…</span>
					{{else if this.streamSummary}}
						<span
							class="dt-va-status"
						>{{this.streamSummary}}</span>
					{{/if}}
					<button
						type="button"
						class="dt-va-btn"
						disabled={{unless
							this.tracks.length
							true
						}}
						{{on "click" this.copy}}
					>
						<Icon
							@name={{if
								this.copied
								"check"
								"copy"
							}}
						/>
						<span>Copy report</span>
					</button>
					<button
						type="button"
						class="dt-va-clear"
						disabled={{unless
							this.hasVideo
							true
						}}
						aria-label="Clear"
						{{on "click" this.clear}}
					>
						<Icon @name="x" />
					</button>
				</div>

				<div class="dt-va-stage">
					{{#if this.hasVideo}}
						{{! user-supplied video; there is no caption track to offer }}
						{{! template-lint-disable require-media-caption }}
						<video
							src={{this.intake.url}}
							controls
							playsinline
							preload="metadata"
							{{this.intake.register}}
							{{on
								"loadedmetadata"
								this.intake.ready
							}}
							{{on
								"error"
								this.intake.failed
							}}
						></video>
					{{else}}
						<label class="dt-va-drop">
							<input
								type="file"
								class="dt-sr-only"
								accept={{ACCEPT}}
								{{on
									"change"
									this.intake.chooseFile
								}}
							/>
							<Icon @name="film" />
							<span
								class="dt-va-drop-title"
							>{{DROP_TITLE}}</span>
							{{! hint reused verbatim from Background Remover }}
							<span
								class="dt-va-drop-hint"
							>or click to select a
								file, or paste</span>
						</label>
					{{/if}}
				</div>

				{{#each this.sections key="title" as |panel|}}
					<section class="dt-va-panel">
						<h3
							class="dt-va-panel-title"
						>{{panel.title}}</h3>
						<dl class="dt-va-meta">
							{{#each
								panel.rows
								key="label"
								as |row|
							}}
								<div
									class="dt-va-cell"
								>
									<dt
									>{{row.label}}</dt>
									<dd
									>{{row.value}}</dd>
								</div>
							{{/each}}
						</dl>
					</section>
				{{/each}}

				{{#if this.errorMessage}}
					<p
						class="dt-va-error"
						role="alert"
					>{{this.errorMessage}}</p>
				{{/if}}
			</div>
		</div>
	</template>
}
