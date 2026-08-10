import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { htmlSafe } from '@ember/template';
import { eq } from 'ember-truth-helpers';
import type Owner from '@ember/owner';
import type { TOC } from '@ember/component/template-only';
import Icon from 'delphitools-v2/components/icon';
import {
	paperSizeGroups,
	formatDimensions,
	formatFraction,
	parseSearchQuery,
	matchesNameSearch,
	findClosestSizes,
	type PaperSize,
} from 'delphitools-v2/lib/paper-sizes';

const UNIT_KEY = 'paperSizeUnit';
const PREVIEW_HEIGHT = 280;
/** The preview leaves this much room around the largest sheet. */
const PREVIEW_MARGIN = 40;
/** A4's long edge, so a single small sheet is not scaled up to fill the box. */
const MIN_REFERENCE_MM = 297;
const POINTS_PER_INCH = 72;
const INCH_TO_MM = 25.4;

export const DPI_OPTIONS = [72, 150, 300, 600];

export type Slot = 0 | 1;

/** Same size, allowing for two series sharing an id. */
export function isSameSize(a: PaperSize | null, b: PaperSize): boolean {
	return a?.id === b.id && a.series === b.series;
}

/**
 * Millimetres to preview pixels, sized so the larger of the two sheets fits the
 * box.
 */
export function previewScale(largestMm: number): number {
	return (PREVIEW_HEIGHT - PREVIEW_MARGIN) / largestMm;
}

interface Details {
	label: string;
	meta: string;
	mm: string;
	inches: string;
}

interface DetailsSignature {
	Args: {
		details: Details | null;
		slot: Slot;
		clear: (slot: Slot) => void;
	};
}

