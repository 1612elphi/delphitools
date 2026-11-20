import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { guidFor } from '@ember/object/internals';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonEmptyRow from 'delphicanon/components/canon-empty-row';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonTextCell from 'delphicanon/components/canon-text-cell';
import { ChevronsUpDown } from 'delphicanon/lib/control-icons';
import {
	attach,
	hide,
	isOpen,
	panelFor,
	type CanonPlacement,
} from 'delphicanon/lib/popover';
import 'delphicanon/components/canon-menu-cell.css';
import 'delphicanon/components/canon-popover.css';
import { allSeries } from 'delphitools-v2/components/tools/paper-sizes/data';
import {
	CUSTOM_MAX_MM,
	CUSTOM_MIN_MM,
	parseCustomSize,
} from 'delphitools-v2/lib/paper-sizes';
import {
	allPicks,
	choiceFor,
	choiceId,
	choiceTitle,
	closest,
	customChoice,
	dimensions,
	matches,
	parseQuery,
	signed,
	type PaperChoice,
	type PaperPick,
	type PaperQuery,
} from 'delphitools-v2/components/tools/paper-sizes/paper';
import Cell from 'delphitools-v2/components/tools/paper-sizes/cell';
import './popover.css';

interface Signature {
	Args: {
		value?: string;
		extra?: string;
		extraId?: string;
		min?: number;
		max?: number;
		placeholder?: string;
		label?: string;
		labelledBy?: string;
		disabled?: boolean;
		placement?: CanonPlacement;
		onPick: (id: string) => void;
	};
	Element: HTMLButtonElement;
}

const findPlaceholder = 'A4 · 210×297 · 8.5x11in';
const columns = 3;
const mm = (pick: PaperPick) => dimensions(pick.size, 0, 300);
const picksBySeries = allSeries.map(({ id, name }) => ({
	id,
	name,
	picks: allPicks.filter((pick) => pick.series === id),
}));

export default class PaperPopover extends Component<Signature> {
	id = `${guidFor(this)}-paper`;
	valueId = `${guidFor(this)}-paper-value`;
	@tracked text = '';
	@tracked query: PaperQuery = parseQuery('');
	@tracked open = false;
	#panel?: HTMLElement;

	get min() {
		return this.args.min ?? CUSTOM_MIN_MM;
	}

	get max() {
		return this.args.max ?? CUSTOM_MAX_MM;
	}

	get selected() {
		return choiceFor(this.args.value, this.args.extraId);
	}

	get title() {
		return (
			choiceTitle(this.selected, this.args.extra) ??
			this.args.placeholder ??
			''
		);
	}

	get labelledBy() {
		return this.args.labelledBy
			? `${this.args.labelledBy} ${this.valueId}`
			: undefined;
	}

	get extraSelected() {
		return this.selected?.kind === 'extra';
	}

	get selectedId() {
		const { selected } = this;
		return selected?.kind === 'paper' ? selected.id : undefined;
	}

	get custom() {
		return customChoice(this.query);
	}

	get customTitle() {
		return choiceTitle(this.custom);
	}

	get customOutside() {
		const { custom } = this;
		return (
			custom !== undefined &&
			parseCustomSize(
				choiceId(custom),
				this.min,
				this.max,
			) === undefined
		);
	}

	get customSelected() {
		const { custom, selected } = this;
		return (
			custom !== undefined &&
			selected?.kind === 'custom' &&
			choiceId(selected) === choiceId(custom)
		);
	}

	cell = (pick: PaperPick, detail?: string) => ({
		key: pick.key,
		pick,
		text: mm(pick),
		mark: pick.size.id === this.selectedId ? 1 : undefined,
		detail,
	});

	@cached
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

	@cached
	get series() {
		return picksBySeries.flatMap(({ id, name, picks }) => {
			const cells = picks
				.filter((pick) => matches(this.query, pick))
				.map((pick) => this.cell(pick));
			return cells.length ? [{ id, name, cells }] : [];
		});
	}

	find = (text: string) => {
		this.text = text;
		this.query = parseQuery(text);
	};

