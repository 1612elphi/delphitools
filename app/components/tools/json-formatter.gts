import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import { htmlSafe } from '@ember/template';
import type Owner from '@ember/owner';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonEmptyRow from 'delphicanon/components/canon-empty-row';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonTiles from 'delphicanon/components/canon-tiles';
import type CanonToastService from 'delphicanon/services/canon-toast';
import { IconSvg } from 'delphitools-v2/components/icon';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import { downloadText } from 'delphitools-v2/lib/download';
import { downloadIcon, passAlong } from 'delphitools-v2/lib/flow-hooks';
import { formatBytes } from 'delphitools-v2/lib/image-compress';
import {
	INDENT_OPTIONS,
	buildTree,
	flattenTree,
	formatJson,
	parseJson,
	type IndentId,
} from 'delphitools-v2/lib/json-format';
import Editor from 'delphitools-v2/components/tools/json-formatter/editor';
import ShapePicture, {
	shapeHeight,
} from 'delphitools-v2/components/tools/json-formatter/shape-picture';
import {
	errorExcerpt,
	parentPath,
	shapeLevels,
	shapeOf,
	tokenRuns,
	type ShapeCell,
} from 'delphitools-v2/components/tools/json-formatter/shape';
import './json-formatter/json-formatter.css';

const ACCEPT = '.json,application/json,text/plain';
const dash = '—';
// ponytail: the listing renders every line; windowing lifts these caps
const previewLimit = 100_000;
const treeLimit = 5000;

const CopyIcon = <template><IconSvg @name="copy" /></template>;
const DownloadIcon = <template><IconSvg @name={{(downloadIcon)}} /></template>;

const samples: Record<string, string> = {
	invalid: '{\n  "name": "delphitools",\n  "tools": ["regex-tester", "text-diff",]\n}',
	deep: Array.from({ length: 12 }, (_, level) => level).reduce(
		(inner, level) => `{"level${level}":[${inner},${level}]}`,
		'"core"',
	),
	default: '{"name":"delphitools","version":"1.1.0","private":true,"tools":[{"id":"regex-tester","category":"dev","new":false,"shortcuts":["Test pattern"]},{"id":"text-diff","category":"dev","new":true,"shortcuts":[]},{"id":"json-formatter","category":"dev","new":true,"shortcuts":["Format JSON","Minify JSON"],"indent":[2,4,"tab"]}],"platforms":{"ios":{"minimum":"18.0","devices":["iPhone","iPad","iPhone Duo"]},"web":{"url":"https://delphi.tools","offline":true}},"languages":["en","de","fr","es","it","pt","ru","ja","zh-Hans","ar"],"licence":null,"downloads":48213,"rating":4.9}',
};

const indentIds: IndentId[] = INDENT_OPTIONS.map((option) => option.id);
const indentLabels = INDENT_OPTIONS.map((option) => option.label);
const views = ['Text', 'Tree'];

export default class JsonFormatterTool extends Component {
	@service('canon-toast') declare toast: CanonToastService;

