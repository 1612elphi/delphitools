import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import Icon from 'delphitools-v2/components/icon';
import DownloadLabel from 'delphitools-v2/components/download-label';
import { downloadUrl } from 'delphitools-v2/lib/download';
import { AnimatedGifEncoder } from 'delphitools-v2/lib/gif';
import { formatTimestamp } from 'delphitools-v2/lib/subtitles';
import { seekTo, VideoIntake } from 'delphitools-v2/lib/video';
import { VIDEO_ACCEPT, acceptAttr } from 'delphitools-v2/lib/tools';
import filePaste from 'delphitools-v2/modifiers/file-paste';

/** Kept in step with the registry entry, which routes dropped files. */
const ACCEPT = acceptAttr(VIDEO_ACCEPT);

const TOO_MANY_FRAMES =
	'Over 300 frames. Please lower the fps or shorten the range';
const DROP_TITLE = 'Drop a video here or click to upload';

// Frame cap: 300 frames at 480 px is already a ~150 MB decode pass and a
// GIF nobody should ship.
const MAX_FRAMES = 300;
const DEFAULT_RANGE_S = 5;

export default class VideoToGifTool extends Component {
	@tracked startS = 0;
	@tracked endS = 0;
	@tracked fps = 10;
	@tracked width = 480;
	@tracked busy = false;
	@tracked done = 0;
	@tracked total = 0;
	@tracked gifUrl: string | null = null;
	@tracked gifBytes = 0;
	@tracked gifFrames = 0;
	@tracked capError = '';

	intake = new VideoIntake({
		onLoad: () => {
			this.#releaseGif();
			this.capError = '';
		},
		onReady: () => {
			this.startS = 0;
			this.endS =
				Math.round(
					Math.min(
						this.intake.duration,
						DEFAULT_RANGE_S,
					) * 10,
				) / 10;
		},
	});

	willDestroy() {
		super.willDestroy();
		this.intake.release();
		this.#releaseGif();
	}

