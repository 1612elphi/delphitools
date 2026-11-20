import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe, type SafeString } from '@ember/template';
import { tracked } from '@glimmer/tracking';
import { modifier } from 'ember-modifier';
import { eq } from 'ember-truth-helpers';
import CanonButton from 'delphicanon/components/canon-button';
import CanonColourWell from 'delphicanon/components/canon-colour-well';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonNumberField from 'delphicanon/components/canon-number-field';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSwitch from 'delphicanon/components/canon-switch';
import { clamp } from 'delphicanon/lib/number';
import {
	Choice,
	Segmented,
	Slider,
} from 'delphitools-v2/components/errata/tool-panel';
import { IconSvg } from 'delphitools-v2/components/icon';
import { Cell } from 'delphitools-v2/components/substrata/editor/cells';
import {
	MenuCell,
	PopoverCell,
	type BarMenuEntry,
} from 'delphitools-v2/components/substrata/editor/tool-bar/bar-cells';
import PaperPopover from 'delphitools-v2/components/tools/paper-sizes/popover';
import {
	resetSize,
	toggleCaption,
} from 'delphitools-v2/lib/errata/write/image-edit';
import {
	marginGuide,
	rulers,
	type MarginGuide,
} from 'delphitools-v2/lib/errata/write/editor';
import {
	focusEditor,
	registerTabs,
} from 'delphitools-v2/lib/errata/write/view';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';
import { MM_TO_POINTS } from 'delphitools-v2/lib/paper-sizes';
import {
	BORDER_KINDS,
	DISTANCES,
	FormatState,
	GAPS,
	MARGIN_PRESETS,
	MAX_SIZE,
	MIN_SIZE,
	SCRIPTS,
	SIZES,
	SPACINGS,
	openLink,
} from './format-bar';
import { DEFAULT_GUTTER } from 'delphitools-v2/lib/errata/write/layout';
import { FIELDS } from './insert-menu';
import SetupPanel, { PAPER_MAX, PAPER_MIN } from './setup-panel';
import TableMenu from './table-menu';

export const isolate = modifier((el: HTMLElement) => {
	const stop = (e: Event) => e.stopPropagation();
	el.addEventListener('pointerdown', stop);
	return () => el.removeEventListener('pointerdown', stop);
});

const inert = modifier((el: HTMLElement, [open]: [boolean]) => {
	el.inert = !open;
});

const drawer = modifier((el: HTMLElement, [open]: [boolean]) => {
	el.inert = !open;
	if (open)
		el.parentElement?.scrollIntoView({
			block: 'nearest',
			inline: 'nearest',
			behavior: 'smooth',
		});
});

type TabId = 'paper' | 'margins' | 'columns';
type Side = 'top' | 'bottom' | 'left' | 'right';

const TABS: [TabId, string][] = [
	['paper', 'Paper'],
	['margins', 'Margins'],
	['columns', 'Columns'],
];

const PRESETS = MARGIN_PRESETS.map(([value]) => ({ value }));
const SIDES: { side: Side; title: string }[] = [
	{ side: 'top', title: 'Top' },
	{ side: 'bottom', title: 'Bottom' },
	{ side: 'left', title: 'Left' },
	{ side: 'right', title: 'Right' },
];
const ORIENTATIONS = [
	{ value: 'portrait', label: 'Portrait' },
	{ value: 'landscape', label: 'Landscape' },
] as const;
const GUIDES: { value: MarginGuide; label: string }[] = [
	{ value: 'off', label: 'Off' },
	{ value: 'border', label: 'Box' },
	{ value: 'corners', label: 'Corners' },
];
const PREVIEW_W = 104;
const PREVIEW_H = 120;
const COLUMNS = [1, 2, 3].map((value) => ({ value }));

export class PageTabs extends SetupPanel {
	@tracked pane: TabId | null = null;
	@tracked shown = false;
	guide = new TrackedExternal(marginGuide.subscribe, marginGuide.get);
	ruled = new TrackedExternal(rulers.subscribe, rulers.get);

	willDestroy() {
		super.willDestroy();
		this.guide.unsubscribe();
		this.ruled.unsubscribe();
	}

	setGuide = (guide: MarginGuide) => marginGuide.set(guide);
	setRulers = (on: boolean) => rulers.set(on);

