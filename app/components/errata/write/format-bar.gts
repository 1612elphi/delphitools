import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { eq } from 'ember-truth-helpers';
import CanonColourWell from 'delphicanon/components/canon-colour-well';
import CanonRows from 'delphicanon/components/canon-rows';
import { hex, parseHex, type Rgb } from 'delphicanon/lib/colour';
import { Cell, Cells } from 'delphitools-v2/components/substrata/editor/cells';
import {
	MenuCell,
	PopoverCell,
	type BarMenuEntry,
} from 'delphitools-v2/components/substrata/editor/tool-bar/bar-cells';
import CanonButton from 'delphicanon/components/canon-button';
import CanonNumberField from 'delphicanon/components/canon-number-field';
import CanonRow from 'delphicanon/components/canon-row';
import { Choice, Segmented } from 'delphitools-v2/components/errata/tool-panel';
import {
	barChar,
	editStore,
	ensureFamilies,
	formatChar,
	pending,
	run,
	sectionBreak,
	setSection,
} from 'delphitools-v2/lib/errata/write/editor';
import { FAMILIES } from 'delphitools-v2/lib/errata/write/fonts';
import {
	resetSize,
	selectedImage,
	setFloat,
	setWrap,
	toggleCaption,
} from 'delphitools-v2/lib/errata/write/image-edit';
import {
	applyPara,
	captionOf,
	clearFormatting,
	hasCover,
	sectionSetup,
	setStyle,
	suggestHeading,
	toggleList,
	indent,
} from 'delphitools-v2/lib/errata/write/model';
import { channel } from 'delphitools-v2/lib/channel';
import {
	resolveChar,
	resolvePara,
} from 'delphitools-v2/lib/errata/write/styles';
import type {
	Align,
	Borders,
	CharProps,
	FamilyId,
	ListProps,
	ImageFloat,
	ParaProps,
	Setup,
	StyleId,
	Wrap,
} from 'delphitools-v2/lib/errata/write/types';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';
import { focusEditor, writePanel } from 'delphitools-v2/lib/errata/write/view';
import { writeStore } from 'delphitools-v2/lib/errata/write/store';
import { MM_TO_POINTS } from 'delphitools-v2/lib/paper-sizes';
import { FIELDS, inserts } from './insert-menu';
import TableMenu from './table-menu';

type Tab = 'text' | 'para' | 'insert' | 'layout' | 'image';

const TABS: [Tab, string][] = [
	['text', 'Text'],
	['para', 'Paragraph'],
	['insert', 'Insert'],
	['layout', 'Layout'],
];

const VALIGNS: ['top' | 'centre' | 'bottom', string][] = [
	['top', 'Top'],
	['centre', 'Centre'],
	['bottom', 'Bottom'],
];

export const MARGIN_PRESETS: [string, number][] = [
	['Normal', 25.4],
	['Narrow', 12.7],
	['Wide', 38.1],
];

const STYLE_TITLES: [StyleId, string][] = [
	['title', 'Title'],
	['h1', 'Heading 1'],
	['h2', 'Heading 2'],
	['h3', 'Heading 3'],
	['body', 'Body'],
	['quote', 'Quote'],
	['caption', 'Caption'],
	['note', 'Note'],
];

const titleOf = (id: StyleId) => STYLE_TITLES.find(([s]) => s === id)![1];

const ALIGNS: [Align, string, string][] = [
	['left', 'Left', 'align-left'],
	['centre', 'Centre', 'align-center'],
	['right', 'Right', 'align-right'],
	['justify', 'Justify', 'align-justify'],
];

export const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36].map(
	(v) => ({
		value: v,
	}),
);
export const MIN_SIZE = 4;
export const MAX_SIZE = 400;
export const SPACINGS = [1, 1.15, 1.5, 2].map((v) => ({ value: v }));
export const GAPS = [0, 3, 6, 12, 18, 24, 36].map((v) => ({ value: v }));

type BorderKind = 'none' | 'box' | 'bottom';
export const BORDER_KINDS: { value: BorderKind; label: string }[] = [
	{ value: 'none', label: 'None' },
	{ value: 'box', label: 'Box' },
	{ value: 'bottom', label: 'Bottom' },
];
const EDGE = { width: 0.5, colour: '#000000' };
const BORDERS: Record<BorderKind, Borders | undefined> = {
	none: undefined,
	box: { top: EDGE, bottom: EDGE, left: EDGE, right: EDGE },
	bottom: { bottom: EDGE },
};

