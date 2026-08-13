import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import Icon from 'delphitools-v2/components/icon';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import type Owner from '@ember/owner';
import type { Config } from 'svgo/browser';

/**
 * svgo is roughly 200 kB of parser and plugins, and this is the only tool that
 * needs it, so it is imported on first use rather than at module scope — the
 * same reason lib/bg-removal.ts defers transformers.js.
 */
async function loadOptimize() {
	const { optimize } = await import('svgo/browser');
	return optimize;
}

const SVGO_CONFIG: Config = {
	multipass: true,
	plugins: [
		'preset-default',
		'removeDimensions',
		{
			name: 'removeAttrs',
			params: { attrs: '(data-.*)' },
		},
	],
};

/** The image tracer hands its result over through this key. */
const HANDOFF_KEY = 'svg-optimiser-input';
const HANDOFF_NAME = 'traced.svg';

const ACCEPT = '.svg,image/svg+xml';

const COPIED_MS = 1500;

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

/** Sizes are UTF-8 byte counts, which is what the file on disk would weigh. */
export function statsFor(original: string, optimised: string): OptimiseStats {
	const before = new Blob([original]).size;
	const after = new Blob([optimised]).size;
	const saved = before - after;
	return {
		original: before,
		optimised: after,
		saved,
		// An empty input reaches here through a zero-byte .svg file, and the
		// Next app reported NaN% for it.
		percent: before ? Math.round((saved / before) * 100) : 0,
	};
}

/** Whether textarea contents look enough like SVG to be worth optimising. */
export function looksLikeSvg(text: string): boolean {
	const trimmed = text.trim();
	return trimmed.startsWith('<svg') || trimmed.startsWith('<?xml');
}

/** Optimise SVG markup and return size stats, or null if it is not SVG. */
export async function optimiseSvg(
	original: string,
): Promise<OptimiseStats | null> {
	if (!looksLikeSvg(original)) return null;
	try {
		const { optimize } = await import('svgo/browser');
		const { data } = optimize(original, SVGO_CONFIG);
		return statsFor(original, data);
	} catch {
		return null;
	}
}

export default class SvgOptimiserTool extends Component {
	@tracked input = '';
	@tracked output = '';
	@tracked previewUrl = '';
	@tracked fileName = '';
	@tracked copied = false;
	@tracked stats: OptimiseStats | null = null;

	#copiedTimer?: ReturnType<typeof setTimeout>;
	/** Runs are async, so a stale one must not overwrite a newer result. */
	#runId = 0;

	constructor(owner: Owner, args: object) {
		super(owner, args);

		const incoming = sessionStorage.getItem(HANDOFF_KEY);
		if (incoming) {
			sessionStorage.removeItem(HANDOFF_KEY);
			this.input = incoming;
			this.fileName = HANDOFF_NAME;
			void this.optimise(incoming);
		}
	}

	willDestroy() {
		super.willDestroy();
		clearTimeout(this.#copiedTimer);
		this.#setPreview('');
	}

	get percentLabel() {
		return `${this.stats?.percent ?? 0}%`;
	}

	get originalLabel() {
		return formatBytes(this.stats?.original ?? 0);
	}

	get optimisedLabel() {
		return formatBytes(this.stats?.optimised ?? 0);
	}

	get savedLabel() {
		return formatBytes(this.stats?.saved ?? 0);
	}

	/**
	 * The preview goes through a blob URL and an <img>, so user-supplied SVG
	 * cannot run scripts or reach cross-origin from the main document.
	 */
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
		this.output = '';
		this.stats = null;
		this.#setPreview('');
	}

	optimise = async (svg: string) => {
		const runId = ++this.#runId;
		try {
			const optimize = await loadOptimize();
			if (runId !== this.#runId) return;

			const { data } = optimize(svg, SVGO_CONFIG);
			this.output = data;
			this.stats = statsFor(svg, data);
			this.#setPreview(data);
		} catch (error) {
			if (runId !== this.#runId) return;
			console.error('SVG optimisation failed:', error);
			this.#clearOutput();
		}
	};

	readFile = (file: File) => {
		this.fileName = file.name;
		const reader = new FileReader();
		reader.onload = () => {
			const content = reader.result as string;
			this.input = content;
			void this.optimise(content);
		};
		reader.readAsText(file);
	};

	handleFileSelect = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) this.readFile(file);
		// Reset, so choosing the same file twice still fires a change event.
		input.value = '';
	};

	handleDrop = (event: DragEvent) => {
		event.preventDefault();
		const file = event.dataTransfer?.files[0];
		if (file?.type === 'image/svg+xml') this.readFile(file);
	};

	// Without this the browser navigates to the dropped file instead.
	allowDrop = (event: DragEvent) => {
		event.preventDefault();
	};

	setInput = (event: Event) => {
		const content = (event.target as HTMLTextAreaElement).value;
		this.input = content;
		this.fileName = '';
		if (looksLikeSvg(content)) void this.optimise(content);
		else this.#clearOutput();
	};

