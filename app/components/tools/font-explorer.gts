import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import { htmlSafe } from '@ember/template';
import type Owner from '@ember/owner';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonCodeBlock from 'delphicanon/components/canon-code-block';
import CanonDropZone from 'delphicanon/components/canon-drop-zone';
import CanonEmptyRow from 'delphicanon/components/canon-empty-row';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonTextCell from 'delphicanon/components/canon-text-cell';
import CanonTiles from 'delphicanon/components/canon-tiles';
import CanonValueLine from 'delphicanon/components/canon-value-line';
import type CanonToastService from 'delphicanon/services/canon-toast';
import { IconSvg } from 'delphitools-v2/components/icon';
import GlyphTable from 'delphitools-v2/components/tools/font-explorer/glyph-table';
import { coveredCodes } from 'delphitools-v2/components/tools/font-explorer/table';
import Picture, {
	standIn,
	type Shares,
} from 'delphitools-v2/components/tools/font-explorer/picture';
import {
	chartRange,
	readFont,
	signed,
	specimen,
	tableDescriptions,
	unwrap,
	type FontFacts,
} from 'delphitools-v2/components/tools/font-explorer/sfnt';
import filePaste, { matchesAccept } from 'delphitools-v2/modifiers/file-paste';
import './font-explorer/font-explorer.css';

const FONT_EXTENSION = /\.(ttf|otf|woff2?)$/i;

export function isFontFile(fileName: string): boolean {
	return FONT_EXTENSION.test(fileName);
}

export function baseName(fileName: string): string {
	return fileName.replace(FONT_EXTENSION, '');
}

export function postScriptName(fileName: string): string {
	return baseName(fileName).replace(/\s+/g, '-');
}

export function fontFormat(fileName: string): string {
	const name = fileName.toLowerCase();
	if (name.endsWith('.woff2')) return 'woff2';
	if (name.endsWith('.woff')) return 'woff';
	if (name.endsWith('.otf')) return 'opentype';
	return 'truetype';
}

export function cssUsage(fileName: string, family = baseName(fileName)) {
	return `@font-face {
  font-family: '${family}';
  src: url('${fileName}') format('${fontFormat(fileName)}');
  font-weight: normal;
  font-style: normal;
}

.my-text {
  font-family: '${family}', sans-serif;
}`;
}

const ACCEPT = '.ttf,.otf,.woff,.woff2';
const DEFAULT_PREVIEW = 'The quick brown fox jumps over the lazy dog';
const NOT_A_FONT = 'Please upload a font file (.ttf, .otf, .woff, .woff2)';
const LOAD_FAILED =
	'Failed to load font. The file may be corrupted or invalid.';
const WATERFALL_SIZES = [12, 14, 16, 18, 24, 32, 48, 64, 72, 96];
const SAMPLE_TEXTS = [
	'The quick brown fox jumps over the lazy dog',
	'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
	'abcdefghijklmnopqrstuvwxyz',
	'0123456789',
	'!@#$%^&*()_+-=[]{}|;\':",./<>?',
	'Sphinx of black quartz, judge my vow',
	'Pack my box with five dozen liquor jugs',
];
const rowPadding = 20;

const FontIcon = <template><IconSvg @name="file-type" /></template>;
const Trash = <template><IconSvg @name="trash-2" /></template>;

const keepPaste = (event: Event) => event.stopPropagation();

let familySeq = 0;

function measured(family: string): Shares {
	const context = document.createElement('canvas').getContext('2d');
	if (!context) return standIn;
	context.font = `1000px ${family}`;
	const box = context.measureText('Hxdp');
	const share = (text: string) =>
		context.measureText(text).actualBoundingBoxAscent / 1000;
	return {
		ascent: box.fontBoundingBoxAscent / 1000,
		descent: box.fontBoundingBoxDescent / 1000,
		capHeight: share('H'),
		xHeight: share('x'),
		unitsPerEm: 1000,
	};
}

interface Loaded {
	fileName: string;
	family: string;
	facts?: FontFacts;
	shares: Shares;
}

export default class FontExplorerTool extends Component {
	@service('canon-toast') declare toast: CanonToastService;

	@tracked loaded?: Loaded;
	@tracked error: string | null = null;
	@tracked previewText = DEFAULT_PREVIEW;
	@tracked tableOpen = false;

