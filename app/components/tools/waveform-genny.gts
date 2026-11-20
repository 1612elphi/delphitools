import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import type Owner from '@ember/owner';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonColourWell from 'delphicanon/components/canon-colour-well';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonNumberField from 'delphicanon/components/canon-number-field';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonTiles from 'delphicanon/components/canon-tiles';
import { hex, parseHex, type Rgb } from 'delphicanon/lib/colour';
import { IconSvg } from 'delphitools-v2/components/icon';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import { downloadBlob, downloadText } from 'delphitools-v2/lib/download';
import { downloadIcon, passAlong } from 'delphitools-v2/lib/flow-hooks';
import {
	AudioIntake,
	channelsOf,
	extractPeaks,
	peakDb,
} from 'delphitools-v2/lib/audio';
import { AUDIO_ACCEPT, acceptAttr } from 'delphitools-v2/lib/tools';
import Drop from 'delphitools-v2/components/tools/media/drop';
import Slot from 'delphitools-v2/components/tools/media/slot';
import {
	bars,
	columnsFor,
	waveformSvg,
} from 'delphitools-v2/components/tools/waveform-genny/bars';
import './media/media.css';
import './waveform-genny/waveform-genny.css';

const ACCEPT = acceptAttr(AUDIO_ACCEPT);
const DROP_PROMPT = 'Drop an audio file here or click to upload';

const SIZES = [
	{ label: 'SoundCloud', width: 1500, height: 500 },
	{ label: 'Open Graph', width: 1200, height: 630 },
	{ label: 'Full HD', width: 1920, height: 1080 },
	{ label: 'Square', width: 1200, height: 1200 },
	{ label: 'Custom', width: 0, height: 0 },
];
const CUSTOM = SIZES.length - 1;
const sizeLabels = SIZES.map((size) => size.label);
const DETAILS = [1, 2, 4, 8];
const detailLabels = DETAILS.map((px) => `${px} px`);
const FORMATS = ['PNG', 'SVG'];
const CUSTOM_MIN = 100;
const CUSTOM_MAX = 4000;

const BLANK_AUDIO = [
	{ label: 'Duration', value: '—' },
	{ label: 'Sample rate', value: '—' },
	{ label: 'Channels', value: '—' },
	{ label: 'Peak', value: '—', level: 0 },
];

const levelFloor = -60;

const Trash = <template><IconSvg @name="trash-2" /></template>;
const Save = <template><IconSvg @name={{(downloadIcon)}} /></template>;

const pick = (value: string | null, count: number, fallback: number) => {
	const index = Number(value ?? NaN);
	return Number.isInteger(index) && index >= 0 && index < count
		? index
		: fallback;
};

export default class WaveformGenny extends Component {
	intake = new AudioIntake();
	drop = new Drop(ACCEPT, (file) => this.intake.load(file));

	@tracked size: number;
	@tracked detail: number;
	@tracked format: number;
	@tracked customWidth = 1500;
	@tracked customHeight = 500;
	@tracked wave: Rgb = parseHex('#2e7d32')!;
	@tracked background: Rgb = parseHex('#faf5e6')!;