export const SCRIPTS = [
	{ value: 'super', label: 'Superscript', text: 'x²' },
	{ value: 'sub', label: 'Subscript', text: 'x₂' },
] as const;

export const TOGGLES: [keyof CharProps, string, string | undefined, string][] =
	[
		['bold', 'Bold', 'bold', 'B'],
		['italic', 'Italic', 'italic', 'I'],
		['underline', 'Underline', undefined, 'U'],
		['strike', 'Strikethrough', 'strikethrough', 'S'],
	];

const WRAPS: [Wrap | 'inline', string][] = [
	['inline', 'Inline'],
	['square', 'Square'],
	['top-bottom', 'Top & bottom'],
	['behind', 'Behind'],
	['front', 'In front'],
];

const SIDES: [ImageFloat['side'], string][] = [
	['left', 'Left'],
	['right', 'Right'],
	['both', 'Both'],
];

export const DISTANCES = [0, 3, 6, 9, 12, 18].map((v) => ({ value: v }));

const skipped = channel<ReadonlySet<string>>(new Set());

export const openLink = () => writePanel.set('link');

const edit: typeof run = (op) => {
	run(op);
	focusEditor();
};

const fmt: typeof formatChar = (props) => {
	formatChar(props);
	focusEditor();
};

export class FormatState<S = unknown> extends Component<S> {
	state = new TrackedExternal(editStore.subscribe, editStore.get);
	typing = new TrackedExternal(pending.subscribe, pending.get);
	skips = new TrackedExternal(skipped.subscribe, skipped.get);

	willDestroy() {
		super.willDestroy();
		this.state.unsubscribe();
		this.typing.unsubscribe();
		this.skips.unsubscribe();
	}

	@cached
	get char(): CharProps {
		void this.typing.current;
		const s = this.state.current;
		return s ? barChar(s) : {};
	}

	@cached
	get image() {
		return selectedImage(this.state.current);
	}

	get wrap(): Wrap | 'inline' {
		return this.image?.image.float?.wrap ?? 'inline';
	}

	get wrapTitle() {
		return WRAPS.find(([w]) => w === this.wrap)![1];
	}

	get wrapItems(): BarMenuEntry[] {
		return WRAPS.map(([w, title]) => ({
			title,
			kind: 'radio',
			checked: w === this.wrap,
			run: () => setWrap(w),
		}));
	}

	get side() {
		return this.image?.image.float?.side ?? 'both';
	}

	get sideTitle() {
		return SIDES.find(([v]) => v === this.side)![1];
	}

	get sideOff() {
		return this.wrap !== 'square';
	}

	get sideItems(): BarMenuEntry[] {
		return SIDES.map(([side, title]) => ({
			title,
			kind: 'radio',
			checked: side === this.side,
			run: () => setFloat({ side }),
		}));
	}

	get distance() {
		return this.image?.image.float?.distance ?? null;
	}

	get distanceText() {
		const d = this.distance;
		return d === null ? 'Distance' : `${d} pt`;
	}

	get captioned() {
		const s = this.state.current;
		return (
			!!s &&
			!!this.image &&
			captionOf(s.doc, this.image.block) >= 0
		);
	}

	setDistance = (distance: number) => setFloat({ distance });

	@cached
	get para() {
		const s = this.state.current;
		if (!s) return null;
		const b = s.doc.blocks[s.sel.focus.block];
		return b?.kind === 'para' ? b : null;
	}

	get styleId(): StyleId {
		return this.para?.style ?? 'body';
	}

	@cached
	get resolvedPara() {
		const p = this.para;
		return p ? resolvePara(p.style, p.props) : null;
	}

	get size() {
		return this.char.size ?? null;
	}

	get spacing() {
		const p = this.resolvedPara;
		return {
			line: p?.lineSpacing ?? null,
			before: p?.spaceBefore ?? null,
			after: p?.spaceAfter ?? null,
		};
	}

	get styleTitle() {
		return titleOf(this.styleId);
	}

	@cached
	get suggestion(): StyleId | null {
		const s = this.state.current;
		const p = this.para;
		if (!s || !p || this.skips.current.has(p.id)) return null;
		return suggestHeading(s.doc, s.sel.focus.block);
	}