	#objectUrl: string | null = null;
	#fontFace: FontFace | null = null;
	#runId = 0;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const text = new URLSearchParams(window.location.search).get(
			'fxText',
		);
		if (text !== null) this.previewText = text;
	}

	willDestroy() {
		super.willDestroy();
		this.#release();
	}

	get text() {
		return this.previewText || DEFAULT_PREVIEW;
	}

	get facts() {
		return this.loaded?.facts;
	}

	get specimen() {
		const covers = this.facts?.covers;
		return covers ? specimen(covers) : 'Hxdp';
	}

	get pictureFamily() {
		return this.loaded?.family ?? 'system-ui, sans-serif';
	}

	get caption() {
		const { loaded } = this;
		if (!loaded) return 'Font';
		return loaded.facts?.fullName || baseName(loaded.fileName);
	}

	get figure() {
		return this.facts ? String(this.facts.unitsPerEm) : '—';
	}

	get overview() {
		const { loaded, facts } = this;
		if (!loaded) return [];
		return [
			{ label: 'Family', value: facts?.family },
			{ label: 'Style', value: facts?.style },
			{
				label: 'Full Name',
				value:
					facts?.fullName ??
					baseName(loaded.fileName),
			},
			{
				label: 'PostScript Name',
				value:
					facts?.postScriptName ??
					postScriptName(loaded.fileName),
			},
			{ label: 'File Name', value: loaded.fileName },
		];
	}

	get metrics() {
		const facts = this.facts;
		if (!facts) return [];
		const optional = (value?: number) =>
			value === undefined ? '—' : signed(value);
		return [
			{
				label: 'Units per Em',
				value: String(facts.unitsPerEm),
			},
			{
				label: 'Glyph Count',
				value: facts.glyphCount.toLocaleString('en'),
			},
			{ label: 'Ascent', value: signed(facts.ascent) },
			{ label: 'Descent', value: signed(-facts.descent) },
			{ label: 'Line Gap', value: signed(facts.lineGap) },
			{
				label: 'Cap Height',
				value: optional(facts.capHeight),
			},
			{ label: 'x-Height', value: optional(facts.xHeight) },
			{
				label: 'Italic Angle',
				value: `${signed(Math.round(facts.italicAngle))}°`,
			},
			{
				label: 'Bounding Box',
				value: `${facts.box.width} × ${facts.box.height}`,
			},
		];
	}

	get tables() {
		return (this.facts?.tables ?? []).map((tag) => ({
			tag,
			description: tableDescriptions[tag] ?? '—',
		}));
	}

	get rowDepth() {
		const { shares } = this.loaded ?? { shares: standIn };
		return shares.ascent + shares.descent;
	}

	get waterfall() {
		const family = this.loaded?.family ?? 'inherit';
		return WATERFALL_SIZES.map((size) => ({
			size,
			style: htmlSafe(
				`font-family: ${family}; font-size: ${size}px; min-block-size: ${Math.max(44, Math.ceil(this.rowDepth * size) + rowPadding)}px`,
			),
		}));
	}

	get samples() {
		const family = this.loaded?.family ?? 'inherit';
		return SAMPLE_TEXTS.map((text, index) => ({
			text,
			style: htmlSafe(
				`font-family: ${family}; font-size: ${index < 2 ? 24 : 18}px`,
			),
		}));
	}

	get chart() {
		const facts = this.facts;
		if (!facts) return undefined;
		const [start, end] = chartRange(facts.covers);
		const codes: number[] = [];
		for (let code = start; code <= end; code++)
			if (facts.covers(code)) codes.push(code);
		const hex = (n: number) =>
			n.toString(16).toUpperCase().padStart(4, '0');
		return {
			title: `Glyphs · U+${hex(start)}–${hex(end)}`,
			cells: codes.map((code) => ({
				code,
				char: String.fromCodePoint(code),
				label: `U+${hex(code)}`,
			})),
		};
	}

	get tableCodes() {
		return this.tableOpen && this.facts
			? coveredCodes(this.facts.ranges)
			: [];
	}

	openTable = () => (this.tableOpen = true);

	closeTable = () => (this.tableOpen = false);

	get chartStyle() {
		return htmlSafe(
			`font-family: ${this.loaded?.family ?? 'inherit'}`,
		);
	}

	get css() {
		const { loaded } = this;
		return loaded
			? cssUsage(
					loaded.fileName,
					this.facts?.family || undefined,
				)
			: '';
	}

	#release() {
		if (this.#objectUrl) URL.revokeObjectURL(this.#objectUrl);
		this.#objectUrl = null;
		if (this.#fontFace) document.fonts.delete(this.#fontFace);
		this.#fontFace = null;
	}

	readFile = async (file: File) => {
		if (!isFontFile(file.name)) {
			this.error = NOT_A_FONT;
			return;
		}
		const runId = ++this.#runId;
		this.#release();
		this.error = null;
		this.loaded = undefined;

		const url = URL.createObjectURL(file);
		this.#objectUrl = url;
		const family = `preview-${familySeq++}`;
		const fontFace = new FontFace(family, `url(${url})`);

		try {
			const [facts] = await Promise.all([
				file
					.arrayBuffer()
					.then(unwrap)
					.then(readFont)
					.catch(() => undefined),
				fontFace.load(),
			]);
			if (runId !== this.#runId) {
				URL.revokeObjectURL(url);
				return;
			}
			document.fonts.add(fontFace);
			this.#fontFace = fontFace;
			const shares = facts
				? {
						ascent:
							facts.ascent /
							facts.unitsPerEm,
						descent:
							facts.descent /
							facts.unitsPerEm,
						capHeight:
							(facts.capHeight ??
								measured(family)
									.capHeight *
									facts.unitsPerEm) /
							facts.unitsPerEm,
						xHeight:
							(facts.xHeight ??
								measured(family)
									.xHeight *
									facts.unitsPerEm) /
							facts.unitsPerEm,
						unitsPerEm: facts.unitsPerEm,
					}
				: measured(family);
			this.loaded = {
				fileName: file.name,
				family,
				facts,
				shares,
			};
		} catch (loadError) {
			if (runId !== this.#runId) return;
			console.error('Font load failed:', loadError);
			this.#release();
			this.error = LOAD_FAILED;
		}
	};

	loadFiles = (files: File[]) => {
		const file = files[0];
		if (file) void this.readFile(file);
	};

	allowDrop = (event: DragEvent) => event.preventDefault();

	dropAnywhere = (event: DragEvent) => {
		if (event.defaultPrevented) return;
		event.preventDefault();
		const file = [...(event.dataTransfer?.files ?? [])].find((f) =>
			matchesAccept(f, ACCEPT),
		);
		if (file) void this.readFile(file);
		else this.error = NOT_A_FONT;
	};

	setPreviewText = (text: string) => (this.previewText = text);

	copyGlyph = (char: string) => void this.toast.copy(char);

	clear = () => {
		this.#runId++;
		this.#release();
		this.loaded = undefined;
		this.error = null;
		this.tableOpen = false;
	};

	<template>
		<CanonSplit
			class="font-explorer"
			{{filePaste this.readFile accept=ACCEPT}}
			{{on "dragover" this.allowDrop}}
			{{on "drop" this.dropAnywhere}}
		>
			<:banner>
				<CanonCanvas @height={{260}}>
					<Picture
						@text={{this.specimen}}
						@family={{this.pictureFamily}}
						@shares={{if
							this.loaded
							this.loaded.shares
							standIn
						}}
						@values={{if
							this.facts
							true
							false
						}}
						@caption={{this.caption}}
						@detail={{this.loaded.fileName}}
						@figure={{this.figure}}
						@figureUnit={{if
							this.facts
							"UPM"
						}}
					/>
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<CanonRows @framed={{true}}>
					{{#if this.loaded}}
						<CanonHeading @text="Font" />
						<div class="fx-file">
							<span
								class="fx-file-names"
							>
								<span
									class="fx-file-title"
								>{{this.caption}}</span>
								<span
									class="fx-file-name"
								>{{this.loaded.fileName}}</span>
							</span>
							<CanonButton
								@kind="cell"
								@label="Clear font"
								@icon={{Trash}}
								@onClick={{this.clear}}
							/>
						</div>
						<CanonHeading @text="Preview" />
						<CanonTextCell
							class="fx-preview"
							@value={{this.previewText}}
							@placeholder="Type to preview…"
							@onChange={{this.setPreviewText}}
							aria-label="Preview"
						/>
					{{else}}
						<CanonDropZone
							@prompt="Drop font file here"
							@icon={{FontIcon}}
							@accept={{ACCEPT}}
							@paste={{false}}
							@onFiles={{this.loadFiles}}
							{{on "paste" keepPaste}}
						/>
					{{/if}}
					{{#if this.error}}
						<CanonStatus
							@text={{this.error}}
							@tone="warn"
							@row={{true}}
						/>
					{{/if}}
				</CanonRows>
				{{#if this.loaded}}
					<CanonRows @framed={{true}}>
						<CanonHeading
							@text="Overview"
						/>
						{{#each
							this.overview
							key="label"
							as |line|
						}}
							<CanonValueLine
								@label={{line.label}}
								@value={{line.value}}
								@labelWidth={{112}}
							/>
						{{/each}}
					</CanonRows>
					{{#if this.facts}}
						<CanonRows @framed={{true}}>
							<CanonHeading
								@text="Metrics"
							/>
							<CanonTiles
								@items={{this.metrics}}
							/>
						</CanonRows>
						<CanonRows @framed={{true}}>
							<CanonHeading
								@text="Tables"
							/>
							{{#each
								this.tables
								key="tag"
								as |table|
							}}
								<div
									class="fx-table"
								>
									<span
										class="fx-table-tag"
									>{{table.tag}}</span>
									<span
										class="fx-table-detail"
									>{{table.description}}</span>
								</div>
							{{/each}}
						</CanonRows>
					{{/if}}
				{{/if}}
			</:sidebar>
			<:main>
				{{#if this.loaded}}
					<div class="fx-columns">
						<div class="fx-columns-grid">
							<div class="fx-column">
								<CanonRows
									@framed={{true}}
									class="fx-waterfall-rows"
								>
									<CanonHeading
										@text="Waterfall"
									/>
									<div
										class="fx-waterfall"
										role="img"
										aria-label={{this.text}}
									>
										{{#each
											this.waterfall
											key="size"
											as |row|
										}}
											<div
												class="fx-step"
											>
												<span
													class="fx-step-size"
													aria-hidden="true"
												>{{row.size}}</span>
												<span
													class="fx-step-text"
													style={{row.style}}
													aria-hidden="true"
												>{{this.text}}</span>
											</div>
										{{/each}}
									</div>
								</CanonRows>
								<CanonRows
									@framed={{true}}
									class="fx-sample-rows"
								>
									<CanonHeading
										@text="Sample Texts"
									/>
									{{#each
										this.samples
										key="text"
										as |row|
									}}
										<div
											class="fx-sample"
											style={{row.style}}
										>{{row.text}}</div>
									{{/each}}
								</CanonRows>
								<CanonRows
									@framed={{true}}
									class="fx-css-rows"
								>
									<CanonCodeBlock
										@code={{this.css}}
										@language="CSS"
									/>
								</CanonRows>
							</div>
							<div class="fx-column">
								{{#if
									this.chart
								}}
									<CanonRows
										@framed={{true}}
										class="fx-glyph-rows"
									>
										<CanonHeading
											@text={{this.chart.title}}
										/>
										<div
											class="fx-glyphs"
											style={{this.chartStyle}}
										>
											{{#each
												this.chart.cells
												key="code"
												as |cell|
											}}
												<button
													type="button"
													class="fx-glyph"
													aria-label={{cell.label}}
													{{on
														"click"
														(fn
															this.copyGlyph
															cell.char
														)
													}}
												>{{cell.char}}</button>
											{{/each}}
										</div>
										<CanonButton
											@kind="cell"
											@text="Show full table"
											@onClick={{this.openTable}}
										/>
									</CanonRows>
								{{/if}}
							</div>
						</div>
					</div>
					<GlyphTable
						@open={{this.tableOpen}}
						@codes={{this.tableCodes}}
						@family={{this.pictureFamily}}
						@onCopy={{this.copyGlyph}}
						@onClose={{this.closeTable}}
					/>
				{{else}}
					<CanonRows @framed={{true}}>
						<CanonEmptyRow
							@text="Load a .otf or .ttf file to inspect its metadata, metrics, glyphs, and OpenType tables."
						/>
					</CanonRows>
				{{/if}}
			</:main>
		</CanonSplit>
	</template>
}
