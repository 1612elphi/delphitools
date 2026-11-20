import Component from '@glimmer/component';
import { fn } from '@ember/helper';
import { clamp } from 'delphicanon/lib/number';
import CanonButton from 'delphicanon/components/canon-button';
import CanonNumberField from 'delphicanon/components/canon-number-field';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSwitch from 'delphicanon/components/canon-switch';
import PaperPopover from 'delphitools-v2/components/tools/paper-sizes/popover';
import ToolPanel, { Choice } from 'delphitools-v2/components/errata/tool-panel';
import {
	MM_TO_POINTS,
	customSizeId,
	matchPaperSize,
	paperSizeFor,
} from 'delphitools-v2/lib/paper-sizes';
import {
	sectionBreak,
	setSection,
} from 'delphitools-v2/lib/errata/write/editor';
import { DEFAULT_GUTTER } from 'delphitools-v2/lib/errata/write/layout';
import {
	maxMargin,
	sectionIndex,
	sectionStart,
	sectionSetup,
	withSectionSetup,
} from 'delphitools-v2/lib/errata/write/model';
import { writeStore } from 'delphitools-v2/lib/errata/write/store';
import type { Setup } from 'delphitools-v2/lib/errata/write/types';
import {
	closePanel,
	focusEditor,
	isPanel,
	writePanel,
} from 'delphitools-v2/lib/errata/write/view';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

type Side = keyof Setup['margins'];

export const PAPER_MIN = 50;
export const PAPER_MAX = 1200;

const ORIENTATIONS = [
	{ value: 'portrait', label: 'Portrait' },
	{ value: 'landscape', label: 'Landscape' },
] as const;

const VALIGNS = [
	{ value: 'top', label: 'Top' },
	{ value: 'centre', label: 'Centre' },
	{ value: 'bottom', label: 'Bottom' },
] as const;

const COLUMNS = [1, 2, 3].map((value) => ({ value }));

const LANGS = [
	{ value: 'en', label: 'EN' },
	{ value: 'de', label: 'DE' },
] as const;

const MARGINS: { side: Side; title: string }[] = [
	{ side: 'top', title: 'Top' },
	{ side: 'bottom', title: 'Bottom' },
	{ side: 'left', title: 'Left' },
	{ side: 'right', title: 'Right' },
];

const mm = (pt: number) => Math.round((pt / MM_TO_POINTS) * 10) / 10;

export default class SetupPanel extends Component {
	state = new TrackedExternal(writeStore.subscribe, writeStore.get);
	open = new TrackedExternal(writePanel.subscribe, isPanel('setup'));

	willDestroy() {
		super.willDestroy();
		this.state.unsubscribe();
		this.open.unsubscribe();
	}

	get start(): number {
		const s = this.state.current;
		return s ? sectionStart(s.doc, s.sel.focus.block) : -1;
	}

	get setup(): Setup | null {
		const s = this.state.current;
		return s ? sectionSetup(s.doc, s.sel.focus.block) : null;
	}

	get title() {
		const s = this.state.current;
		if (!s || !s.doc.blocks.some((b) => b.kind === 'section'))
			return 'Document';
		return `Section ${sectionIndex(s.doc, s.sel.focus.block) + 1}`;
	}

	get docSetup(): Setup | null {
		return this.state.current?.doc.setup ?? null;
	}

	get paperId() {
		const s = this.setup;
		if (!s) return undefined;
		return (
			matchPaperSize(s.width, s.height) ??
			customSizeId(
				mm(Math.min(s.width, s.height)),
				mm(Math.max(s.width, s.height)),
			)
		);
	}

	get orientation() {
		const s = this.setup;
		return s && s.width > s.height ? 'landscape' : 'portrait';
	}

	get columns() {
		return this.setup?.columns ?? 1;
	}

	get multiColumn() {
		return this.columns > 1;
	}

	get gutter() {
		return mm(this.setup?.gutter ?? DEFAULT_GUTTER);
	}

	get lang() {
		return this.docSetup?.lang ?? 'en';
	}

	margin = (side: Side) =>
		this.setup ? mm(this.setup.margins[side]) : 0;

	commit(start: number, setup: Setup) {
		const s = writeStore.get();
		if (!s) return;
		writeStore.commit(
			{
				doc: withSectionSetup(s.doc, start, setup),
				sel: s.sel,
			},
			'other',
		);
	}