const SizeDetails: TOC<DetailsSignature> = <template>
	{{#if @details}}
		<div class="dt-paper-detail-head">
			<span
				class="dt-paper-detail-label
					{{if
						(eq @slot 0)
						'is-first'
						'is-second'
					}}"
			>{{@details.label}}</span>
			<button
				type="button"
				class="dt-paper-clear"
				aria-label="Clear"
				{{on "click" (fn @clear @slot)}}
			><Icon @name="x" /></button>
		</div>
		<div class="dt-paper-detail-meta">{{@details.meta}}</div>
		<div class="dt-paper-detail-grid">
			<div class="dt-paper-detail-cell">
				{{! wording carried over from the Next app }}
				<div
					class="dt-paper-detail-cell-label"
				>Millimetres</div>
				<div
					class="dt-paper-detail-cell-value"
				>{{@details.mm}}</div>
			</div>
			<div class="dt-paper-detail-cell">
				{{! wording carried over from the Next app }}
				<div
					class="dt-paper-detail-cell-label"
				>Inches</div>
				<div
					class="dt-paper-detail-cell-value"
				>{{@details.inches}}</div>
			</div>
		</div>
	{{else}}
		{{! wording carried over from the Next app }}
		<div class="dt-paper-detail-empty">No size selected</div>
	{{/if}}
</template>;

export default class PaperSizesTool extends Component {
	@tracked first: PaperSize | null = null;
	@tracked second: PaperSize | null = null;
	@tracked nextSlot: Slot = 0;
	@tracked overlayMode = false;
	@tracked unit: 'mm' | 'in' = 'mm';
	@tracked searchQuery = '';
	@tracked uploadDpi = 300;
	@tracked uploadedWidth: number | null = null;
	@tracked uploadedHeight: number | null = null;
	@tracked matchesOpen = true;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		if (typeof localStorage === 'undefined') return;
		const saved = localStorage.getItem(UNIT_KEY);
		if (saved === 'mm' || saved === 'in') this.unit = saved;
	}

	get dpiOptions() {
		return DPI_OPTIONS;
	}

	get previewHeightStyle() {
		return htmlSafe(`height: ${PREVIEW_HEIGHT}px`);
	}

	get searchResult() {
		return parseSearchQuery(this.searchQuery);
	}

	get hasUpload() {
		return (
			this.uploadedWidth !== null &&
			this.uploadedHeight !== null
		);
	}

	get showDpi() {
		return this.searchResult.type === 'pixels' || this.hasUpload;
	}

	/** Target in millimetres for a dimension or pixel search; null otherwise. */
	get searchTargetMm(): { width: number; height: number } | null {
		const result = this.searchResult;
		if (result.type === 'pixels') {
			return {
				width: (result.width / result.dpi) * INCH_TO_MM,
				height:
					(result.height / result.dpi) *
					INCH_TO_MM,
			};
		}
		if (result.type === 'dimensions') {
			return {
				width: result.widthMm,
				height: result.heightMm,
			};
		}
		return null;
	}

	get closestMatches() {
		const target = this.searchTargetMm;
		if (!target) return [];
		return findClosestSizes(
			paperSizeGroups,
			target.width,
			target.height,
		);
	}

	get matchRows() {
		return this.closestMatches.map((match, index) => ({
			key: `match-${match.size.series}-${match.size.id}`,
			size: match.size,
			label: match.size.label,
			dimensions: formatDimensions(match.size, this.unit),
			isBest: index === 0,
			widthDiff: `${match.widthDiff >= 0 ? '+' : ''}${Math.round(match.widthDiff)}mm`,
			heightDiff: `${match.heightDiff >= 0 ? '+' : ''}${Math.round(match.heightDiff)}mm`,
			widthOver: match.widthDiff >= 0,
			heightOver: match.heightDiff >= 0,
		}));
	}

	/** The searched-for size as the matches banner prints it. */
	get matchTargetLabel() {
		const result = this.searchResult;
		if (result.type === 'pixels') {
			return `${result.width}×${result.height}px @ ${result.dpi}dpi`;
		}
		if (result.type === 'dimensions') {
			return `${Math.round(result.widthMm)}×${Math.round(result.heightMm)}mm`;
		}
		return '';
	}

	#isHighlighted(size: PaperSize): boolean {
		const result = this.searchResult;
		if (result.type === 'none') return true;
		if (result.type === 'name') {
			return matchesNameSearch(size, result.query);
		}
		return this.closestMatches.some((match) =>
			isSameSize(match.size, size),
		);
	}

	get groups() {
		return paperSizeGroups.map((group) => ({
			id: group.id,
			label: group.label,
			description: group.description,
			rows: group.sizes.map((size) => {
				const isFirst = isSameSize(this.first, size);
				const isSecond = isSameSize(this.second, size);
				return {
					key: `${size.series}-${size.id}`,
					size,
					label: size.label,
					dimensions: formatDimensions(
						size,
						this.unit,
					),
					isFirst,
					isSecond,
					isSelected: isFirst || isSecond,
					slotLabel: isFirst ? '1' : '2',
					isDimmed: !this.#isHighlighted(size),
				};
			}),
		}));
	}

	get largestMm() {
		return Math.max(
			this.first?.widthMm ?? 0,
			this.first?.heightMm ?? 0,
			this.second?.widthMm ?? 0,
			this.second?.heightMm ?? 0,
			MIN_REFERENCE_MM,
		);
	}

	#boxStyle(size: PaperSize | null) {
		if (!size) return htmlSafe('');
		const scale = previewScale(this.largestMm);
		return htmlSafe(
			`width: ${Math.round(size.widthMm * scale)}px; height: ${Math.round(size.heightMm * scale)}px`,
		);
	}

	get firstBoxStyle() {
		return this.#boxStyle(this.first);
	}

	get secondBoxStyle() {
		return this.#boxStyle(this.second);
	}

	#details(size: PaperSize | null): Details | null {
		if (!size) return null;
		return {
			label: size.label,
			meta: `${size.series} · ${size.region}`,
			mm: `${size.widthMm} × ${size.heightMm}`,
			inches: `${formatFraction(size.widthIn)} × ${formatFraction(size.heightIn)}"`,
		};
	}

	get firstDetails() {
		return this.#details(this.first);
	}

	get secondDetails() {
		return this.#details(this.second);
	}

	get hasSelection() {
		return Boolean(this.first ?? this.second);
	}

	setUnit = (unit: 'mm' | 'in') => {
		this.unit = unit;
		localStorage.setItem(UNIT_KEY, unit);
	};

	setOverlayMode = (overlay: boolean) => {
		this.overlayMode = overlay;
	};

	toggleMatches = () => {
		this.matchesOpen = !this.matchesOpen;
	};

	// Selection alternates between the two slots, so a second click compares
	// rather than replaces.
	select = (size: PaperSize) => {
		if (this.nextSlot === 0) this.first = size;
		else this.second = size;
		this.nextSlot = this.nextSlot === 0 ? 1 : 0;
	};

	clearSlot = (slot: Slot) => {
		if (slot === 0) this.first = null;
		else this.second = null;
	};

	setSearchQuery = (event: Event) => {
		this.searchQuery = (event.target as HTMLInputElement).value;
		// A hand-typed query is no longer describing the uploaded file.
		this.#clearUpload();
	};

	clearSearch = () => {
		this.searchQuery = '';
		this.#clearUpload();
	};

	#clearUpload() {
		this.uploadedWidth = null;
		this.uploadedHeight = null;
	}

	setUploadDpi = (dpi: number) => {
		this.uploadDpi = dpi;
		if (this.uploadedWidth === null || this.uploadedHeight === null)
			return;
		this.searchQuery = `${this.uploadedWidth}x${this.uploadedHeight}@${dpi}dpi`;
	};

	readFile = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		// Cleared so the same file can be picked again.
		input.value = '';
		if (!file) return;
		if (file.type.startsWith('image/')) this.#readImage(file);
		else if (file.type === 'application/pdf')
			void this.#readPdf(file);
	};

	#readImage(file: File) {
		const image = new Image();
		const url = URL.createObjectURL(file);
		image.onload = () => {
			this.uploadedWidth = image.width;
			this.uploadedHeight = image.height;
			this.searchQuery = `${image.width}x${image.height}@${this.uploadDpi}dpi`;
			URL.revokeObjectURL(url);
		};
		image.onerror = () => URL.revokeObjectURL(url);
		image.src = url;
	}

	async #readPdf(file: File) {
		try {
			const { PDFDocument } = await import('pdf-lib');
			const pdf = await PDFDocument.load(
				await file.arrayBuffer(),
			);
			if (pdf.getPageCount() === 0) return;
			const { width, height } = pdf.getPage(0).getSize();
			// A PDF is measured in points, so the search goes straight to mm and
			// the pixel dimensions that drive the DPI row do not apply.
			this.#clearUpload();
			const widthMm = Math.round(
				(width / POINTS_PER_INCH) * INCH_TO_MM,
			);
			const heightMm = Math.round(
				(height / POINTS_PER_INCH) * INCH_TO_MM,
			);
			this.searchQuery = `${widthMm}x${heightMm}mm`;
		} catch {
			// A file pdf-lib cannot open leaves the search as it was.
		}
	}

	<template>
		<div class="dt-paper">
			<div class="dt-paper-panel">
				<div class="dt-paper-bar">
					<div class="dt-paper-bar-label">
						{{! wording carried over from the Next app }}
						<span>Unit</span>
					</div>
					<div class="segmented dt-paper-units">
						<button
							type="button"
							class="dt-paper-toggle
								{{if
									(eq
										this.unit
										'mm'
									)
									'is-active'
								}}"
							{{on
								"click"
								(fn
									this.setUnit
									"mm"
								)
							}}
						>mm</button>
						<button
							type="button"
							class="dt-paper-toggle
								{{if
									(eq
										this.unit
										'in'
									)
									'is-active'
								}}"
							{{on
								"click"
								(fn
									this.setUnit
									"in"
								)
							}}
						>in</button>
					</div>
					<div class="segmented dt-paper-views">
						<button
							type="button"
							class="dt-paper-toggle
								{{unless
									this.overlayMode
									'is-active'
								}}"
							{{on
								"click"
								(fn
									this.setOverlayMode
									false
								)
							}}
						>
							<Icon
								@name="layout-grid"
							/>
							{{! wording carried over from the Next app }}
							Side by Side
						</button>
						<button
							type="button"
							class="dt-paper-toggle
								{{if
									this.overlayMode
									'is-active'
								}}"
							{{on
								"click"
								(fn
									this.setOverlayMode
									true
								)
							}}
						>
							<Icon @name="layers" />
							{{! wording carried over from the Next app }}
							Overlay
						</button>
					</div>
				</div>

				{{#if this.overlayMode}}
					<div
						class="dt-paper-stage"
						style={{this.previewHeightStyle}}
					>
						{{#if this.first}}
							<span
								class="dt-paper-overlay-layer"
							><span
									class="dt-paper-box is-first"
									style={{this.firstBoxStyle}}
								></span></span>
						{{/if}}
						{{#if this.second}}
							<span
								class="dt-paper-overlay-layer"
							><span
									class="dt-paper-box is-second"
									style={{this.secondBoxStyle}}
								></span></span>
						{{/if}}
						{{#unless this.hasSelection}}
							{{! wording carried over from the Next app }}
							<span
								class="dt-paper-empty"
							>Select sizes below to
								compare</span>
						{{/unless}}
					</div>
					<div class="dt-paper-columns">
						<div
							class="dt-paper-detail
								{{if
									this.first
									'is-first'
								}}"
						>
							<SizeDetails
								@details={{this.firstDetails}}
								@slot={{0}}
								@clear={{this.clearSlot}}
							/>
						</div>
						<div
							class="dt-paper-detail
								{{if
									this.second
									'is-second'
								}}"
						>
							<SizeDetails
								@details={{this.secondDetails}}
								@slot={{1}}
								@clear={{this.clearSlot}}
							/>
						</div>
					</div>
				{{else}}
					<div class="dt-paper-columns">
						<div class="dt-paper-column">
							<div
								class="dt-paper-stage
									{{if
										this.first
										'is-first'
									}}"
								style={{this.previewHeightStyle}}
							>
								{{#if
									this.first
								}}
									<span
										class="dt-paper-box is-first"
										style={{this.firstBoxStyle}}
									></span>
								{{else}}
									{{! wording carried over from the Next app }}
									<span
										class="dt-paper-empty"
									>Click a
										size
										below</span>
								{{/if}}
							</div>
							<div
								class="dt-paper-detail
									{{if
										this.first
										'is-first'
									}}"
							>
								<SizeDetails
									@details={{this.firstDetails}}
									@slot={{0}}
									@clear={{this.clearSlot}}
								/>
							</div>
						</div>
						<div class="dt-paper-column">
							<div
								class="dt-paper-stage
									{{if
										this.second
										'is-second'
									}}"
								style={{this.previewHeightStyle}}
							>
								{{#if
									this.second
								}}
									<span
										class="dt-paper-box is-second"
										style={{this.secondBoxStyle}}
									></span>
								{{else}}
									{{! wording carried over from the Next app }}
									<span
										class="dt-paper-empty"
									>Click a
										size
										below</span>
								{{/if}}
							</div>
							<div
								class="dt-paper-detail
									{{if
										this.second
										'is-second'
									}}"
							>
								<SizeDetails
									@details={{this.secondDetails}}
									@slot={{1}}
									@clear={{this.clearSlot}}
								/>
							</div>
						</div>
					</div>
				{{/if}}

				<div class="dt-paper-legend">
					<span class="dt-paper-legend-item">
						<span
							class="dt-paper-legend-swatch is-first"
						></span>
						{{! wording carried over from the Next app }}
						<span>First selection</span>
					</span>
					<span class="dt-paper-legend-item">
						<span
							class="dt-paper-legend-swatch is-second"
						></span>
						{{! wording carried over from the Next app }}
						<span>Second selection</span>
					</span>
				</div>
			</div>

			<div class="dt-paper-panel">
				<div class="dt-paper-search">
					<span class="dt-paper-search-field">
						<Icon
							class="dt-paper-search-icon"
							@name="search"
						/>
						{{! wording carried over from the Next app }}
						<input
							type="text"
							class="dt-paper-search-input"
							value={{this.searchQuery}}
							placeholder="Search: A4, 210x297mm, 8.5x11in, 1920x1080@300dpi..."
							aria-label="Search"
							{{on
								"input"
								this.setSearchQuery
							}}
						/>
						{{#if this.searchQuery}}
							<button
								type="button"
								class="dt-paper-search-clear"
								aria-label="Clear"
								{{on
									"click"
									this.clearSearch
								}}
							><Icon
									@name="x"
								/></button>
						{{/if}}
					</span>
					<label class="dt-paper-upload">
						<Icon @name="upload" />
						{{! wording carried over from the Next app }}
						Upload
						<input
							type="file"
							accept="image/*,.pdf"
							{{on
								"change"
								this.readFile
							}}
						/>
					</label>
				</div>

				{{#if this.showDpi}}
					<div class="dt-paper-dpi">
						{{! wording carried over from the Next app }}
						<span
							class="dt-paper-dpi-label"
						>DPI</span>
						<div
							class="segmented dt-paper-dpi-options"
						>
							{{#each
								this.dpiOptions
								key="@identity"
								as |dpi|
							}}
								<button
									type="button"
									class="dt-paper-toggle
										{{if
											(eq
												this.uploadDpi
												dpi
											)
											'is-active'
										}}"
									{{on
										"click"
										(fn
											this.setUploadDpi
											dpi
										)
									}}
								>{{dpi}}</button>
							{{/each}}
						</div>
					</div>
				{{/if}}
			</div>

			{{#if this.matchRows}}
				<div class="dt-paper-panel">
					<div class="dt-paper-matches-head">
						{{! wording carried over from the Next app }}
						<span
							class="dt-paper-matches-title"
						>Closest matches for
							{{this.matchTargetLabel}}</span>
						<button
							type="button"
							class="dt-paper-matches-toggle
								{{if
									this.matchesOpen
									'is-open'
								}}"
							aria-label="Toggle"
							{{on
								"click"
								this.toggleMatches
							}}
						><Icon
								@name="chevron-down"
							/></button>
					</div>
					{{#if this.matchesOpen}}
						<div class="dt-paper-matches">
							{{#each
								this.matchRows
								key="key"
								as |match|
							}}
								<button
									type="button"
									class="dt-paper-match"
									{{on
										"click"
										(fn
											this.select
											match.size
										)
									}}
								>
									<span
										class="dt-paper-match-head"
									>
										<span
											class="dt-paper-match-label"
										>{{match.label}}</span>
										{{#if
											match.isBest
										}}
											{{! wording carried over from the Next app }}
											<span
												class="dt-paper-badge"
											>Best</span>
										{{/if}}
									</span>
									<span
										class="dt-paper-match-dims"
									>{{match.dimensions}}</span>
									<span
										class="dt-paper-match-diff"
									>
										<span
											class={{if
												match.widthOver
												"is-over"
												"is-under"
											}}
										>{{match.widthDiff}}</span>
										<span
											class="dt-paper-match-sep"
										>/</span>
										<span
											class={{if
												match.heightOver
												"is-over"
												"is-under"
											}}
										>{{match.heightDiff}}</span>
									</span>
								</button>
							{{/each}}
						</div>
					{{/if}}
				</div>
			{{/if}}

			{{#each this.groups key="id" as |group|}}
				<div class="dt-paper-panel">
					<div class="dt-paper-group-head">
						<h3
							class="dt-paper-group-title"
						>{{group.label}}</h3>
						<p
							class="dt-paper-group-desc"
						>{{group.description}}</p>
					</div>
					<div>
						{{#each
							group.rows key="key"
							as |row|
						}}
							<button
								type="button"
								class="dt-paper-row
									{{if
										row.isFirst
										'is-first'
									}}
									{{if
										row.isSecond
										'is-second'
									}}
									{{if
										row.isDimmed
										'is-dimmed'
									}}"
								{{on
									"click"
									(fn
										this.select
										row.size
									)
								}}
							>
								<span
									class="dt-paper-row-label"
								>{{row.label}}</span>
								<span
									class="dt-paper-row-dims"
								>{{row.dimensions}}</span>
								{{#if
									row.isSelected
								}}
									<span
										class="dt-paper-row-slot
											{{if
												row.isFirst
												'is-first'
												'is-second'
											}}"
									>{{row.slotLabel}}</span>
								{{/if}}
							</button>
						{{/each}}
					</div>
				</div>
			{{/each}}
		</div>
	</template>
}