	get styleItems(): BarMenuEntry[] {
		const styles = STYLE_TITLES.map(
			([id, title]): BarMenuEntry => ({
				title,
				kind: 'radio',
				checked: id === this.styleId,
				run: () => edit((d, s) => setStyle(d, s, id)),
			}),
		);
		const id = this.suggestion;
		const p = this.para;
		if (!id || !p) return styles;
		return [
			{
				title: `${titleOf(id)}?`,
				run: () => edit((d, s) => setStyle(d, s, id)),
			},
			{
				title: 'Skip',
				run: () => {
					skipped.set(
						new Set(skipped.get()).add(
							p.id,
						),
					);
					focusEditor();
				},
			},
			{ kind: 'separator' },
			...styles,
		];
	}

	get fontTitle() {
		const f = this.char.font;
		return f ? FAMILIES[f].label : 'Mixed';
	}

	get fontItems(): BarMenuEntry[] {
		return (Object.keys(FAMILIES) as FamilyId[]).map((f) => ({
			title: FAMILIES[f].label,
			kind: 'radio',
			checked: f === this.char.font,
			run: () =>
				void ensureFamilies([f]).then(() =>
					fmt({ font: f }),
				),
		}));
	}

	get sizeValue() {
		return this.char.size ?? resolveChar(this.styleId, {}).size;
	}

	get sizeText() {
		return this.char.size ? `${this.char.size} pt` : 'Size';
	}

	get align(): Align {
		return this.resolvedPara?.align ?? 'left';
	}

	get toggles() {
		const c = this.char;
		return TOGGLES.map(([key, label, icon, text]) => ({
			key,
			label,
			icon,
			text: icon ? undefined : text,
			on: c[key] === true,
		}));
	}

	get linked() {
		return this.char.link !== undefined;
	}

	get script() {
		return this.char.script ?? null;
	}

	get colour(): Rgb {
		return parseHex(this.char.colour ?? '#000000') ?? [0, 0, 0];
	}

	get highlight(): Rgb {
		return (
			parseHex(this.char.highlight ?? '#ffff00') ?? [
				255, 255, 0,
			]
		);
	}

	get border(): BorderKind {
		const b = this.resolvedPara?.border;
		if (!b) return 'none';
		return b.top ? 'box' : 'bottom';
	}

	get shading(): Rgb {
		return (
			parseHex(this.resolvedPara?.shading ?? '#ffffff') ?? [
				255, 255, 255,
			]
		);
	}

	setBorder = (kind: BorderKind) =>
		this.setPara({ border: BORDERS[kind] });
	setShading = (c: Rgb) =>
		run((d, s) => applyPara(d, s, { shading: hex(c) }));
	clearShading = () => this.setPara({ shading: undefined });

	setPara = (props: Partial<ParaProps>) =>
		edit((d, s) => applyPara(d, s, props));

	toggle = (key: keyof CharProps, on: boolean) => fmt({ [key]: !on });

	setScript = (script: 'super' | 'sub') =>
		fmt({
			script: this.script === script ? undefined : script,
		});

	setSize = (size: number) => fmt({ size });
	setSpace = (
		key: 'lineSpacing' | 'spaceBefore' | 'spaceAfter',
		value: number,
	) => this.setPara({ [key]: value });
	setColour = (c: Rgb) => formatChar({ colour: hex(c) });
	setHighlight = (c: Rgb) => formatChar({ highlight: hex(c) });
	clearHighlight = () => fmt({ highlight: undefined });

	doc = new TrackedExternal(writeStore.subscribe, writeStore.get);
	@tracked tab: Tab = 'text';
	#pickedOver: string | null = null;

	get imageKey() {
		const i = this.image;
		return i ? `${i.block}:${i.offset}` : null;
	}

