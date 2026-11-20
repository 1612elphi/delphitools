import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import type Owner from '@ember/owner';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonEmptyRow from 'delphicanon/components/canon-empty-row';
import CanonFileCell from 'delphicanon/components/canon-file-cell';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonJumpHeading from 'delphicanon/components/canon-jump-heading';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonTextCell from 'delphicanon/components/canon-text-cell';
import CanonTiles from 'delphicanon/components/canon-tiles';
import {
	allSeries,
	type PaperSize,
} from 'delphitools-v2/components/tools/paper-sizes/data';
import {
	allPicks,
	closest,
	dimensions,
	dpis,
	matches,
	mediaBox,
	named,
	pageQuery,
	parseQuery,
	pixelUnit,
	signed,
	unitLabels,
	unitNames,
	type PaperPick,
	type PaperQuery,
	type PaperUnit,
} from 'delphitools-v2/components/tools/paper-sizes/paper';
import Cell from 'delphitools-v2/components/tools/paper-sizes/cell';
import Picture from 'delphitools-v2/components/tools/paper-sizes/picture';
import './paper-sizes/paper-sizes.css';

const unitKey = 'paperSizeUnit';

function savedUnit(): PaperUnit {
	try {
		const saved = localStorage.getItem(unitKey);
		if (saved === 'in') return 2;
		const index = Number(saved);
		return index > 0 && index <= pixelUnit
			? (index as PaperUnit)
			: 0;
	} catch {
		return 0;
	}
}

const editable = (target: EventTarget | null) =>
	target instanceof HTMLElement &&
	(target.isContentEditable || target.matches('input, textarea, select'));

const findPlaceholder = 'A4 · 210×297 · 2480×3508@300dpi';
const dpiLabels = dpis.map((dpi) => `${dpi} DPI`);
const columns = 3;

async function pdfPoints(file: File): Promise<[number, number] | undefined> {
	const bytes = new Uint8Array(await file.arrayBuffer());
	const source = new TextDecoder('windows-1252').decode(bytes);
	const plain = mediaBox(source);
	if (plain) return plain;
	for (const found of source.matchAll(/stream\r?\n/g)) {
		const start = found.index + found[0].length;
		const end = source.indexOf('endstream', start);
		if (end < 0) break;
		const box = mediaBox(await inflate(bytes.subarray(start, end)));
		if (box) return box;
	}
	return undefined;
}

async function inflate(chunk: Uint8Array): Promise<string> {
	const reader = new Blob([chunk as BlobPart])
		.stream()
		.pipeThrough(new DecompressionStream('deflate'))
		.getReader();
	const decoder = new TextDecoder('windows-1252');
	let text = '';
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			text += decoder.decode(value, { stream: true });
		}
	} catch {
		// trailing bytes or not deflate
	}
	return text;
}