	get panes() {
		return TABS.map(([id, label]) => ({
			id,
			label,
			on: this.shown && this.pane === id,
		}));
	}

	pick = (id: TabId) => {
		if (this.shown && this.pane === id) return this.close();
		this.pane = id;
		this.shown = true;
	};

	close = () => {
		this.shown = false;
		focusEditor();
	};

	dismiss = modifier(() => {
		const down = (e: Event) => {
			const t = e.target as Element;
			if (this.shown && !t.closest('.err-tabs, .err-tabpane'))
				this.shown = false;
		};
		const key = (e: KeyboardEvent) => {
			if (!this.shown || e.key !== 'Escape') return;
			e.stopPropagation();
			this.close();
		};
		document.addEventListener('pointerdown', down, true);
		document.addEventListener('keydown', key, true);
		registerTabs((id) => {
			this.pane = id as TabId;
			this.shown = true;
		});
		return () => {
			registerTabs(null);
			document.removeEventListener('pointerdown', down, true);
			document.removeEventListener('keydown', key, true);
		};
	});

	get preset() {
		const m = this.setup?.margins;
		if (!m) return null;
		const sides = [m.top, m.right, m.bottom, m.left];
		const preset = MARGIN_PRESETS.find(([, mm]) =>
			sides.every(
				(v) => Math.abs(v - mm * MM_TO_POINTS) < 0.5,
			),
		);
		return preset?.[0] ?? null;
	}

	get preview() {
		const s = this.setup;
		if (!s) return null;
		const z = Math.min(PREVIEW_W / s.width, PREVIEW_H / s.height);
		const m = s.margins;
		const px = (pt: number) => `${(pt * z).toFixed(1)}px`;
		return {
			page: htmlSafe(
				`inline-size:${px(s.width)};block-size:${px(s.height)}`,
			),
			text: htmlSafe(
				`inset:${px(m.top)} ${px(m.right)} ${px(m.bottom)} ${px(m.left)};gap:${px(s.gutter ?? DEFAULT_GUTTER)}`,
			),
			columns: Array.from({ length: this.columns }),
		};
	}

	setPreset = (name: string) => {
		const mm = MARGIN_PRESETS.find(([n]) => n === name)?.[1];
		if (mm === undefined) return;
		const pt = mm * MM_TO_POINTS;
		this.update({
			margins: { top: pt, right: pt, bottom: pt, left: pt },
		});
	};

