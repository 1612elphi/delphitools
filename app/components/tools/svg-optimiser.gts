import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import type Owner from '@ember/owner';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonCodeBlock from 'delphicanon/components/canon-code-block';
import CanonCompressionScale from 'delphicanon/components/canon-compression-scale';
import CanonDropZone from 'delphicanon/components/canon-drop-zone';
import CanonEmptyRow from 'delphicanon/components/canon-empty-row';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import { IconSvg } from 'delphitools-v2/components/icon';
import Source from 'delphitools-v2/components/tools/text-tool/source';
import { downloadText } from 'delphitools-v2/lib/download';
import { downloadIcon, passAlong } from 'delphitools-v2/lib/flow-hooks';
import filePaste, { matchesAccept } from 'delphitools-v2/modifiers/file-paste';
import type { Config } from 'svgo/browser';
import './svg-optimiser/svg-optimiser.css';

async function loadOptimize() {
	const { optimize } = await import('svgo/browser');
	return optimize;
}

const SVGO_CONFIG: Config = {
	multipass: true,
	plugins: [
		'preset-default',
		{
			name: 'removeAttrs',
			params: { attrs: '(data-.*)' },
		},
	],
};

export function stripRootDimensions(svg: string): string {
	const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
	const root = doc.documentElement;
	if (doc.querySelector('parsererror') || !root.hasAttribute('viewBox'))
		return svg;
	root.removeAttribute('width');
	root.removeAttribute('height');
	return new XMLSerializer().serializeToString(doc);
}

const stripped = (result: { data: string }) => ({
	data: stripRootDimensions(result.data),
});

const HANDOFF_KEY = 'svg-optimiser-input';
const HANDOFF_NAME = 'traced.svg';

const ACCEPT = '.svg,image/svg+xml';

export interface OptimiseStats {
	original: number;
	optimised: number;
	saved: number;
	percent: number;
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	return `${(bytes / 1024).toFixed(1)} KB`;
}

export function statsFor(original: string, optimised: string): OptimiseStats {
	const before = new Blob([original]).size;
	const after = new Blob([optimised]).size;
	const saved = before - after;
	return {
		original: before,
		optimised: after,
		saved,
		percent: before ? Math.round((saved / before) * 100) : 0,
	};
}

export function looksLikeSvg(text: string): boolean {
	const trimmed = text.trim();
	return trimmed.startsWith('<svg') || trimmed.startsWith('<?xml');
}

export async function optimiseSvg(
	original: string,
): Promise<OptimiseStats | null> {
	if (!looksLikeSvg(original)) return null;
	try {
		const { optimize } = await import('svgo/browser');
		const { data } = stripped(optimize(original, SVGO_CONFIG));
		return statsFor(original, data);
	} catch {
		return null;
	}
}

const Save = <template><IconSvg @name={{(downloadIcon)}} /></template>;
const FileIcon = <template><IconSvg @name="file-code" /></template>;

const keepPaste = (event: Event) => event.stopPropagation();

const editable = (target: EventTarget | null) =>
	target instanceof HTMLElement &&
	(target.isContentEditable || target.matches('input, textarea, select'));

export default class SvgOptimiserTool extends Component {
	@tracked input = '';
	@tracked output = '';
	@tracked failure = '';
	@tracked working = false;
	@tracked previewUrl = '';
	@tracked aspect = 4 / 3;
	@tracked fileName = '';

	#runId = 0;

	constructor(owner: Owner, args: object) {
		super(owner, args);

		const incoming = sessionStorage.getItem(HANDOFF_KEY);
		if (incoming) {
			sessionStorage.removeItem(HANDOFF_KEY);
			this.input = incoming;
			this.fileName = HANDOFF_NAME;
			void this.optimise(incoming);
			return;
		}
		const text = new URLSearchParams(window.location.search).get(
			'svgoText',
		);
		if (text) {
			this.input = text;
			void this.optimise(text);
		}
	}

	willDestroy() {
		super.willDestroy();
		this.#setPreview('');
	}

	get before() {
		return looksLikeSvg(this.input)
			? new Blob([this.input]).size
			: 0;
	}

	get after() {
		return this.output ? new Blob([this.output]).size : 0;
	}

	get fileSize() {
		return formatBytes(this.before);
	}

	get hasResult() {
		return !!(this.output || this.failure);
	}

	get downloadText() {
		return passAlong('Download');
	}