	clear = () => {
		this.input = '';
		this.fileName = '';
		this.#clearOutput();
	};

	copy = async () => {
		await navigator.clipboard.writeText(this.output);
		this.copied = true;
		clearTimeout(this.#copiedTimer);
		this.#copiedTimer = setTimeout(
			() => (this.copied = false),
			COPIED_MS,
		);
	};

	copyOutput = () => void this.copy();

	download = () => {
		const blob = new Blob([this.output], { type: 'image/svg+xml' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.download = this.fileName
			? this.fileName.replace('.svg', '-optimized.svg')
			: 'optimized.svg';
		link.href = url;
		link.click();
		URL.revokeObjectURL(url);
	};

	<template>
		<div class="dt-svgo" {{filePaste this.readFile accept=ACCEPT}}>
			<label
				class="dt-svgo-drop"
				{{on "drop" this.handleDrop}}
				{{on "dragover" this.allowDrop}}
			>
				<input
					type="file"
					accept={{ACCEPT}}
					class="dt-sr-only"
					{{on "change" this.handleFileSelect}}
				/>
				<Icon @name="upload" />
				{{! wording carried over from the Next app }}
				<span class="dt-svgo-drop-title">Drop SVG file
					here</span>
				<span class="dt-svgo-drop-hint">or click to
					select, or paste SVG code below</span>
			</label>

			<div class="dt-svgo-section">
				<div class="dt-svgo-bar">
					{{! wording carried over from the Next app }}
					<label for="dt-svgo-input">Input SVG</label>
					{{#if this.input}}
						<button
							type="button"
							class="dt-svgo-bar-btn"
							{{on
								"click"
								this.clear
							}}
						>
							<Icon @name="trash-2" />
							Clear
						</button>
					{{/if}}
				</div>
				{{! wording carried over from the Next app }}
				<textarea
					id="dt-svgo-input"
					class="dt-svgo-code"
					value={{this.input}}
					placeholder="Paste your SVG code here..."
					{{on "input" this.setInput}}
				></textarea>
			</div>

			{{#if this.stats}}
				<div class="dt-svgo-section">
					<div class="dt-svgo-bar">
						{{! wording carried over from the Next app }}
						<span>Results</span>
					</div>
					<div class="dt-svgo-stats">
						<div class="dt-svgo-stat">
							{{! wording carried over from the Next app }}
							<span
								class="dt-svgo-stat-label"
							>Original</span>
							<span
								class="dt-svgo-stat-value"
							>{{this.originalLabel}}</span>
						</div>
						<div class="dt-svgo-stat">
							{{! wording carried over from the Next app }}
							<span
								class="dt-svgo-stat-label"
							>Optimised</span>
							<span
								class="dt-svgo-stat-value"
							>{{this.optimisedLabel}}</span>
						</div>
						<div class="dt-svgo-stat">
							{{! wording carried over from the Next app }}
							<span
								class="dt-svgo-stat-label"
							>Saved</span>
							<span
								class="dt-svgo-stat-value is-primary"
							>{{this.savedLabel}}</span>
						</div>
						<div class="dt-svgo-stat">
							{{! wording carried over from the Next app }}
							<span
								class="dt-svgo-stat-label"
							>Reduction</span>
							<span
								class="dt-svgo-stat-value is-primary"
							>{{this.percentLabel}}</span>
						</div>
					</div>
				</div>
			{{/if}}

			{{#if this.output}}
				<div class="dt-svgo-section">
					<div class="dt-svgo-bar">
						{{! wording carried over from the Next app }}
						<label
							for="dt-svgo-output"
						>Optimised SVG</label>
					</div>
					<textarea
						id="dt-svgo-output"
						class="dt-svgo-code is-output"
						readonly
						value={{this.output}}
					></textarea>
				</div>

				<div class="dt-svgo-section">
					<div class="dt-svgo-bar">
						{{! wording carried over from the Next app }}
						<span>Preview</span>
					</div>
					<div class="dt-svgo-preview">
						{{#if this.previewUrl}}
							<img
								src={{this.previewUrl}}
								alt="Optimised SVG preview"
							/>
						{{/if}}
					</div>
				</div>

				<div class="dt-svgo-actions">
					<button
						type="button"
						class="dt-svgo-action is-primary"
						{{on "click" this.download}}
					>
						<Icon @name="download" />
						{{! wording carried over from the Next app }}
						Download Optimised SVG
					</button>
					<button
						type="button"
						class="dt-svgo-action"
						{{on "click" this.copyOutput}}
					>
						<Icon
							@name={{if
								this.copied
								"check"
								"copy"
							}}
						/>
						{{! wording carried over from the Next app }}
						{{if
							this.copied
							"Copied!"
							"Copy SVG Code"
						}}
					</button>
				</div>
			{{/if}}
		</div>
	</template>
}
