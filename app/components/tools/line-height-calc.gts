import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { htmlSafe } from '@ember/template';
import Icon from 'delphitools-v2/components/icon';

export interface Ratio {
	name: string;
	ratio: number;
	use: string;
}

export const RATIOS: Ratio[] = [
	{ name: 'Tight', ratio: 1.2, use: 'Headings, large text' },
	{ name: 'Snug', ratio: 1.375, use: 'Subheadings' },
	{ name: 'Normal', ratio: 1.5, use: 'Body text (recommended)' },
	{ name: 'Relaxed', ratio: 1.625, use: 'Long-form reading' },
	{ name: 'Loose', ratio: 2, use: 'Large blocks, accessibility' },
];

const GOLDEN_RATIO = 1.618;
const OPTIMAL_RATIO = 1.5;
const PREVIEW_RATIOS = [1.2, 1.5, 2];

const PREVIEW_MAX_PX = 24;

const COPIED_MS = 1500;

const OPTIMAL_NOTE = '1.5× ratio — optimal for body text';
const GOLDEN_NOTE = 'φ (1.618) — harmonious proportions';
const PANGRAM =
	'The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.';

export function lineHeightPx(fontSize: number, ratio: number): string {
	return (fontSize * ratio).toFixed(1);
}

export default class LineHeightCalcTool extends Component {
	@tracked fontSize = '16';
	@tracked copied: string | null = null;

	#copiedTimer?: ReturnType<typeof setTimeout>;

	willDestroy() {
		super.willDestroy();
		clearTimeout(this.#copiedTimer);
	}

	get size() {
		return Number.parseFloat(this.fontSize) || 16;
	}

	get optimalNote() {
		return OPTIMAL_NOTE;
	}

	get goldenNote() {
		return GOLDEN_NOTE;
	}

	get pangram() {
		return PANGRAM;
	}

	get optimal() {
		const value = `${lineHeightPx(this.size, OPTIMAL_RATIO)}px`;
		return { value, isCopied: this.copied === 'optimal' };
	}

	get golden() {
		const value = `${lineHeightPx(this.size, GOLDEN_RATIO)}px`;
		return { value, isCopied: this.copied === 'golden' };
	}

	get rows() {
		return RATIOS.map((r) => {
			const id = r.name.toLowerCase();
			return {
				id,
				name: r.name,
				ratio: `${r.ratio}×`,
				use: r.use,
				value: `${lineHeightPx(this.size, r.ratio)}px`,
				isCopied: this.copied === id,
				copyLabel: `Copy ${r.name}`,
			};
		});
	}

	get previews() {
		const px = Math.min(this.size, PREVIEW_MAX_PX);
		return PREVIEW_RATIOS.map((ratio) => ({
			ratio,
			label: `${ratio}× line-height`,
			style: htmlSafe(
				`font-size: ${px}px; line-height: ${ratio}`,
			),
		}));
	}

	setFontSize = (event: Event) => {
		this.fontSize = (event.target as HTMLInputElement).value;
	};

	copyValue = (value: string, id: string) => void this.copy(value, id);

	async copy(value: string, id: string) {
		await navigator.clipboard.writeText(value);
		this.copied = id;
		clearTimeout(this.#copiedTimer);
		this.#copiedTimer = setTimeout(
			() => (this.copied = null),
			COPIED_MS,
		);
	}

	<template>
		<div class="dt-lh">
			<div class="dt-lh-input">
				<label class="dt-lh-label" for="dt-lh-size">Font
					Size</label>
				<div class="dt-lh-size">
					<input
						id="dt-lh-size"
						type="number"
						min="1"
						value={{this.fontSize}}
						{{on "input" this.setFontSize}}
					/>
					<span class="dt-lh-unit">px</span>
				</div>
			</div>

			<div class="dt-lh-recs">
				<div class="dt-lh-rec">
					<span
						class="dt-lh-cap"
					>Recommended</span>
					<span
						class="dt-lh-value"
					>{{this.optimal.value}}</span>
					<span
						class="dt-lh-note"
					>{{this.optimalNote}}</span>
					<button
						type="button"
						class="dt-lh-btn"
						{{on
							"click"
							(fn
								this.copyValue
								this.optimal.value
								"optimal"
							)
						}}
					>
						<Icon
							@name={{if
								this.optimal.isCopied
								"check"
								"copy"
							}}
						/>
						{{if
							this.optimal.isCopied
							"Copied!"
							"Copy"
						}}
					</button>
				</div>

				<div class="dt-lh-rec">
					<span class="dt-lh-cap">Golden Ratio</span>
					<span
						class="dt-lh-value"
					>{{this.golden.value}}</span>
					<span
						class="dt-lh-note"
					>{{this.goldenNote}}</span>
					<button
						type="button"
						class="dt-lh-btn"
						{{on
							"click"
							(fn
								this.copyValue
								this.golden.value
								"golden"
							)
						}}
					>
						<Icon
							@name={{if
								this.golden.isCopied
								"check"
								"copy"
							}}
						/>
						{{if
							this.golden.isCopied
							"Copied!"
							"Copy"
						}}
					</button>
				</div>
			</div>

			<div class="dt-lh-block">
				<div class="dt-lh-head">
					<span class="dt-lh-heading">Common
						Ratios</span>
				</div>
				{{#each this.rows key="id" as |row|}}
					<div class="dt-lh-row">
						<div class="dt-lh-meta">
							<span
								class="dt-lh-names"
							>
								<span
									class="dt-lh-name"
								>{{row.name}}</span>
								<span
									class="dt-lh-ratio"
								>{{row.ratio}}</span>
							</span>
							<span
								class="dt-lh-use"
							>{{row.use}}</span>
						</div>
						<span
							class="dt-lh-computed"
						>{{row.value}}</span>
						<button
							type="button"
							class="dt-lh-copy"
							aria-label={{row.copyLabel}}
							{{on
								"click"
								(fn
									this.copyValue
									row.value
									row.id
								)
							}}
						>
							<Icon
								@name={{if
									row.isCopied
									"check"
									"copy"
								}}
							/>
						</button>
					</div>
				{{/each}}
			</div>

			<div>
				<div class="dt-lh-head">
					<span
						class="dt-lh-heading"
					>Preview</span>
				</div>
				<div class="dt-lh-previews">
					{{#each
						this.previews key="ratio"
						as |preview|
					}}
						<div class="dt-lh-preview">
							<span
								class="dt-lh-preview-label"
							>{{preview.label}}</span>
							<p
								style={{preview.style}}
							>{{this.pangram}}</p>
						</div>
					{{/each}}
				</div>
			</div>
		</div>
	</template>
}