	get activeTab(): Tab {
		const key = this.imageKey;
		if (key && this.#pickedOver !== key) return 'image';
		if (!key && this.tab === 'image') return 'text';
		return this.tab;
	}

	get tabs() {
		const out = TABS.slice();
		if (this.image) out.push(['image', 'Image']);
		return out.map(([id, label]) => ({
			id,
			label,
			on: id === this.activeTab,
		}));
	}

	pickTab = (id: Tab) => {
		this.tab = id;
		this.#pickedOver = this.imageKey;
	};

	get section(): Setup | null {
		const s = this.doc.current;
		return s ? sectionSetup(s.doc, s.sel.focus.block) : null;
	}

	get orientationItems(): BarMenuEntry[] {
		const s = this.section;
		const land = !!s && s.width > s.height;
		return [
			['Portrait', false],
			['Landscape', true],
		].map(([title, wide]) => ({
			title: title as string,
			kind: 'radio',
			checked: land === wide,
			run: () => {
				if (s && land !== wide)
					setSection({
						width: s.height,
						height: s.width,
					});
				focusEditor();
			},
		}));
	}

	get columnItems(): BarMenuEntry[] {
		const n = this.section?.columns ?? 1;
		return [1, 2, 3].map((c) => ({
			title: String(c),
			kind: 'radio',
			checked: c === n,
			run: () => {
				setSection({ columns: c > 1 ? c : undefined });
				focusEditor();
			},
		}));
	}

	get valignItems(): BarMenuEntry[] {
		const v = this.section?.valign ?? 'top';
		return VALIGNS.map(([value, title]) => ({
			title,
			kind: 'radio',
			checked: value === v,
			run: () => {
				setSection({
					valign:
						value === 'top'
							? undefined
							: value,
				});
				focusEditor();
			},
		}));
	}

	get marginItems(): BarMenuEntry[] {
		const m = this.section?.margins;
		return MARGIN_PRESETS.map(([title, mm]) => {
			const pt = mm * MM_TO_POINTS;
			return {
				title,
				kind: 'radio',
				checked:
					!!m &&
					[
						m.top,
						m.right,
						m.bottom,
						m.left,
					].every((v) => Math.abs(v - pt) < 0.5),
				run: () => {
					setSection({
						margins: {
							top: pt,
							right: pt,
							bottom: pt,
							left: pt,
						},
					});
					focusEditor();
				},
			};
		});
	}

	get fieldItems(): BarMenuEntry[] {
		return FIELDS.map((f) => ({
			title: f.text,
			run: () => inserts.field(f.kind),
		}));
	}

	get covered() {
		const s = this.doc.current;
		return !s || hasCover(s.doc);
	}

	get hasToc() {
		return !!this.doc.current?.doc.blocks.some(
			(b) => b.kind === 'toc',
		);
	}

	get listKind() {
		return this.para?.props.list?.kind ?? null;
	}

	get aligns() {
		return ALIGNS.map(([a, title, icon]) => ({
			a,
			title,
			icon,
			on: a === this.align,
		}));
	}

	setAlign = (align: Align) => this.setPara({ align });
	list = (kind: ListProps['kind']) =>
		edit((d, s) => toggleList(d, s, kind));
	outdent = () => edit((d, s) => indent(d, s, -1));
	indentMore = () => edit((d, s) => indent(d, s, 1));
	clear = () => edit((d, s) => clearFormatting(d, s));
	setup = () => writePanel.set('setup');
	sectionBreak = () => {
		sectionBreak();
		focusEditor();
	};
	inserts = inserts;
}

export default class FormatBar extends FormatState<{
	Args: { onImage: () => void };
}> {
	<template>
		<div
			class="sub-ed-bar is-bottom err-write-bar"
			role="toolbar"
			aria-label="Format"
		>
			<div class="err-ribbon">
				<div class="err-ribbon-head">
					<Cells
						@axis="row"
						@small={{true}}
						class="err-ribbon-tabs"
					>
						{{#each this.tabs as |t|}}
							<Cell
								@label={{t.label}}
								@text={{t.label}}
								@selected={{t.on}}
								data-ribbon-tab={{t.id}}
								@onClick={{fn
									this.pickTab
									t.id
								}}
							/>
						{{/each}}
					</Cells>
				</div>
				<div
					class="err-ribbon-row"
					data-ribbon={{this.activeTab}}
				>
					<Cells @axis="row" @small={{true}}>
						{{#if
							(eq
								this.activeTab
								"image"
							)
						}}
							<MenuCell
								@label="Wrap"
								@text={{this.wrapTitle}}
								@items={{this.wrapItems}}
								@placement="top"
								data-format="wrap"
							/>
							<MenuCell
								@label="Side"
								@text={{this.sideTitle}}
								@items={{this.sideItems}}
								@disabled={{this.sideOff}}
								@placement="top"
								data-format="side"
							/>
							{{#if
								this.image.image.float
							}}
								<PopoverCell
									@label="Distance"
									@text={{this.distanceText}}
									@placement="top"
									data-format="distance"
								>
									<CanonRows
									>
										<Choice
											@label="Distance"
											@options={{DISTANCES}}
											@value={{this.distance}}
											@onChange={{this.setDistance}}
											@columns={{6}}
										/>
									</CanonRows>
								</PopoverCell>
							{{/if}}
							<Cell
								@label="Caption"
								@text="Caption"
								@selected={{this.captioned}}
								data-format="caption"
								@onClick={{toggleCaption}}
							/>
							<Cell
								@label="Reset size"
								@text="Reset size"
								data-format="reset-size"
								@onClick={{resetSize}}
							/>
						{{else if
							(eq
								this.activeTab
								"para"
							)
						}}
							{{#each
								this.aligns
								key="a"
								as |a|
							}}
								<Cell
									@label={{a.title}}
									@icon={{a.icon}}
									@selected={{a.on}}
									@tip="top"
									data-align={{a.a}}
									@onClick={{fn
										this.setAlign
										a.a
									}}
								/>
							{{/each}}
							<Cell
								@label="Bulleted"
								@text="Bullets"
								@selected={{eq
									this.listKind
									"bullet"
								}}
								@tip="top"
								data-format="bullets"
								@onClick={{fn
									this.list
									"bullet"
								}}
							/>
							<Cell
								@label="Numbered"
								@text="Numbers"
								@selected={{eq
									this.listKind
									"number"
								}}
								@tip="top"
								data-format="numbers"
								@onClick={{fn
									this.list
									"number"
								}}
							/>
							<Cell
								@label="Outdent"
								@text="Outdent"
								@tip="top"
								@onClick={{this.outdent}}
							/>
							<Cell
								@label="Indent"
								@text="Indent"
								@tip="top"
								@onClick={{this.indentMore}}
							/>
							<PopoverCell
								@label="Spacing"
								@icon="arrow-up-down"
								@placement="top"
								@tip="top"
								data-format="spacing"
							>
								<CanonRows>
									<Choice
										@label="Line"
										@options={{SPACINGS}}
										@value={{this.spacing.line}}
										@onChange={{fn
											this.setSpace
											"lineSpacing"
										}}
										@columns={{4}}
									/>
									<Choice
										@label="Before"
										@options={{GAPS}}
										@value={{this.spacing.before}}
										@onChange={{fn
											this.setSpace
											"spaceBefore"
										}}
										@columns={{7}}
									/>
									<Choice
										@label="After"
										@options={{GAPS}}
										@value={{this.spacing.after}}
										@onChange={{fn
											this.setSpace
											"spaceAfter"
										}}
										@columns={{7}}
									/>
								</CanonRows>
							</PopoverCell>
							<PopoverCell
								@label="Borders"
								@icon="square-dashed"
								@placement="top"
								@tip="top"
								data-format="borders"
							>
								<CanonRows>
									<Choice
										@label="Border"
										@options={{BORDER_KINDS}}
										@value={{this.border}}
										@onChange={{this.setBorder}}
										@columns={{3}}
										data-format="border"
									/>
									<CanonColourWell
										@label="Shade"
										@colour={{this.shading}}
										@onChange={{this.setShading}}
									/>
									<CanonButton
										@kind="segment"
										@text="No shade"
										@onClick={{this.clearShading}}
									/>
								</CanonRows>
							</PopoverCell>
						{{else if
							(eq
								this.activeTab
								"insert"
							)
						}}
							<Cell
								@label="Cover page"
								@text="Cover"
								@disabled={{this.covered}}
								data-ribbon-insert="cover"
								@onClick={{this.inserts.cover}}
							/>
							<Cell
								@label="Page break"
								@text="Page break"
								data-ribbon-insert="page-break"
								@onClick={{this.inserts.pageBreak}}
							/>
							<Cell
								@label="Page numbers"
								@text="Numbers"
								data-ribbon-insert="page-numbers"
								@onClick={{this.inserts.numbers}}
							/>
							<Cell
								@label="Table of contents"
								@text="Contents"
								@disabled={{this.hasToc}}
								data-ribbon-insert="toc"
								@onClick={{this.inserts.contents}}
							/>
							<Cell
								@label="Footnote"
								@text="Footnote"
								@onClick={{fn
									this.inserts.note
									"foot"
								}}
							/>
							<Cell
								@label="Endnote"
								@text="Endnote"
								@onClick={{fn
									this.inserts.note
									"end"
								}}
							/>
							<TableMenu
								@phone={{true}}
								@tool="ribbon-table"
							/>
							<Cell
								@label="Image"
								@icon="image-plus"
								@tip="top"
								data-ribbon-insert="image"
								@onClick={{@onImage}}
							/>
							<MenuCell
								@label="Field"
								@text="Field"
								@items={{this.fieldItems}}
								@placement="top"
								data-ribbon-insert="field"
							/>
						{{else if
							(eq
								this.activeTab
								"layout"
							)
						}}
							<Cell
								@label="Document setup"
								@icon="settings-2"
								@tip="top"
								data-ribbon-layout="setup"
								@onClick={{this.setup}}
							/>
							<MenuCell
								@label="Margins"
								@text="Margins"
								@items={{this.marginItems}}
								@placement="top"
								data-ribbon-layout="margins"
							/>
							<MenuCell
								@label="Orientation"
								@text="Orientation"
								@items={{this.orientationItems}}
								@placement="top"
								data-ribbon-layout="orientation"
							/>
							<MenuCell
								@label="Columns"
								@text="Columns"
								@items={{this.columnItems}}
								@placement="top"
								data-ribbon-layout="columns"
							/>
							<MenuCell
								@label="Vertical"
								@text="Vertical"
								@items={{this.valignItems}}
								@placement="top"
								data-ribbon-layout="valign"
							/>
							<Cell
								@label="Section break"
								@text="Section break"
								data-ribbon-layout="section-break"
								@onClick={{this.sectionBreak}}
							/>
						{{else}}
							<MenuCell
								@label="Style"
								@text={{this.styleTitle}}
								@items={{this.styleItems}}
								@placement="top"
								class={{if
									this.suggestion
									"has-suggestion"
								}}
								data-format="style"
							/>
							<MenuCell
								@label="Font"
								@text={{this.fontTitle}}
								@items={{this.fontItems}}
								@placement="top"
								data-format="font"
							/>
							<PopoverCell
								@label="Size"
								@text={{this.sizeText}}
								@placement="top"
								data-format="size"
							>
								<CanonRows>
									<Segmented
										@options={{SIZES}}
										@value={{this.size}}
										@onChange={{this.setSize}}
										@columns={{4}}
										@label="Size"
									/>
									<CanonRow
										@title="Size"
										@form="flush"
										as |id|
									>
										<CanonNumberField
											@value={{this.sizeValue}}
											@min={{MIN_SIZE}}
											@max={{MAX_SIZE}}
											@unit="pt"
											@labelledBy={{id}}
											@onChange={{this.setSize}}
										/>
									</CanonRow>
								</CanonRows>
							</PopoverCell>
							{{#each
								this.toggles
								key="key"
								as |t|
							}}
								<Cell
									@label={{t.label}}
									@icon={{t.icon}}
									@text={{t.text}}
									@selected={{t.on}}
									@tip="top"
									data-toggle={{t.key}}
									@onClick={{fn
										this.toggle
										t.key
										t.on
									}}
								/>
							{{/each}}
							{{#each
								SCRIPTS
								as |sc|
							}}
								<Cell
									@label={{sc.label}}
									@text={{sc.text}}
									@selected={{eq
										this.script
										sc.value
									}}
									@tip="top"
									@onClick={{fn
										this.setScript
										sc.value
									}}
								/>
							{{/each}}
							<Cell
								@label="Link"
								@icon="link"
								@selected={{this.linked}}
								@tip="top"
								data-format="link"
								@onClick={{openLink}}
							/>
							<PopoverCell
								@label="Colour"
								@icon="palette"
								@placement="top"
								@tip="top"
								data-format="colour"
							>
								<CanonRows>
									<CanonColourWell
										@label="Text colour"
										@colour={{this.colour}}
										@onChange={{this.setColour}}
									/>
									<CanonColourWell
										@label="Highlight"
										@colour={{this.highlight}}
										@onChange={{this.setHighlight}}
									/>
									<CanonButton
										@kind="segment"
										@text="No highlight"
										@onClick={{this.clearHighlight}}
									/>
								</CanonRows>
							</PopoverCell>
							<Cell
								@label="Clear formatting"
								@icon="eraser"
								@tip="top"
								data-format="clear"
								@onClick={{this.clear}}
							/>
						{{/if}}
					</Cells>
				</div>
			</div>
		</div>
	</template>
}
