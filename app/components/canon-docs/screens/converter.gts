import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSlider from 'delphicanon/components/canon-slider';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonTiles from 'delphicanon/components/canon-tiles';
import { IconSvg } from 'delphitools-v2/components/icon';
import { decodeImage } from 'delphitools-v2/lib/decode-image';
import { downloadBlob } from 'delphitools-v2/lib/download';
import { formatBytes } from 'delphitools-v2/lib/image-compress';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import Drop from 'delphitools-v2/components/tools/media/drop';
import Job from 'delphitools-v2/components/tools/media/job';
import Slot from 'delphitools-v2/components/tools/media/slot';
import '../../tools/media/media.css';

const ACCEPT = 'image/*';
const formats = [
	{ name: 'PNG', type: 'image/png', extension: 'png' },
	{ name: 'JPEG', type: 'image/jpeg', extension: 'jpg' },
	{ name: 'WebP', type: 'image/webp', extension: 'webp' },
];
const formatNames = formats.map((format) => format.name);
const Convert = <template><IconSvg @name="refresh-cw" /></template>;
const Trash = <template><IconSvg @name="trash-2" /></template>;
const percent = (value: number) => `${Math.round(value * 100)} %`;

function sample(): Promise<Blob> {
	const canvas = document.createElement('canvas');
	canvas.width = 640;
	canvas.height = 400;
	const context = canvas.getContext('2d')!;
	for (let x = 0; x < 640; x += 8) {
		context.fillStyle = `hsl(${(x / 640) * 360} 70% 55%)`;
		context.fillRect(x, 0, 8, 400);
	}
	context.fillStyle = 'rgb(30 102 38)';
	context.beginPath();
	context.arc(320, 200, 110, 0, 2 * Math.PI);
	context.fill();
	return new Promise((resolve) =>
		canvas.toBlob((blob) => resolve(blob!), 'image/png'),
	);
}

async function convert(file: Blob, type: string, quality: number) {
	const bitmap = await decodeImage(file);
	const canvas = document.createElement('canvas');
	canvas.width = bitmap.width;
	canvas.height = bitmap.height;
	canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
	bitmap.close();
	return new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, type, quality),
	);
}

export default class ConverterScreen extends Component {
	drop = new Drop(ACCEPT, (file) => this.load(file));

	@tracked file: Blob | null = null;
	@tracked name = '';
	@tracked url = '';
	@tracked format = 2;
	@tracked quality = 0.8;
	@tracked busy = false;
	@tracked failed = false;
	@tracked result: Blob | null = null;

	#job = 0;

	constructor(...args: ConstructorParameters<typeof Component>) {
		super(...args);
		void sample().then((blob) => {
			if (!this.file && !this.isDestroying)
				this.load(blob, 'sample.png');
		});
	}

	willDestroy() {
		super.willDestroy();
		this.#job++;
		this.clear();
	}

	get target() {
		return formats[this.format]!;
	}

	get lossy() {
		return this.target.type !== 'image/png';
	}

	get readings() {
		const before = this.file?.size ?? 0;
		const after = this.result?.size;
		return [
			{ label: 'Original', value: formatBytes(before) },
			{
				label: 'Result',
				value:
					after === undefined
						? '–'
						: formatBytes(after),
			},
		];
	}

	get resultName() {
		return `${this.name.replace(/\.[^.]+$/, '')}.${this.target.extension}`;
	}

	get resultRow() {
		if (!this.result) return null;
		return {
			name: this.resultName,
			detail: `${this.target.extension} · ${formatBytes(this.result.size)}`,
		};
	}

	load = (file: Blob, name = (file as File).name) => {
		this.clear();
		this.file = file;
		this.name = name;
		this.url = URL.createObjectURL(file);
	};

	clear = () => {
		if (this.url) URL.revokeObjectURL(this.url);
		this.file = null;
		this.name = '';
		this.url = '';
		this.result = null;
	};

	pickFormat = (index: number) => {
		this.format = index;
		this.result = null;
	};

	setQuality = (value: number) => {
		this.quality = value;
		this.result = null;
	};

	run = () => void this.#convert();

	async #convert() {
		if (!this.file) return;
		const job = ++this.#job;
		this.busy = true;
		this.failed = false;
		this.result = null;
		const blob = await convert(
			this.file,
			this.target.type,
			this.quality,
		).catch(() => null);
		if (job !== this.#job) return;
		this.busy = false;
		this.failed = !blob;
		this.result = blob;
	}

	save = () => {
		if (this.result) downloadBlob(this.result, this.resultName);
	};

	<template>
		<CanonSplit
			@halves={{true}}
			{{filePaste this.load accept=ACCEPT}}
			{{on "dragover" this.drop.enter}}
			{{on "dragleave" this.drop.leave}}
			{{on "drop" this.drop.drop}}
		>
			<:sidebar>
				<CanonCanvas
					@aspect={{1}}
					@background="var(--canon-muted)"
				>
					{{#if this.url}}
						<img
							class="cd-drop-image"
							src={{this.url}}
							alt={{this.name}}
						/>
					{{else}}
						<Slot
							@prompt="Drop an image"
							@icon="image-plus"
							@accept={{ACCEPT}}
							@over={{this.drop.over}}
							@onFile={{this.load}}
						/>
					{{/if}}
				</CanonCanvas>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Source" />
					<CanonRow
						@title={{if
							this.name
							this.name
							"None"
						}}
						@form="flush"
					>
						<CanonButton
							@kind="cell"
							@text="Clear"
							@icon={{Trash}}
							@disabled={{if
								this.file
								false
								true
							}}
							@onClick={{this.clear}}
						/>
					</CanonRow>
					<CanonHeading @text="Format" />
					<CanonSegmented
						aria-label="Format"
						@items={{formatNames}}
						@selected={{this.format}}
						@onChange={{this.pickFormat}}
					/>
					{{#if this.lossy}}
						<CanonRow
							@title="Quality"
							@form="stacked"
							as |titleId|
						>
							<CanonSlider
								@value={{this.quality}}
								@min={{0.1}}
								@max={{1}}
								@step={{0.05}}
								@readout={{percent}}
								@labelledBy={{titleId}}
								@onChange={{this.setQuality}}
							/>
						</CanonRow>
					{{/if}}
					<Job
						@title="Convert"
						@icon={{Convert}}
						@failure="Failed"
						@disabled={{if
							this.file
							false
							true
						}}
						@busy={{this.busy}}
						@failed={{this.failed}}
						@result={{this.resultRow}}
						@onRun={{this.run}}
						@onSave={{this.save}}
					/>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Size" />
					<CanonTiles @items={{this.readings}} />
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}