	@tracked source = '';
	@tracked fileName: string | null = null;
	@tracked indent: IndentId = '2';
	@tracked tree = false;
	@tracked collapsed: ReadonlySet<string> = new Set();
	@tracked focus = 'root';
	@tracked selected: string | null = null;
	@tracked selectedLine: number | null = null;
	@tracked pictureHeight?: number;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		const sample = query.get('jsonSample');
		this.source =
			query.get('jsonText') ??
			(sample === null
				? ''
				: (samples[sample] ?? samples['default']!));
		const indent =
			indentIds[Math.min(3, Number(query.get('jsonIndent')))];
		if (query.has('jsonIndent') && indent) this.indent = indent;
		this.tree = query.get('jsonTree') === '1';
		const collapse = query.get('jsonCollapse');
		if (collapse) this.collapsed = new Set([collapse]);
		const taps = query.get('jsonTaps')?.split('|') ?? [];
		if (taps.length)
			requestAnimationFrame(() => {
				for (const path of taps) {
					const cell = this.shape?.cells.find(
						(entry) => entry.path === path,
					);
					if (cell && !this.isDestroying)
						this.tap(cell, false);
				}
			});
	}

	get hasInput() {
		return this.source.trim() !== '';
	}

	@cached
	get parsed() {
		return this.hasInput ? parseJson(this.source) : null;
	}

	get value(): { value: unknown } | undefined {
		const result = this.parsed;
		return result?.ok ? { value: result.value } : undefined;
	}

	get error() {
		const result = this.parsed;
		return result && !result.ok ? result.error : null;
	}

	@cached
	get formatted() {
		const { value } = this;
		return value ? formatJson(value.value, this.indent) : '';
	}

	@cached
	get rootShape() {
		const { value } = this;
		return value ? shapeOf(value.value) : null;
	}

	@cached
	get shape() {
		const { value } = this;
		if (!value) return null;
		return this.focus === 'root'
			? this.rootShape
			: shapeOf(value.value, this.focus);
	}

	get shapeHeight() {
		return shapeHeight(this.shape ? shapeLevels(this.shape) : 1);
	}

	get tiles() {
		const shape = this.rootShape;
		const count = (n: number | undefined) =>
			n === undefined ? dash : n.toLocaleString();
		return [
			{
				label: 'Size',
				value: shape
					? formatBytes(
							new TextEncoder().encode(
								this.formatted,
							).length,
						)
					: dash,
			},
			{ label: 'Depth', value: count(shape?.depth) },
			{ label: 'Keys', value: count(shape?.keys) },
			{ label: 'Values', value: count(shape?.values) },
		];
	}

	get indentIndex() {
		return indentIds.indexOf(this.indent);
	}

	get indentLabels() {
		return indentLabels;
	}

	get views() {
		return views;
	}

	@cached
	get listing() {
		const { formatted } = this;
		if (!formatted) return [];
		const text =
			formatted.length > previewLimit
				? `${formatted.slice(0, previewLimit)}\n…`
				: formatted;
		const selected =
			this.indent === 'minify' ? null : this.selectedLine;
		return text.split('\n').map((line, index) => ({
			number: index + 1,
			runs: tokenRuns(line || ' '),
			selected: selected === index,
		}));
	}

	@cached
	get walk() {
		const { value } = this;
		if (!value || !this.tree) return [];
		return flattenTree(buildTree(value.value), this.collapsed);
	}

	get treeRows() {
		return this.walk.slice(0, treeLimit).map((row) => {
			const { node } = row;
			const container = node.children !== null;
			return {
				path: node.path,
				container,
				collapsed: row.collapsed,
				glyph: container
					? row.collapsed
						? '▸ '
						: '▾ '
					: '',
				key: node.key,
				display: container
					? node.kind === 'array'
						? `[${node.entryCount}]`
						: `{${node.entryCount}}`
					: (row.display ?? ''),
				kind:
					node.kind === 'boolean' ||
					node.kind === 'null'
						? 'literal'
						: node.kind,
				selected: node.path === this.selected,
				style: htmlSafe(
					`padding-inline-start: ${row.depth * 16 + 20}px`,
				),
			};
		});
	}

	get listingStyle() {
		return htmlSafe(
			`--jf-digits: ${String(this.listing.length).length}`,
		);
	}

	get treeClipped() {
		return this.walk.length > treeLimit;
	}

	get excerpt() {
		const { error } = this;
		return error
			? errorExcerpt(this.source, error.line, error.column)
			: undefined;
	}

	get errorText() {
		const { error } = this;
		return error
			? `${error.message}  ·  ${error.line}:${error.column}`
			: '';
	}

	get downloadName() {
		const name = this.fileName ?? 'formatted.json';
		return name.endsWith('.json') ? name : `${name}.json`;
	}

	get downloadText() {
		return passAlong('Download');
	}

	setSource = (text: string) => {
		this.source = text;
		this.fileName = null;
		this.#resetFocus();
		if (!text) this.collapsed = new Set();
	};

	#resetFocus() {
		this.focus = 'root';
		this.selected = null;
		this.selectedLine = null;
	}

	readFile = (file: File) => void this.#load(file);

	async #load(file: File) {
		const text = (await file.text()).replace(/^\uFEFF/, '');
		if (this.isDestroying) return;
		this.source = text;
		this.fileName = file.name;
		this.collapsed = new Set();
		this.#resetFocus();
	}

	drop = (event: DragEvent) => {
		const file = event.dataTransfer?.files[0];
		if (!file) return;
		event.preventDefault();
		this.readFile(file);
	};

	dragOver = (event: DragEvent) => {
		if (event.dataTransfer?.types.includes('Files'))
			event.preventDefault();
	};

	setIndent = (index: number) => {
		this.indent = indentIds[index] ?? '2';
	};

	setView = (index: number) => {
		this.tree = index === 1;
	};

	toggle = (path: string) => {
		const next = new Set(this.collapsed);
		if (next.has(path)) next.delete(path);
		else next.add(path);
		this.collapsed = next;
	};

	tap = (cell: ShapeCell, reveals = true) => {
		let target = cell.path;
		if (cell.path === this.focus && this.focus !== 'root') {
			this.focus = parentPath(this.focus);
			target = this.focus;
		} else if (cell.opens && cell.path !== this.focus) {
			this.focus = cell.path;
			target = this.focus;
		}
		this.#select(target, reveals);
	};

	selectCell = (cell: ShapeCell) => this.#select(cell.path, true);

	#select(path: string, reveals: boolean) {
		this.selected = path;
		this.selectedLine =
			this.shape?.cells.find((cell) => cell.path === path)
				?.line ?? null;
		if (this.tree) {
			const above = [...this.collapsed].filter((open) =>
				path.startsWith(`${open}.`),
			);
			if (above.length)
				this.collapsed = new Set(
					[...this.collapsed].filter(
						(open) => !above.includes(open),
					),
				);
		}
		if (reveals)
			requestAnimationFrame(() =>
				document
					.querySelector(
						'.json-formatter .jf-row--selected',
					)
					?.scrollIntoView({ block: 'nearest' }),
			);
	}

	copy = () => void this.toast.copy(this.formatted);

	download = () =>
		downloadText(
			this.formatted,
			this.downloadName,
			'application/json;charset=utf-8',
		);

	measured = (height: number) => {
		if (height + 2 !== this.pictureHeight)
			this.pictureHeight = height + 2;
	};

	<template>
		<CanonSplit
			class="json-formatter"
			@halves={{true}}
			@collapsesTo={{150}}
			{{filePaste this.readFile accept=ACCEPT}}
			{{on "drop" this.drop}}
			{{on "dragover" this.dragOver}}
		>
			<:sidebar>
				<CanonCanvas @height={{this.pictureHeight}}>
					<Editor
						@text={{this.source}}
						@fileName={{this.fileName}}
						@errorLine={{this.error.line}}
						@onInput={{this.setSource}}
						@onFile={{this.readFile}}
						@onHeight={{this.measured}}
					/>
				</CanonCanvas>
			</:sidebar>
			<:main>
				<CanonCanvas @height={{this.shapeHeight}}>
					<ShapePicture
						@shape={{this.shape}}
						@invalid={{if
							this.error
							true
							false
						}}
						@selected={{this.selected}}
						@onTap={{this.tap}}
						@onSelect={{this.selectCell}}
					/>
				</CanonCanvas>
				<CanonRows @framed={{true}}>
					<CanonTiles @items={{this.tiles}} />
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Indent" />
					<CanonSegmented
						aria-label="Indent"
						@items={{this.indentLabels}}
						@selected={{this.indentIndex}}
						@onChange={{this.setIndent}}
					/>
					<CanonHeading @text="View" />
					<CanonSegmented
						aria-label="View"
						@items={{this.views}}
						@selected={{if this.tree 1 0}}
						@onChange={{this.setView}}
					/>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Result" />
					{{#if this.error}}
						<CanonStatus
							class="jf-error"
							@text={{this.errorText}}
							@tone="warn"
							@row={{true}}
						/>
						{{#if this.excerpt}}
							<div
								class="jf-excerpt"
							>{{this.excerpt.before}}{{#if
									this.excerpt.at
								}}<span
										class="jf-excerpt-at"
									>{{this.excerpt.at}}</span>{{else}}<span
										class="jf-excerpt-caret"
									></span>{{/if}}{{this.excerpt.after}}</div>
						{{/if}}
					{{else if this.tree}}
						{{#if this.treeRows.length}}
							<div
								class="jf-tree"
								role="region"
								aria-label="Tree"
								tabindex="0"
							>
								{{#each
									this.treeRows
									key="path"
									as |row|
								}}
									{{#if
										row.container
									}}
										<button
											type="button"
											class="jf-tree-row jf-tree-row--container
												{{if
													row.selected
													'jf-row--selected'
												}}"
											style={{row.style}}
											aria-expanded={{if
												row.collapsed
												"false"
												"true"
											}}
											{{on
												"click"
												(fn
													this.toggle
													row.path
												)
											}}
										><span
												class="jf-tree-glyph"
											>{{row.glyph}}</span>{{#if
												row.key
											}}<span
													class="jf-tree-key"
												>{{row.key}}</span>:
											{{/if}}<span
												class="jf-tree-count"
											>{{row.display}}</span></button>
									{{else}}
										<div
											class="jf-tree-row
												{{if
													row.selected
													'jf-row--selected'
												}}"
											style={{row.style}}
										><span
												class="jf-tree-glyph"
											></span>{{#if
												row.key
											}}<span
													class="jf-tree-key"
												>{{row.key}}</span>:
											{{/if}}<span
												class="jf-t--{{row.kind}}"
											>{{row.display}}</span></div>
									{{/if}}
								{{/each}}
								{{#if
									this.treeClipped
								}}
									<div
										class="jf-tree-row"
									>…</div>
								{{/if}}
							</div>
						{{/if}}
					{{else if this.listing.length}}
						<div
							class="jf-listing"
							role="region"
							aria-label="Result"
							tabindex="0"
							style={{this.listingStyle}}
						>
							{{#each
								this.listing
								as |line|
							}}
								<div
									class="jf-listing-line
										{{if
											line.selected
											'jf-row--selected'
										}}"
								><span
										class="jf-gutter"
										aria-hidden="true"
									>{{line.number}}</span><span
									>{{~#each
											line.runs
											as |run|
										~}}<span
												class="jf-t--{{run.kind}}"
											>{{run.text}}</span>{{~/each~}}</span></div>
							{{/each}}
						</div>
					{{else}}
						<CanonEmptyRow @text="None" />
					{{/if}}
					<CanonGrid>
						<CanonButton
							class="jf-download"
							@text={{this.downloadText}}
							@icon={{DownloadIcon}}
							@disabled={{if
								this.formatted
								false
								true
							}}
							@onClick={{this.download}}
						/>
						<CanonButton
							class="jf-copy"
							@text="Copy"
							@icon={{CopyIcon}}
							@iconStyle="oversized"
							@kind="primary"
							@disabled={{if
								this.formatted
								false
								true
							}}
							@onClick={{this.copy}}
						/>
					</CanonGrid>
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}