export default class PaperSizes extends Component {
	@tracked slots: (PaperPick | undefined)[] = [named('A4'), undefined];
	@tracked nextSlot = 1;
	@tracked unit: PaperUnit = savedUnit();
	@tracked dpiIndex = 2;
	@tracked text = '';
	@tracked query: PaperQuery = parseQuery('');
	arrangement = 0;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		const compared = (query.get('paperCompare') ?? '')
			.split(',')
			.filter(Boolean);
		if (compared.length) {
			this.slots = [
				named(compared[0]!),
				compared[1] ? named(compared[1]) : undefined,
			];
			this.nextSlot = 0;
		}
		const unit = Number(query.get('paperUnit'));
		if (unit >= 0 && unit <= pixelUnit && query.has('paperUnit'))
			this.unit = unit as PaperUnit;
		this.arrangement = Number(query.get('paperArrange') ?? 0) || 0;
		this.#setQuery(query.get('paperFind') ?? '');
	}

	get dpi(): number {
		return this.query.kind === 'size' && this.query.dpi
			? this.query.dpi
			: dpis[this.dpiIndex]!;
	}

	get pixelQuery() {
		return (
			this.query.kind === 'size' &&
			this.query.pixels !== undefined
		);
	}

	get showsDpi() {
		return this.unit === pixelUnit || this.pixelQuery;
	}

	get shownDpiIndex() {
		const index = dpis.indexOf(this.dpi);
		return index < 0 ? this.dpiIndex : index;
	}

	get marks(): Map<string, number> {
		const marks = new Map<string, number>();
		this.slots.forEach(
			(pick, index) => pick && marks.set(pick.key, index + 1),
		);
		return marks;
	}

	dimensionsOf(size: PaperSize) {
		return dimensions(size, this.unit, this.dpi);
	}

	get legend() {
		return this.slots.map(
			(pick, index) =>
				pick &&
				`${index + 1} · ${pick.size.name} · ${this.dimensionsOf(pick.size)}`,
		);
	}

	get sizes() {
		return this.slots.map((pick) => pick?.size);
	}

	cell = (pick: PaperPick, detail?: string) => ({
		key: pick.key,
		pick,
		size: pick.size,
		text: this.dimensionsOf(pick.size),
		mark: this.marks.get(pick.key),
		detail,
	});

	get closest() {
		const { query } = this;
		if (query.kind !== 'size') return [];
		return closest(query.width, query.height).map(
			({ pick, dw, dh }) =>
				this.cell(
					pick,
					`${signed(dw)} × ${signed(dh)} mm`,
				),
		);
	}

	get series() {
		return allSeries.flatMap((series) => {
			const cells = allPicks
				.filter(
					(pick) =>
						pick.series === series.id &&
						matches(this.query, pick),
				)
				.map((pick) => this.cell(pick));
			return cells.length
				? [
						{
							id: series.id,
							name: series.name,
							count: String(
								series.sizes
									.length,
							),
							cells,
						},
					]
				: [];
		});
	}

	get sheets() {
		return this.slots.flatMap((pick, index) =>
			pick
				? [
						{
							title: `${index + 1} · ${pick.size.name}`,
							tiles: unitNames.map(
								(
									name,
									unit,
								) => ({
									label:
										unit ===
										pixelUnit
											? `${name} · ${this.dpi} DPI`
											: name,
									value: dimensions(
										pick.size,
										unit as PaperUnit,
										this
											.dpi,
									),
								}),
							),
						},
					]
				: [],
		);
	}

	pick = (pick: PaperPick) => {
		const slots = [...this.slots];
		slots[this.nextSlot] = pick;
		this.slots = slots;
		this.nextSlot = this.nextSlot === 0 ? 1 : 0;
	};

	find = (text: string) => this.#setQuery(text);

	#setQuery(text: string) {
		this.text = text;
		this.query = parseQuery(text);
	}

	selectAll = (event: FocusEvent) => {
		const field = event.target;
		if (field instanceof HTMLInputElement)
			requestAnimationFrame(() => field.select());
	};

	pickUnit = (index: number) => {
		this.unit = index as PaperUnit;
		try {
			localStorage.setItem(unitKey, String(index));
		} catch {
			// private mode: the unit lasts the visit
		}
	};

	takeFiles = modifier((element: HTMLElement) => {
		const paste = (event: ClipboardEvent) => {
			if (editable(event.target)) return;
			const file = event.clipboardData?.files[0];
			if (!file) return;
			event.preventDefault();
			void this.open(file);
		};
		const over = (event: DragEvent) => {
			if (event.dataTransfer?.types.includes('Files'))
				event.preventDefault();
		};
		const drop = (event: DragEvent) => {
			const file = event.dataTransfer?.files[0];
			if (!file) return;
			event.preventDefault();
			void this.open(file);
		};
		document.addEventListener('paste', paste);
		element.addEventListener('dragover', over);
		element.addEventListener('drop', drop);
		return () => {
			document.removeEventListener('paste', paste);
			element.removeEventListener('dragover', over);
			element.removeEventListener('drop', drop);
		};
	});

	pickDpi = (index: number) => {
		this.dpiIndex = index;
		const { query } = this;
		if (query.kind === 'size' && query.pixels) {
			const [w, h] = query.pixels;
			this.#setQuery(`${w}x${h}@${dpis[index]}dpi`);
		}
	};

	open = async (file: File) => {
		if (
			file.type === 'application/pdf' ||
			file.name.toLowerCase().endsWith('.pdf')
		) {
			const points = await pdfPoints(file);
			if (points) this.#setQuery(pageQuery(points));
			return;
		}
		// ponytail: an unreadable image leaves the query as it was
		const image = await createImageBitmap(file).catch(
			() => undefined,
		);
		if (!image) return;
		this.#setQuery(
			`${image.width}x${image.height}@${dpis[this.dpiIndex]}dpi`,
		);
		image.close();
	};

	<template>
		<CanonSplit
			class="paper-sizes"
			@halves={{true}}
			@collapsesTo={{240}}
			{{this.takeFiles}}
		>
			<:sidebar>
				<CanonCanvas
					@aspect={{0.8}}
					@maxHeight={{640}}
					@background="var(--canon-muted)"
				>
					<Picture
						@sizes={{this.sizes}}
						@legend={{this.legend}}
						@arrangement={{this.arrangement}}
					/>
				</CanonCanvas>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Find" />
					<CanonTextCell
						class="paper-find"
						aria-label="Find"
						autocomplete="off"
						autocapitalize="none"
						spellcheck="false"
						@value={{this.text}}
						@placeholder={{findPlaceholder}}
						@onChange={{this.find}}
						{{on "focus" this.selectAll}}
					/>
					<CanonRow
						@title="From file"
						@form="flush"
						as |titleId|
					>
						<CanonFileCell
							@accept="image/*,.pdf,application/pdf"
							@labelledBy={{titleId}}
							@onChange={{this.open}}
						/>
					</CanonRow>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Units" />
					<CanonSegmented
						aria-label="Units"
						@items={{unitLabels}}
						@selected={{this.unit}}
						@onChange={{this.pickUnit}}
					/>
					{{#if this.showsDpi}}
						<CanonSegmented
							aria-label="DPI"
							@items={{dpiLabels}}
							@selected={{this.shownDpiIndex}}
							@onChange={{this.pickDpi}}
						/>
					{{/if}}
				</CanonRows>
				<CanonRows @framed={{true}}>
					{{#each this.sheets as |sheet|}}
						<CanonHeading
							@text={{sheet.title}}
						/>
						<CanonTiles
							@items={{sheet.tiles}}
						/>
					{{/each}}
				</CanonRows>
				{{#if this.closest.length}}
					<CanonRows @framed={{true}}>
						<CanonHeading @text="Closest" />
						<CanonGrid @columns={{columns}}>
							{{#each
								this.closest
								key="key"
								as |cell|
							}}
								<Cell
									@size={{cell.size}}
									@text={{cell.text}}
									@mark={{cell.mark}}
									@detail={{cell.detail}}
									@onPick={{fn
										this.pick
										cell.pick
									}}
								/>
							{{/each}}
						</CanonGrid>
					</CanonRows>
				{{/if}}
				<CanonRows @framed={{true}}>
					{{#each
						this.series key="id"
						as |series|
					}}
						<CanonJumpHeading
							@text={{series.name}}
							@detail={{series.count}}
						/>
						<CanonGrid @columns={{columns}}>
							{{#each
								series.cells
								key="key"
								as |cell|
							}}
								<Cell
									@size={{cell.size}}
									@text={{cell.text}}
									@mark={{cell.mark}}
									@onPick={{fn
										this.pick
										cell.pick
									}}
								/>
							{{/each}}
						</CanonGrid>
					{{else}}
						<CanonEmptyRow
							@text="No match"
						/>
					{{/each}}
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}