	choose(choice: PaperChoice) {
		this.args.onPick(choiceId(choice, this.args.extraId));
		if (this.#panel) hide(this.#panel);
	}

	pick = (pick: PaperPick) =>
		this.choose({ kind: 'paper', id: pick.size.id });
	pickExtra = () => this.choose({ kind: 'extra' });
	pickCustom = () => {
		if (this.custom) this.choose(this.custom);
	};

	enter = (event: KeyboardEvent) => {
		if (event.key !== 'Enter' || event.isComposing) return;
		if (!this.custom || this.customOutside) return;
		event.preventDefault();
		this.pickCustom();
	};

	#seed() {
		const { selected } = this;
		this.find(
			selected?.kind === 'custom'
				? `${choiceId(selected)}mm`
				: '',
		);
	}

	trigger = modifier((button: HTMLButtonElement) => {
		const panel = panelFor(button, this.id);
		this.#panel = panel;
		const detach = attach(panel, button, {
			placement: this.args.placement ?? 'bottom-start',
			invokes: true,
			haspopup: 'dialog',
		});
		const opening = (event: ToggleEvent) => {
			this.open = event.newState === 'open';
			if (this.open) this.#seed();
		};
		const opened = () => {
			if (!isOpen(panel)) return;
			const field =
				panel.querySelector<HTMLInputElement>(
					'.paper-find',
				);
			field?.focus({ preventScroll: true });
			field?.select();
		};
		panel.addEventListener('beforetoggle', opening);
		panel.addEventListener('toggle', opened);
		return () => {
			panel.removeEventListener('beforetoggle', opening);
			panel.removeEventListener('toggle', opened);
			detach();
		};
	});

	<template>
		<button
			type="button"
			class="canon-menu-cell paper-popover-trigger
				{{if @disabled 'canon-menu-cell--disabled'}}"
			aria-labelledby={{this.labelledBy}}
			aria-label={{@label}}
			disabled={{@disabled}}
			{{this.trigger}}
			...attributes
		>
			<span
				id={{this.valueId}}
				class="canon-menu-cell-title"
			>{{this.title}}</span>
			<span
				class="canon-menu-cell-icon"
				aria-hidden="true"
			><ChevronsUpDown /></span>
		</button>
		<div
			id={{this.id}}
			class="canon-popover paper-popover"
			popover="auto"
			role="dialog"
			aria-label={{if @label @label "Page size"}}
		>
			<CanonRows @framed={{true}}>
				<CanonHeading @text="Page size" />
				<CanonTextCell
					class="paper-find"
					aria-label="Find"
					autocomplete="off"
					autocapitalize="none"
					spellcheck="false"
					@value={{this.text}}
					@placeholder={{findPlaceholder}}
					@onChange={{this.find}}
					{{on "keydown" this.enter}}
				/>
			</CanonRows>
			{{#if @extra}}
				<CanonRows @framed={{true}}>
					<CanonGrid>
						<CanonButton
							class="paper-popover-extra"
							@kind="segment"
							@text={{@extra}}
							@selected={{this.extraSelected}}
							@onClick={{this.pickExtra}}
						/>
					</CanonGrid>
				</CanonRows>
			{{/if}}
			{{#if this.custom}}
				<CanonRows @framed={{true}}>
					<CanonGrid>
						<CanonButton
							class="paper-popover-custom"
							aria-current={{if
								this.customSelected
								"true"
							}}
							@kind="segment"
							@text={{this.customTitle}}
							@selected={{this.customSelected}}
							@disabled={{this.customOutside}}
							@onClick={{this.pickCustom}}
						/>
					</CanonGrid>
				</CanonRows>
			{{/if}}
			{{#if this.open}}
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
									@size={{cell.pick.size}}
									@text={{cell.text}}
									@mark={{cell.mark}}
									@tick={{true}}
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
				<CanonRows
					class="paper-popover-list"
					@framed={{true}}
				>
					{{#each
						this.series key="id"
						as |series|
					}}
						<CanonHeading
							@text={{series.name}}
						/>
						<CanonGrid @columns={{columns}}>
							{{#each
								series.cells
								key="key"
								as |cell|
							}}
								<Cell
									@size={{cell.pick.size}}
									@text={{cell.text}}
									@mark={{cell.mark}}
									@tick={{true}}
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
			{{/if}}
		</div>
	</template>
}
