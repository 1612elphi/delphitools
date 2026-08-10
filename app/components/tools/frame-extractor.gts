import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import Icon from 'delphitools-v2/components/icon';
import { downloadBlob, downloadUrl } from 'delphitools-v2/lib/download';
import { formatTimestamp } from 'delphitools-v2/lib/subtitles';
import { seekTo, VideoIntake } from 'delphitools-v2/lib/video';

// ∑CG: drop-zone title on the empty frame-extractor
//   spec: one line, imperative, names the input (a video file) and both routes in (drop, click)
//   sample: "Drop a video here or click to upload"
const DROP_TITLE = '∑CG';

const SHEET_COLS = 4;
const SHEET_THUMB_WIDTH = 320;
const SHEET_LABEL_HEIGHT = 22;

interface Still {
	url: string;
	label: string;
	fileName: string;
}

export default class FrameExtractorTool extends Component {
	@tracked stills: Still[] = [];
	@tracked sheetBusy = false;
	@tracked sheetDone = 0;
	@tracked sheetCount = 12;

	intake = new VideoIntake({
		onLoad: () => {
			this.#releaseStills();
			this.stills = [];
		},
	});

	willDestroy() {
		super.willDestroy();
		this.intake.release();
		this.#releaseStills();
	}

	#releaseStills() {
		for (const still of this.stills) URL.revokeObjectURL(still.url);
	}

	get baseName() {
		return this.intake.baseName || 'video';
	}

	get meta() {
		const { duration, width, height } = this.intake;
		if (!duration) return '';
		return `${width} × ${height} · ${formatTimestamp(duration * 1000, '.')}`;
	}

	get sheetProgress() {
		return `${this.sheetDone}/${this.sheetCount}`;
	}

	setSheetCount = (event: Event) => {
		const value = parseInt(
			(event.target as HTMLInputElement).value,
			10,
		);
		if (Number.isFinite(value))
			this.sheetCount = Math.min(48, Math.max(2, value));
	};

	grabFrame = () => {
		const video = this.intake.video;
		if (!video || !this.intake.duration) return;

		const canvas = document.createElement('canvas');
		canvas.width = video.videoWidth;
		canvas.height = video.videoHeight;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		ctx.drawImage(video, 0, 0);

		const label = formatTimestamp(video.currentTime * 1000, '.');
		canvas.toBlob((blob) => {
			if (!blob || this.isDestroyed) return;
			this.stills = [
				...this.stills,
				{
					url: URL.createObjectURL(blob),
					label,
					fileName: `${this.baseName}-${label.replace(/[:.]/g, '-')}.png`,
				},
			];
		}, 'image/png');
	};

	downloadStill = (still: Still) => {
		downloadUrl(still.url, still.fileName);
	};

	removeStill = (still: Still) => {
		URL.revokeObjectURL(still.url);
		this.stills = this.stills.filter((s) => s !== still);
	};

	// intake.drop cannot see sheetBusy, and a drop mid-build would tear the
	// video out from under the seek loop.
	handleDrop = (event: DragEvent) => {
		event.preventDefault();
		if (!this.sheetBusy) this.intake.drop(event);
	};

	buildSheet = () => void this.#buildSheet();

	async #buildSheet() {
		const video = this.intake.video;
		const duration = this.intake.duration;
		if (!video || !duration || this.sheetBusy) return;

		this.sheetBusy = true;
		this.sheetDone = 0;
		video.pause();
		const returnTo = video.currentTime;

		const n = this.sheetCount;
		const cols = Math.min(SHEET_COLS, n);
		const rows = Math.ceil(n / cols);
		const thumbW = SHEET_THUMB_WIDTH;
		const thumbH = Math.round(
			(thumbW * video.videoHeight) / video.videoWidth,
		);

		const canvas = document.createElement('canvas');
		canvas.width = cols * thumbW;
		canvas.height = rows * thumbH;
		const ctx = canvas.getContext('2d');
		if (!ctx) {
			this.sheetBusy = false;
			return;
		}

		for (let i = 0; i < n; i++) {
			// Mid-segment sampling: frame 0 is often black, the last
			// frame often blank.
			const time = (duration * (i + 0.5)) / n;
			await seekTo(video, time);
			if (this.isDestroyed) return;

			const x = (i % cols) * thumbW;
			const y = Math.floor(i / cols) * thumbH;
			ctx.drawImage(video, x, y, thumbW, thumbH);

			ctx.fillStyle = 'rgb(0 0 0 / 60%)';
			ctx.fillRect(
				x,
				y + thumbH - SHEET_LABEL_HEIGHT,
				thumbW,
				SHEET_LABEL_HEIGHT,
			);
			ctx.fillStyle = '#fff';
			ctx.font = '13px ui-monospace, monospace';
			ctx.textBaseline = 'middle';
			ctx.fillText(
				formatTimestamp(time * 1000, '.'),
				x + 8,
				y + thumbH - SHEET_LABEL_HEIGHT / 2,
			);

			this.sheetDone = i + 1;
		}

		await seekTo(video, returnTo);
		canvas.toBlob((blob) => {
			if (blob)
				downloadBlob(
					blob,
					`${this.baseName}-contact-sheet.png`,
				);
		}, 'image/png');
		this.sheetBusy = false;
	}

	clear = () => {
		this.intake.clear();
		this.#releaseStills();
		this.stills = [];
	};

	<template>
		<div class="dt-fx">
			<div
				class="dt-fx-frame"
				{{on "drop" this.handleDrop}}
				{{on "dragover" this.intake.dragOver}}
			>
				{{#unless this.intake.url}}
					<label class="dt-fx-drop">
						<input
							type="file"
							accept="video/*"
							class="dt-sr-only"
							{{on
								"change"
								this.intake.chooseFile
							}}
						/>
						<Icon @name="upload" />
						<span
							class="dt-fx-drop-title"
						>{{DROP_TITLE}}</span>
					</label>
				{{/unless}}

				{{#if this.intake.url}}
					<div class="dt-fx-bar">
						<div class="dt-fx-info">
							<p
								class="dt-fx-name"
							>{{this.intake.fileName}}</p>
							{{#if this.meta}}
								<p
									class="dt-fx-meta"
								>{{this.meta}}</p>
							{{/if}}
						</div>
						<label class="dt-fx-count">
							<span>Frames</span>
							<input
								type="number"
								min="2"
								max="48"
								value={{this.sheetCount}}
								disabled={{this.sheetBusy}}
								{{on
									"input"
									this.setSheetCount
								}}
							/>
						</label>
						<button
							type="button"
							class="dt-fx-btn"
							disabled={{this.sheetBusy}}
							{{on
								"click"
								this.buildSheet
							}}
						>
							<Icon
								@name="layout-grid"
							/>
							{{#if this.sheetBusy}}
								{{this.sheetProgress}}
							{{else}}
								Contact sheet
							{{/if}}
						</button>
						<button
							type="button"
							class="dt-fx-btn"
							disabled={{this.sheetBusy}}
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
							class="dt-fx-btn is-primary"
							disabled={{this.sheetBusy}}
							{{on
								"click"
								this.grabFrame
							}}
						>
							<Icon @name="camera" />
							Grab frame
						</button>
					</div>

					<div class="dt-fx-stage">
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

					{{#if this.stills.length}}
						<ul class="dt-fx-stills">
							{{#each
								this.stills
								key="url"
								as |still|
							}}
								<li
									class="dt-fx-still"
								>
									<img
										src={{still.url}}
										alt={{still.label}}
									/>
									<div
										class="dt-fx-still-bar"
									>
										<span
											class="dt-fx-still-time"
										>{{still.label}}</span>
										<button
											type="button"
											class="dt-fx-still-btn"
											aria-label="Download frame"
											{{on
												"click"
												(fn
													this.downloadStill
													still
												)
											}}
										>
											<Icon
												@name="download"
											/>
										</button>
										<button
											type="button"
											class="dt-fx-still-btn"
											aria-label="Remove frame"
											{{on
												"click"
												(fn
													this.removeStill
													still
												)
											}}
										>
											<Icon
												@name="x"
											/>
										</button>
									</div>
								</li>
							{{/each}}
						</ul>
					{{/if}}
				{{/if}}
			</div>

			{{#if this.intake.error}}
				<p
					class="dt-fx-error"
					role="alert"
				>{{this.intake.error}}</p>
			{{/if}}
		</div>
	</template>
}