	#canvas?: HTMLCanvasElement;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		this.size = pick(query.get('wgSize'), SIZES.length, 0);
		this.detail = pick(query.get('wgDetail'), DETAILS.length, 1);
		this.format = pick(query.get('wgFormat'), FORMATS.length, 0);
	}

	get loaded() {
		return this.intake.fileName !== '';
	}

	get undecoded() {
		return !this.intake.buffer;
	}

	get isCustom() {
		return this.size === CUSTOM;
	}

	get width() {
		return this.isCustom
			? this.customWidth
			: SIZES[this.size]!.width;
	}

	get height() {
		return this.isCustom
			? this.customHeight
			: SIZES[this.size]!.height;
	}

	get ratio() {
		return this.width / this.height;
	}

	get ratioStyle() {
		return htmlSafe(`--wg-ratio: ${this.ratio}`);
	}

	get columns() {
		return columnsFor(this.width, DETAILS[this.detail]!);
	}

	get waveHex() {
		return hex(this.wave).toLowerCase();
	}

	get backgroundHex() {
		return hex(this.background).toLowerCase();
	}

	@cached
	get peaks() {
		const buffer = this.intake.buffer;
		return buffer
			? extractPeaks(channelsOf(buffer), this.columns)
			: null;
	}

	@cached
	get peak() {
		const buffer = this.intake.buffer;
		return buffer ? peakDb(channelsOf(buffer)) : -Infinity;
	}

	get detailText() {
		if (this.intake.error) return this.intake.error;
		const buffer = this.intake.buffer;
		if (!buffer) return 'Decoding…';
		return `${buffer.duration.toFixed(2)} s · ${buffer.sampleRate} Hz · ${buffer.numberOfChannels} ch`;
	}

	get audioTiles() {
		const buffer = this.intake.buffer;
		if (!buffer) return BLANK_AUDIO;
		const peak = this.peak;
		return [
			{
				label: 'Duration',
				value: `${buffer.duration.toFixed(2)} s`,
			},
			{
				label: 'Sample rate',
				value: `${buffer.sampleRate} Hz`,
			},
			{
				label: 'Channels',
				value: `${buffer.numberOfChannels}`,
			},
			{
				label: 'Peak',
				value: Number.isFinite(peak)
					? `${peak.toFixed(1)} dBFS`
					: '-∞ dBFS',
				level: Number.isFinite(peak)
					? Math.min(
							1,
							Math.max(
								0,
								1 -
									peak /
										levelFloor,
							),
						)
					: 0,
			},
		];
	}

	get imageTiles() {
		const { width, height } = this;
		return [
			{ label: 'Width', value: `${width} px` },
			{ label: 'Height', value: `${height} px` },
			{ label: 'Columns', value: `${this.columns}` },
			{
				label: 'Pixels',
				value: `${((width * height) / 1_000_000).toFixed(2)} MP`,
			},
		];
	}

	get exportLabel() {
		return passAlong(`Download ${FORMATS[this.format]!}`);
	}

	get fileName() {
		const extension = FORMATS[this.format]!.toLowerCase();
		return `${this.intake.baseName || 'waveform'}.${extension}`;
	}

	paint = modifier((canvas: HTMLCanvasElement) => {
		this.#canvas = canvas;
		const { width, height, peaks } = this;
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext('2d');
		if (!context) return;
		context.fillStyle = this.backgroundHex;
		context.fillRect(0, 0, width, height);
		context.fillStyle = this.waveHex;
		if (!peaks) {
			const line = Math.max(1, Math.round(height / 100));
			context.fillRect(0, (height - line) / 2, width, line);
			return;
		}
		for (const bar of bars(peaks, width, height))
			context.fillRect(bar.x, bar.y, bar.width, bar.height);
	});

	pickSize = (index: number) => (this.size = index);
	pickDetail = (index: number) => (this.detail = index);
	pickFormat = (index: number) => (this.format = index);
	setCustomWidth = (value: number) => (this.customWidth = value);
	setCustomHeight = (value: number) => (this.customHeight = value);
	setWave = (colour: Rgb) => (this.wave = colour);
	setBackground = (colour: Rgb) => (this.background = colour);

	download = () => {
		const peaks = this.peaks;
		if (!peaks) return;
		const name = this.fileName;
		if (this.format === 1) {
			downloadText(
				waveformSvg(
					peaks,
					this.width,
					this.height,
					this.waveHex,
					this.backgroundHex,
				),
				name,
				'image/svg+xml',
			);
			return;
		}
		this.#canvas?.toBlob((blob) => {
			if (blob) downloadBlob(blob, name);
		}, 'image/png');
	};

	<template>
		<CanonSplit
			class="waveform-genny"
			@collapsesTo={{120}}
			{{filePaste this.intake.load accept=ACCEPT}}
			{{on "dragover" this.drop.enter}}
			{{on "dragleave" this.drop.leave}}
			{{on "drop" this.drop.drop}}
		>
			<:banner>
				<CanonCanvas
					@aspect={{this.ratio}}
					@background="var(--canon-muted)"
				>
					<div
						class="wg-picture"
						style={{this.ratioStyle}}
					>
						<canvas
							class="wg-image"
							role="img"
							aria-label="Waveform"
							{{this.paint}}
						></canvas>
					</div>
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Source" />
					{{#if this.loaded}}
						<CanonRow
							class="wg-source
								{{if
									this.intake.error
									'wg-source--failed'
								}}"
							@title={{this.intake.fileName}}
							@detail={{this.detailText}}
							@form="flush"
						>
							<CanonButton
								@kind="cell"
								@text="Clear"
								@icon={{Trash}}
								@onClick={{this.intake.clear}}
							/>
						</CanonRow>
					{{else}}
						<Slot
							class="wg-slot"
							@prompt={{DROP_PROMPT}}
							@icon="audio-waveform"
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
					<CanonHeading @text="Size" />
					<CanonSegmented
						class="wg-sizes"
						@items={{sizeLabels}}
						@selected={{this.size}}
						@columns={{3}}
						@onChange={{this.pickSize}}
					/>
					{{#if this.isCustom}}
						<CanonRow
							class="wg-width"
							@title="Width"
							@form="flush"
							as |titleId|
						>
							<CanonNumberField
								@value={{this.customWidth}}
								@min={{CUSTOM_MIN}}
								@max={{CUSTOM_MAX}}
								@step={{10}}
								@unit="px"
								@labelledBy={{titleId}}
								@onChange={{this.setCustomWidth}}
							/>
						</CanonRow>
						<CanonRow
							class="wg-height"
							@title="Height"
							@form="flush"
							as |titleId|
						>
							<CanonNumberField
								@value={{this.customHeight}}
								@min={{CUSTOM_MIN}}
								@max={{CUSTOM_MAX}}
								@step={{10}}
								@unit="px"
								@labelledBy={{titleId}}
								@onChange={{this.setCustomHeight}}
							/>
						</CanonRow>
					{{/if}}
					<CanonHeading @text="Detail" />
					<CanonSegmented
						class="wg-details"
						@items={{detailLabels}}
						@selected={{this.detail}}
						@onChange={{this.pickDetail}}
					/>
					<CanonHeading @text="Colours" />
					<CanonColourWell
						class="wg-wave"
						@label="Wave"
						@colour={{this.wave}}
						@onChange={{this.setWave}}
					/>
					<CanonColourWell
						class="wg-background"
						@label="Background"
						@colour={{this.background}}
						@onChange={{this.setBackground}}
					/>
					<CanonHeading @text="Format" />
					<CanonSegmented
						class="wg-formats"
						@items={{FORMATS}}
						@selected={{this.format}}
						@onChange={{this.pickFormat}}
					/>
					<CanonButton
						class="wg-download"
						@kind="primary"
						@text={{this.exportLabel}}
						@icon={{Save}}
						@iconStyle="oversized"
						@disabled={{this.undecoded}}
						@onClick={{this.download}}
					/>
				</CanonRows>
			</:sidebar>
			<:main>
				<CanonRows class="wg-readings" @framed={{true}}>
					<CanonHeading @text="Audio" />
					<CanonTiles
						class="wg-audio"
						@items={{this.audioTiles}}
					/>
					<CanonHeading @text="Image" />
					<CanonTiles
						class="wg-image-tiles"
						@items={{this.imageTiles}}
					/>
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}