	#setPreview(svg: string) {
		if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
		this.previewUrl = svg
			? URL.createObjectURL(
					new Blob([svg], {
						type: 'image/svg+xml',
					}),
				)
			: '';
	}

	#clearOutput() {
		this.#runId += 1;
		this.output = '';
		this.failure = '';
		this.working = false;
		this.#setPreview('');
	}

	optimise = async (svg: string) => {
		const runId = ++this.#runId;
		this.working = true;
		try {
			const optimize = await loadOptimize();
			if (runId !== this.#runId) return;

			const { data } = stripped(optimize(svg, SVGO_CONFIG));
			this.output = data;
			this.failure = '';
			this.#setPreview(data);
		} catch (error) {
			if (runId !== this.#runId) return;
			console.error('SVG optimisation failed:', error);
			this.#clearOutput();
			this.failure =
				error instanceof Error
					? error.message
					: String(error);
		}
		this.working = false;
	};

	readFile = (file: File) => {
		const reader = new FileReader();
		reader.onload = () => {
			if (this.isDestroying) return;
			const content = reader.result as string;
			this.fileName = file.name;
			this.input = content;
			void this.optimise(content);
		};
		reader.readAsText(file);
	};

	readFiles = (files: File[]) => {
		if (files[0]) this.readFile(files[0]);
	};

	setInput = (content: string) => {
		this.input = content;
		this.fileName = '';
		if (looksLikeSvg(content)) void this.optimise(content);
		else this.#clearOutput();
	};

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
		this.readFile(file);
	};

	pasteCode = modifier(() => {
		const paste = (event: ClipboardEvent) => {
			if (
				editable(event.target) ||
				event.clipboardData?.files.length
			)
				return;
			const text =
				event.clipboardData?.getData('text/plain') ??
				'';
			if (!looksLikeSvg(text)) return;
			event.preventDefault();
			this.setInput(text);
		};
		document.addEventListener('paste', paste);
		return () => document.removeEventListener('paste', paste);
	});

	measure = (event: Event) => {
		const image = event.target as HTMLImageElement;
		if (!image.naturalWidth || !image.naturalHeight) return;
		this.aspect = Math.min(
			2,
			Math.max(
				0.75,
				image.naturalWidth / image.naturalHeight,
			),
		);
	};

	download = () => {
		const filename = this.fileName
			? this.fileName.replace('.svg', '-optimised.svg')
			: 'optimised.svg';
		downloadText(this.output, filename, 'image/svg+xml');
	};

	<template>
		<CanonSplit
			class="svg-optimiser"
			{{filePaste this.readFile accept=ACCEPT}}
			{{this.pasteCode}}
			{{on "dragover" this.allowDrop}}
			{{on "drop" this.dropAnywhere}}
		>
			<:banner>
				<CanonCanvas @height={{176}}>
					<CanonCompressionScale
						@before={{this.before}}
						@after={{this.after}}
						@format="Optimised"
						@working={{this.working}}
					/>
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<CanonRows @framed={{true}}>
					<Source
						@heading="Input SVG"
						@text={{this.input}}
						@label="Input SVG"
						@onChange={{this.setInput}}
					/>
					{{#if this.fileName}}
						<CanonRow
							class="so-file"
							@title={{this.fileName}}
							@detail={{this.fileSize}}
							@icon={{FileIcon}}
						/>
					{{else}}
						<CanonDropZone
							class="so-drop"
							@prompt="Drop an SVG"
							@icon={{FileIcon}}
							@accept={{ACCEPT}}
							@paste={{false}}
							@onFiles={{this.readFiles}}
							{{on "paste" keepPaste}}
						/>
					{{/if}}
				</CanonRows>
			</:sidebar>
			<:main>
				{{#if this.previewUrl}}
					<CanonCanvas
						@aspect={{this.aspect}}
						@maxHeight={{420}}
						@boxing="unlessWide"
						@background="var(--canon-muted)"
					>
						<img
							class="so-preview"
							src={{this.previewUrl}}
							alt="Optimised SVG preview"
							{{on
								"load"
								this.measure
							}}
						/>
					</CanonCanvas>
				{{/if}}
				{{#if this.hasResult}}
					<CanonRows @framed={{true}}>
						<CanonHeading
							@text="Optimised SVG"
						/>
						{{#if this.failure}}
							<CanonStatus
								class="so-failure"
								@text={{this.failure}}
								@tone="warn"
								@row={{true}}
							/>
						{{else}}
							<CanonCodeBlock
								class="so-code"
								@code={{this.output}}
								@maxHeight={{320}}
							/>
							<CanonButton
								class="so-download"
								@kind="primary"
								@text={{this.downloadText}}
								@icon={{Save}}
								@iconStyle="oversized"
								@onClick={{this.download}}
							/>
						{{/if}}
					</CanonRows>
				{{else}}
					<CanonRows @framed={{true}}>
						<CanonEmptyRow
							@text="Optimised SVG"
						/>
					</CanonRows>
				{{/if}}
			</:main>
		</CanonSplit>
	</template>
}