	update = setSection;

	updateDoc(next: Partial<Setup>) {
		const setup = this.docSetup;
		if (setup) this.commit(-1, { ...setup, ...next });
	}

	pickPaper = (id: string) => {
		const p = paperSizeFor(id, PAPER_MIN, PAPER_MAX);
		if (!p) return;
		const a = p.widthMm * MM_TO_POINTS;
		const b = p.heightMm * MM_TO_POINTS;
		const land = this.orientation === 'landscape';
		this.update({
			width: land ? Math.max(a, b) : Math.min(a, b),
			height: land ? Math.min(a, b) : Math.max(a, b),
		});
	};

	pickOrientation = (value: 'portrait' | 'landscape') => {
		const s = this.setup;
		if (!s || value === this.orientation) return;
		this.update({ width: s.height, height: s.width });
	};

	setMargin = (side: Side, value: number) => {
		const s = this.setup;
		if (!s) return;
		const pt = clamp(value * MM_TO_POINTS, 0, maxMargin(s, side));
		this.update({ margins: { ...s.margins, [side]: pt } });
	};

	get valign() {
		return this.setup?.valign ?? 'top';
	}

	setValign = (valign: 'top' | 'centre' | 'bottom') =>
		this.update({ valign: valign === 'top' ? undefined : valign });

	setColumns = (columns: number) =>
		this.update({ columns: columns > 1 ? columns : undefined });

	setGutter = (value: number) =>
		this.update({ gutter: Math.max(0, value) * MM_TO_POINTS });

	setLang = (lang: 'en' | 'de') => this.updateDoc({ lang });

	setHyphenate = (hyphenate: boolean) => this.updateDoc({ hyphenate });

	addSection = () => {
		sectionBreak();
		focusEditor();
	};

	<template>
		<ToolPanel
			@open={{this.open.current}}
			@mode="write-setup"
			@label={{this.title}}
			@onCancel={{closePanel}}
			@cancelLabel="Done"
		>
			<CanonRows class="err-write-setup-col">
				<CanonHeading @text="Paper" />
				<PaperPopover
					@min={{PAPER_MIN}}
					@max={{PAPER_MAX}}
					@value={{this.paperId}}
					@label="Paper size"
					@placement="top-start"
					@onPick={{this.pickPaper}}
				/>
				<Choice
					@label="Orientation"
					@options={{ORIENTATIONS}}
					@value={{this.orientation}}
					@onChange={{this.pickOrientation}}
					@columns={{2}}
				/>
				<Choice
					@label="Vertical"
					@options={{VALIGNS}}
					@value={{this.valign}}
					@onChange={{this.setValign}}
					@columns={{3}}
					data-setup="valign"
				/>
				<Choice
					@label="Columns"
					@options={{COLUMNS}}
					@value={{this.columns}}
					@onChange={{this.setColumns}}
					@columns={{3}}
					data-setup="columns"
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
			</CanonRows>
			<CanonRows class="err-write-setup-col">
				<CanonHeading @text="Margins" />
				{{#each MARGINS as |m|}}
					<CanonRow
						@title={{m.title}}
						@form="flush"
						as |id|
					>
						<CanonNumberField
							@value={{this.margin
								m.side
							}}
							@min={{0}}
							@max={{200}}
							@unit="mm"
							@labelledBy={{id}}
							@onChange={{fn
								this.setMargin
								m.side
							}}
						/>
					</CanonRow>
				{{/each}}
			</CanonRows>
			<CanonRows class="err-write-setup-col">
				<CanonHeading @text="Text" />
				<Choice
					@label="Language"
					@options={{LANGS}}
					@value={{this.lang}}
					@onChange={{this.setLang}}
					@columns={{2}}
					data-setup="lang"
				/>
				<CanonRow @title="Hyphenation" as |id|>
					<CanonSwitch
						aria-labelledby={{id}}
						@on={{this.docSetup.hyphenate}}
						@onChange={{this.setHyphenate}}
						data-setup="hyphenate"
					/>
				</CanonRow>
				<CanonButton
					@text="Section break"
					@kind="segment"
					@onClick={{this.addSection}}
					data-setup="section-break"
				/>
			</CanonRows>
		</ToolPanel>
	</template>
}