	#releaseGif() {
		if (this.gifUrl) URL.revokeObjectURL(this.gifUrl);
		this.gifUrl = null;
	}

	get baseName() {
		return this.intake.baseName || 'clip';
	}

	get meta() {
		if (!this.intake.duration) return '';
		return `${formatTimestamp(this.intake.duration * 1000, '.')} total`;
	}

	get progress() {
		return `${this.done}/${this.total}`;
	}

	get gifMeta() {
		return `${Math.max(1, Math.round(this.gifBytes / 1024))} KB · ${this.gifFrames} frames`;
	}

	get error() {
		return this.intake.error || this.capError;
	}

	#number = (event: Event) =>
		parseFloat((event.target as HTMLInputElement).value);

	setStart = (event: Event) => {
		const value = this.#number(event);
		if (Number.isFinite(value))
			this.startS = Math.max(
				0,
				Math.min(this.intake.duration, value),
			);
	};

	setEnd = (event: Event) => {
		const value = this.#number(event);
		if (Number.isFinite(value))
			this.endS = Math.max(
				0,
				Math.min(this.intake.duration, value),
			);
	};

	setFps = (event: Event) => {
		const value = this.#number(event);
		if (Number.isFinite(value))
			this.fps = Math.max(1, Math.min(50, Math.round(value)));
	};

	setWidth = (event: Event) => {
		const value = this.#number(event);
		if (Number.isFinite(value))
			this.width = Math.max(
				16,
				Math.min(1920, Math.round(value)),
			);
	};

	// intake.drop cannot see busy, and a drop mid-encode would tear the
	// video out from under the seek loop.
	handleDrop = (event: DragEvent) => {
		event.preventDefault();
		if (!this.busy) this.intake.drop(event);
	};

	encode = () => void this.#encode();

	async #encode() {
		const video = this.intake.video;
		if (!video || !this.intake.duration || this.busy) return;

		const start = Math.min(this.startS, this.endS);
		const end = Math.max(this.startS, this.endS);
		const frames = Math.max(
			1,
			Math.round((end - start) * this.fps),
		);
		if (frames > MAX_FRAMES) {
			this.capError = TOO_MANY_FRAMES;
			return;
		}

		this.capError = '';
		this.busy = true;
		this.done = 0;
		this.total = frames;
		video.pause();
		const returnTo = video.currentTime;

		const width = Math.min(this.width, video.videoWidth);
		const height = Math.round(
			(width * video.videoHeight) / video.videoWidth,
		);
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d', {
			willReadFrequently: true,
		});
		if (!ctx) {
			this.busy = false;
			return;
		}

		const encoder = new AnimatedGifEncoder(width, height);
		const delayMs = 1000 / this.fps;

		for (let i = 0; i < frames; i++) {
			await seekTo(video, start + i / this.fps);
			if (this.isDestroyed) return;
			ctx.drawImage(video, 0, 0, width, height);
			encoder.addFrame(
				ctx.getImageData(0, 0, width, height).data,
				delayMs,
			);
			this.done = i + 1;
		}

		const bytes = encoder.finish();
		await seekTo(video, returnTo);
		if (this.isDestroyed) return;

		this.#releaseGif();
		this.gifUrl = URL.createObjectURL(
			new Blob([bytes], { type: 'image/gif' }),
		);
		this.gifBytes = bytes.length;
		this.gifFrames = frames;
		this.busy = false;
	}

	download = () => {
		if (this.gifUrl)
			downloadUrl(this.gifUrl, `${this.baseName}.gif`);
	};

	clear = () => {
		this.intake.clear();
		this.#releaseGif();
		this.capError = '';
	};

	<template>
		<div class="dt-vg" {{filePaste this.intake.load accept=ACCEPT}}>
			<div
				class="dt-vg-frame"
				{{on "drop" this.handleDrop}}
				{{on "dragover" this.intake.dragOver}}
			>
				{{#unless this.intake.url}}
					<label class="dt-vg-drop">
						<input
							type="file"
							accept={{ACCEPT}}
							class="dt-sr-only"
							{{on
								"change"
								this.intake.chooseFile
							}}
						/>
						<Icon @name="upload" />
						<span
							class="dt-vg-drop-title"
						>{{DROP_TITLE}}</span>
					</label>
				{{/unless}}

				{{#if this.intake.url}}
					<div class="dt-vg-bar">
						<div class="dt-vg-info">
							<p
								class="dt-vg-name"
							>{{this.intake.fileName}}</p>
							{{#if this.meta}}
								<p
									class="dt-vg-meta"
								>{{this.meta}}</p>
							{{/if}}
						</div>
						<button
							type="button"
							class="dt-vg-btn"
							disabled={{this.busy}}
							{{on
								"click"
								this.clear
							}}
						>
							<Icon @name="trash-2" />
							Clear
						</button>
						<button
							type="button"
							class="dt-vg-btn is-primary"
							disabled={{this.busy}}
							{{on
								"click"
								this.encode
							}}
						>
							<Icon
								@name="clapperboard"
							/>
							{{#if this.busy}}
								{{this.progress}}
							{{else}}
								Encode GIF
							{{/if}}
						</button>
					</div>

					<div class="dt-vg-settings">
						<label class="dt-vg-field">
							<span>Start (s)</span>
							<input
								type="number"
								min="0"
								step="0.1"
								value={{this.startS}}
								disabled={{this.busy}}
								{{on
									"input"
									this.setStart
								}}
							/>
						</label>
						<label class="dt-vg-field">
							<span>End (s)</span>
							<input
								type="number"
								min="0"
								step="0.1"
								value={{this.endS}}
								disabled={{this.busy}}
								{{on
									"input"
									this.setEnd
								}}
							/>
						</label>
						<label class="dt-vg-field">
							<span>FPS</span>
							<input
								type="number"
								min="1"
								max="50"
								value={{this.fps}}
								disabled={{this.busy}}
								{{on
									"input"
									this.setFps
								}}
							/>
						</label>
						<label class="dt-vg-field">
							<span>Width</span>
							<input
								type="number"
								min="16"
								max="1920"
								step="10"
								value={{this.width}}
								disabled={{this.busy}}
								{{on
									"input"
									this.setWidth
								}}
							/>
						</label>
					</div>

					<div class="dt-vg-stage">
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
					</div>

					{{#if this.gifUrl}}
						<div class="dt-vg-result">
							<img
								src={{this.gifUrl}}
								alt="Encoded GIF"
							/>
							<div
								class="dt-vg-result-bar"
							>
								<span
									class="dt-vg-result-meta"
								>{{this.gifMeta}}</span>
								<button
									type="button"
									class="dt-vg-btn is-primary"
									{{on
										"click"
										this.download
									}}
								>
									<DownloadLabel
									/>
								</button>
							</div>
						</div>
					{{/if}}
				{{/if}}
			</div>

			{{#if this.error}}
				<p
					class="dt-vg-error"
					role="alert"
				>{{this.error}}</p>
			{{/if}}
		</div>
	</template>
}