	<template>
		<div
			class="err-edge err-tabs"
			role="toolbar"
			aria-label="Layout"
			{{isolate}}
			{{this.dismiss}}
		>
			{{#each this.panes key="id" as |t|}}
				<button
					type="button"
					class="err-tab {{if t.on 'is-on'}}"
					aria-expanded={{if t.on "true" "false"}}
					data-tab={{t.id}}
					{{on "click" (fn this.pick t.id)}}
				>{{t.label}}</button>
			{{/each}}
		</div>
		<div
			class="err-edge err-tabpane {{if this.shown 'is-open'}}"
			role="group"
			aria-label="Layout"
			{{isolate}}
			{{inert this.shown}}
		>
			<CanonRows>
				{{#if (eq this.pane "paper")}}
					<PaperPopover
						@min={{PAPER_MIN}}
						@max={{PAPER_MAX}}
						@value={{this.paperId}}
						@label="Paper size"
						@placement="bottom-start"
						@onPick={{this.pickPaper}}
					/>
					<Choice
						@label="Orientation"
						@options={{ORIENTATIONS}}
						@value={{this.orientation}}
						@onChange={{this.pickOrientation}}
						@columns={{2}}
						data-pane="orientation"
					/>
				{{else if (eq this.pane "margins")}}
					<Choice
						@label="Preset"
						@options={{PRESETS}}
						@value={{this.preset}}
						@onChange={{this.setPreset}}
						@columns={{3}}
						data-pane="preset"
					/>
					<div class="err-marg">
						{{#each SIDES as |m|}}
							<div
								class="err-marg-{{m.side}}"
							>
								<CanonNumberField
									@value={{this.margin
										m.side
									}}
									@min={{0}}
									@max={{200}}
									@unit="mm"
									@label={{m.title}}
									@onChange={{fn
										this.setMargin
										m.side
									}}
									data-pane-margin={{m.side}}
								/>
							</div>
						{{/each}}
						{{#if this.preview}}
							<div
								class="err-marg-page"
								style={{this.preview.page}}
								aria-hidden="true"
							>
								<div
									class="err-marg-text"
									style={{this.preview.text}}
								>
									{{#each
										this.preview.columns
									}}
										<i
										></i>
									{{/each}}
								</div>
							</div>
						{{/if}}
					</div>
					<Choice
						@label="Guide"
						@options={{GUIDES}}
						@value={{this.guide.current}}
						@onChange={{this.setGuide}}
						@columns={{3}}
						data-pane="guide"
					/>
					<CanonRow @title="Rulers" as |id|>
						<CanonSwitch
							aria-labelledby={{id}}
							@on={{this.ruled.current}}
							@onChange={{this.setRulers}}
							data-pane="rulers"
						/>
					</CanonRow>
				{{else if (eq this.pane "columns")}}
					<Choice
						@label="Columns"
						@options={{COLUMNS}}
						@value={{this.columns}}
						@onChange={{this.setColumns}}
						@columns={{3}}
						data-pane="columns"
					/>
					{{#if this.multiColumn}}
						<CanonRow
							@title="Gutter"
							@form="flush"
							as |id|
						>
							<CanonNumberField
								@value={{this.gutter}}
								@min={{0}}
								@max={{100}}
								@unit="mm"
								@labelledBy={{id}}
								@onChange={{this.setGutter}}
							/>
						</CanonRow>
					{{/if}}
				{{/if}}
			</CanonRows>
		</div>
	</template>
}

const bar = (colour: string | undefined) =>
	htmlSafe(`--err-swatch:${colour ?? 'transparent'}`);

export class ParaDrawer extends FormatState<{
	Args: { style: SafeString; open: boolean };
}> {
	get textBar() {
		return bar(this.char.colour ?? '#000000');
	}

	get markBar() {
		return bar(this.char.highlight);
	}

	get lineText() {
		const line = this.spacing.line;
		return line === null ? 'Mixed' : String(line);
	}

	get borderTitle() {
		return BORDER_KINDS.find((k) => k.value === this.border)!.label;
	}

	get borderItems(): BarMenuEntry[] {
		return BORDER_KINDS.map((k) => ({
			title: k.label,
			kind: 'radio',
			checked: k.value === this.border,
			run: () => this.setBorder(k.value),
		}));
	}

	get linkText() {
		return this.linked ? 'Edit' : 'Add';
	}

	get captionText() {
		return this.captioned ? 'On' : 'Off';
	}

	step = (by: number) =>
		this.setSize(clamp(this.sizeValue + by, MIN_SIZE, MAX_SIZE));

	<template>
		<div class="err-edge err-drawer-clip" style={{@style}}>
			<div
				class="err-drawer {{if @open 'is-open'}}"
				role="group"
				aria-label="Format"
				data-drawer="format"
				{{isolate}}
				{{drawer @open}}
			>
				{{#if this.image}}<CanonRows>
						<CanonRow
							@title="Wrap"
							@form="flush"
						>
							<MenuCell
								@label="Wrap"
								@text={{this.wrapTitle}}
								@items={{this.wrapItems}}
								@placement="left-start"
								data-format="wrap"
							/>
						</CanonRow>
						<CanonRow
							@title="Side"
							@form="flush"
						>
							<MenuCell
								@label="Side"
								@text={{this.sideTitle}}
								@items={{this.sideItems}}
								@disabled={{this.sideOff}}
								@placement="left-start"
								data-format="side"
							/>
						</CanonRow>
						{{#if this.image.image.float}}
							<CanonRow
								@title="Distance"
								@form="flush"
							>
								<PopoverCell
									@label="Distance"
									@text={{this.distanceText}}
									@placement="left-start"
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
							</CanonRow>
						{{/if}}
						<CanonRow
							@title="Caption"
							@form="flush"
						>
							<Cell
								@label="Caption"
								@text={{this.captionText}}
								@selected={{this.captioned}}
								data-format="caption"
								@onClick={{toggleCaption}}
							/>
						</CanonRow>
						<CanonRow
							@title="Size"
							@form="flush"
						>
							<Cell
								@label="Reset size"
								@text="Reset"
								data-format="reset-size"
								@onClick={{resetSize}}
							/>
						</CanonRow>
					</CanonRows>{{else}}<CanonRows>
						<CanonRow
							@title="Style"
							@form="flush"
						>
							<MenuCell
								class={{if
									this.suggestion
									"has-suggestion"
								}}
								@label="Style"
								@text={{this.styleTitle}}
								@items={{this.styleItems}}
								@placement="left-start"
								data-format="style"
							/>
						</CanonRow>
						<CanonRow
							@title="Font"
							@form="flush"
						>
							<MenuCell
								@label="Font"
								@text={{this.fontTitle}}
								@items={{this.fontItems}}
								@placement="left-start"
								data-format="font"
							/>
						</CanonRow>
						<CanonRow
							@title="Size"
							@form="flush"
						>
							<Cell
								@label="Smaller"
								@icon="minus"
								data-format="size-down"
								@onClick={{fn
									this.step
									-1
								}}
							/>
							<PopoverCell
								@label="Size"
								@text={{this.sizeText}}
								@placement="left-start"
								data-format="size"
							>
								<CanonRows>
									<Slider
										@label="Size"
										@value={{this.sizeValue}}
										@min={{6}}
										@max={{72}}
										@unit=" pt"
										@onChange={{this.setSize}}
									/>
									<Segmented
										@options={{SIZES}}
										@value={{this.size}}
										@onChange={{this.setSize}}
										@columns={{4}}
										@label="Size"
									/>
									<CanonRow
										@title="Exact"
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
							<Cell
								@label="Larger"
								@icon="plus"
								data-format="size-up"
								@onClick={{fn
									this.step
									1
								}}
							/>
						</CanonRow>
					</CanonRows><CanonRows><CanonRow
							class="is-two"
							@title="Format"
							@form="flush"
						>
							{{#each
								this.toggles
								key="key"
								as |t|
							}}
								<Cell
									class="is-q"
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
									class="is-h"
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
						</CanonRow>
						<CanonRow
							class="is-two"
							@title="Colour"
							@form="flush"
						>
							<PopoverCell
								class="err-swatch is-h"
								style={{this.textBar}}
								@label="Text colour"
								@text="Text"
								@placement="left-start"
								data-format="colour"
							>
								<CanonRows>
									<CanonColourWell
										@label="Text colour"
										@colour={{this.colour}}
										@onChange={{this.setColour}}
									/>
								</CanonRows>
							</PopoverCell>
							<PopoverCell
								class="err-swatch is-h"
								style={{this.markBar}}
								@label="Highlight"
								@text="Highlight"
								@placement="left-start"
								data-format="highlight"
							>
								<CanonRows>
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
							<PopoverCell
								class="err-swatch is-f"
								style={{bar
									this.resolvedPara.shading
								}}
								@label="Paragraph background"
								@text="Background"
								@placement="left-start"
								data-format="shade"
							>
								<CanonRows>
									<CanonColourWell
										@label="Background"
										@colour={{this.shading}}
										@onChange={{this.setShading}}
									/>
									<CanonButton
										@kind="segment"
										@text="No background"
										@onClick={{this.clearShading}}
									/>
								</CanonRows>
							</PopoverCell>
						</CanonRow>
						<CanonRow
							@title="Link"
							@form="flush"
						>
							<Cell
								@label="Link"
								@text={{this.linkText}}
								@selected={{this.linked}}
								data-format="link"
								@onClick={{openLink}}
							/>
						</CanonRow>
					</CanonRows><CanonRows><CanonRow
							@title="Align"
							@form="flush"
						>
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
						</CanonRow>
						<CanonRow
							@title="List"
							@form="flush"
						>
							<Cell
								@label="Bulleted"
								@text="Bullets"
								@selected={{eq
									this.listKind
									"bullet"
								}}
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
								data-format="numbers"
								@onClick={{fn
									this.list
									"number"
								}}
							/>
						</CanonRow>
						<CanonRow
							@title="Indent"
							@form="flush"
						>
							<Cell
								@label="Indent"
								@icon="arrow-right-to-line"
								@tip="top"
								data-format="indent"
								@onClick={{this.indentMore}}
							/>
							<Cell
								@label="Outdent"
								@icon="arrow-left-to-line"
								@tip="top"
								data-format="outdent"
								@onClick={{this.outdent}}
							/>
						</CanonRow>
						<CanonRow
							@title="Spacing"
							@form="flush"
						>
							<PopoverCell
								@label="Spacing"
								@text={{this.lineText}}
								@placement="left-start"
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
						</CanonRow>
						<CanonRow
							@title="Border"
							@form="flush"
						>
							<MenuCell
								@label="Border"
								@text={{this.borderTitle}}
								@items={{this.borderItems}}
								@placement="left-start"
								data-format="border"
							/>
						</CanonRow>

						<CanonButton
							class="is-break"
							@kind="segment"
							@text="Clear formatting"
							data-format="clear"
							@onClick={{this.clear}}
						/></CanonRows>{{/if}}
			</div>
		</div>
	</template>
}

export class InsertFlag extends FormatState<{
	Args: {
		style: SafeString;
		open: boolean;
		onToggle: () => void;
		onImage: () => void;
	};
}> {
	shut = () => {
		if (this.args.open) this.args.onToggle();
	};

	act = (run: () => void) => {
		run();
		this.shut();
	};

	get edgeFieldItems(): BarMenuEntry[] {
		return FIELDS.map((f) => ({
			title: f.text,
			run: () => this.act(() => this.inserts.field(f.kind)),
		}));
	}

	<template>
		<button
			type="button"
			class="err-edge err-flag is-plus {{if @open 'is-open'}}"
			style={{@style}}
			aria-label="Insert"
			aria-expanded={{if @open "true" "false"}}
			data-flag-insert
			{{on "click" @onToggle}}
			{{isolate}}
		><IconSvg @name="plus" />Insert</button>
		<div class="err-edge err-drawer-clip is-right" style={{@style}}>
			<div
				class="err-drawer {{if @open 'is-open'}}"
				role="group"
				aria-label="Insert"
				data-drawer="insert"
				{{isolate}}
				{{drawer @open}}
			>
				<CanonRows>
					<CanonHeading @text="Page" />
					<CanonGrid @columns={{2}}>
						<Cell
							@label="Cover page"
							@text="Cover page"
							@disabled={{this.covered}}
							data-edge-insert="cover"
							@onClick={{fn
								this.act
								this.inserts.cover
							}}
						/>
						<Cell
							@label="Page numbers"
							@text="Page numbers"
							data-edge-insert="page-numbers"
							@onClick={{fn
								this.act
								this.inserts.numbers
							}}
						/>
						<Cell
							@label="Page break"
							@text="Page break"
							data-edge-insert="page-break"
							@onClick={{fn
								this.act
								this.inserts.pageBreak
							}}
						/>
						<Cell
							@label="Section break"
							@text="Section break"
							data-edge-insert="section-break"
							@onClick={{fn
								this.act
								this.sectionBreak
							}}
						/>
					</CanonGrid>
					<CanonHeading @text="Reference" />
					<CanonGrid @columns={{2}}>
						<Cell
							@label="Table of contents"
							@text="Contents"
							@disabled={{this.hasToc}}
							data-edge-insert="toc"
							@onClick={{fn
								this.act
								this.inserts.contents
							}}
						/>
						<MenuCell
							@label="Field"
							@text="Field"
							@items={{this.edgeFieldItems}}
							@placement="left-start"
							data-edge-insert="field"
						/>
						<Cell
							@label="Footnote"
							@text="Footnote"
							data-edge-insert="footnote"
							@onClick={{fn
								this.act
								(fn
									this.inserts.note
									"foot"
								)
							}}
						/>
						<Cell
							@label="Endnote"
							@text="Endnote"
							data-edge-insert="endnote"
							@onClick={{fn
								this.act
								(fn
									this.inserts.note
									"end"
								)
							}}
						/>
					</CanonGrid>
					<CanonHeading @text="Object" />
					<CanonGrid @columns={{2}}>
						<TableMenu
							@phone={{true}}
							@tool="edge-table"
							@onInsert={{this.shut}}
							@text="Table"
						/>
						<Cell
							@label="Image"
							@text="Image"
							data-edge-insert="image"
							@onClick={{fn
								this.act
								@onImage
							}}
						/>
					</CanonGrid>
				</CanonRows>
			</div>
		</div>
	</template>
}
