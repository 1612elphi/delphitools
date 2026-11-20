import Component from '@glimmer/component';
import { clamp } from 'delphicanon/lib/number';
import CanonButton from 'delphicanon/components/canon-button';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonNumberField from 'delphicanon/components/canon-number-field';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSwitch from 'delphicanon/components/canon-switch';
import ToolPanel, {
	AnchorPicker,
	Choice,
} from 'delphitools-v2/components/errata/tool-panel';
import type { Anchor } from 'delphitools-v2/lib/pdf-stamp';
import {
	NUMBER_STYLES,
	numberLabel,
} from 'delphitools-v2/lib/errata/write/layout';
import {
	sectionIndex,
	sectionSetup,
	sectionStart,
	withSectionSetup,
} from 'delphitools-v2/lib/errata/write/model';
import {
	NUMBERS_FORMATS,
	formatLabel,
	pageNumbersOf,
	withPageNumbers,
	type NumbersFormat,
	type PageNumbers,
} from 'delphitools-v2/lib/errata/write/page-numbers';
import { writeStore } from 'delphitools-v2/lib/errata/write/store';
import type {
	Align,
	NumberStyle,
	Setup,
} from 'delphitools-v2/lib/errata/write/types';
import {
	closePanel,
	isPanel,
	writePanel,
} from 'delphitools-v2/lib/errata/write/view';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

const SPOTS: Anchor[] = [
	'top-left',
	'top-center',
	'top-right',
	'bottom-left',
	'bottom-center',
	'bottom-right',
];

const ALIGN: Record<string, Align> = {
	left: 'left',
	center: 'centre',
	right: 'right',
};

const NUMBERINGS = NUMBER_STYLES.map((value) => ({
	value,
	label: numberLabel(1, value),
}));

export default class NumbersPanel extends Component {
	state = new TrackedExternal(writeStore.subscribe, writeStore.get);
	open = new TrackedExternal(writePanel.subscribe, isPanel('numbers'));

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

	get lang() {
		const s = this.state.current;
		return s ? (sectionSetup(s.doc, 0).lang ?? 'en') : 'en';
	}

	get title() {
		const s = this.state.current;
		if (!s || !s.doc.blocks.some((b) => b.kind === 'section'))
			return 'Page numbers';
		return `Section ${sectionIndex(s.doc, s.sel.focus.block) + 1}`;
	}

	get numbers(): PageNumbers | null {
		return this.setup ? pageNumbersOf(this.setup) : null;
	}

	get spot(): Anchor | null {
		const n = this.numbers;
		if (!n) return null;
		const side =
			n.align === 'centre'
				? 'center'
				: n.align === 'right'
					? 'right'
					: 'left';
		return `${n.part === 'header' ? 'top' : 'bottom'}-${side}` as Anchor;
	}

	get formats() {
		return NUMBERS_FORMATS.map((value) => ({
			value,
			label: formatLabel(value, this.lang),
		}));
	}

	get numbering(): NumberStyle {
		return this.setup?.numbering ?? 'decimal';
	}

	get restart() {
		return this.setup?.restart ?? 1;
	}

	update(next: Partial<Setup>) {
		const s = writeStore.get();
		const setup = this.setup;
		if (!s || !setup) return;
		writeStore.commit(
			{
				doc: withSectionSetup(s.doc, this.start, {
					...setup,
					...next,
				}),
				sel: s.sel,
			},
			'other',
		);
	}

	place(spec: PageNumbers | null) {
		const setup = this.setup;
		if (!setup) return;
		const next = withPageNumbers(setup, spec, this.lang);
		this.update({ header: next.header, footer: next.footer });
	}

	pickSpot = (anchor: Anchor) => {
		const [row, col] = anchor.split('-') as [string, string];
		this.place({
			part: row === 'top' ? 'header' : 'footer',
			align: ALIGN[col] ?? 'left',
			format: this.numbers?.format ?? 'n',
		});
	};

	pickFormat = (format: NumbersFormat) =>
		this.place({
			part: this.numbers?.part ?? 'footer',
			align: this.numbers?.align ?? 'centre',
			format,
		});

	remove = () => this.place(null);

	setNumbering = (numbering: NumberStyle) =>
		this.update({
			numbering:
				numbering === 'decimal' ? undefined : numbering,
		});

	setTitlePage = (on: boolean) =>
		this.update({ titlePage: on || undefined });

	setRestarts = (on: boolean) =>
		this.update({ restart: on ? 1 : undefined });

	setRestart = (value: number) =>
		this.update({ restart: clamp(Math.round(value), 1, 9999) });

	<template>
		<ToolPanel
			@open={{this.open.current}}
			@mode="write-numbers"
			@label={{this.title}}
			@onCancel={{closePanel}}
			@cancelLabel="Done"
		>
			<CanonRows class="err-write-setup-col">
				<AnchorPicker
					@value={{this.spot}}
					@anchors={{SPOTS}}
					@onChange={{this.pickSpot}}
				/>
				<CanonButton
					@kind="segment"
					@text="Remove"
					@disabled={{if this.numbers false true}}
					data-numbers="remove"
					@onClick={{this.remove}}
				/>
			</CanonRows>
			<CanonRows class="err-write-setup-col">
				<CanonHeading @text="Format" />
				<Choice
					@label="Text"
					@options={{this.formats}}
					@value={{if
						this.numbers
						this.numbers.format
						null
					}}
					@onChange={{this.pickFormat}}
					@columns={{2}}
					data-numbers="format"
				/>
				<Choice
					@label="Numbering"
					@options={{NUMBERINGS}}
					@value={{this.numbering}}
					@onChange={{this.setNumbering}}
					@columns={{4}}
					data-setup="numbering"
				/>
			</CanonRows>
			<CanonRows class="err-write-setup-col">
				<CanonHeading @text="Pages" />
				<CanonRow @title="Different first page" as |id|>
					<CanonSwitch
						aria-labelledby={{id}}
						@on={{this.setup.titlePage}}
						@onChange={{this.setTitlePage}}
						data-setup="title-page"
					/>
				</CanonRow>
				<CanonRow @title="Restart" as |id|>
					<CanonSwitch
						aria-labelledby={{id}}
						@on={{if
							this.setup.restart
							true
							false
						}}
						@onChange={{this.setRestarts}}
						data-setup="restart"
					/>
				</CanonRow>
				{{#if this.setup.restart}}
					<CanonRow
						@title="Start at"
						@form="flush"
						as |id|
					>
						<CanonNumberField
							@value={{this.restart}}
							@min={{1}}
							@max={{9999}}
							@labelledBy={{id}}
							@onChange={{this.setRestart}}
						/>
					</CanonRow>
				{{/if}}
			</CanonRows>
		</ToolPanel>
	</template>
}
