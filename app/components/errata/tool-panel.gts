import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import type { TOC } from '@ember/component/template-only';
import type { ComponentLike } from '@glint/template';
import { modifier } from 'ember-modifier';
import { eq } from 'ember-truth-helpers';
import CanonButton from 'delphicanon/components/canon-button';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonLoader from 'delphicanon/components/canon-loader';
import CanonRow from 'delphicanon/components/canon-row';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSlider from 'delphicanon/components/canon-slider';
import { Cell } from 'delphitools-v2/components/substrata/editor/cells';
import { menuIcon } from 'delphitools-v2/components/substrata/editor/tool-bar/bar-cells';
import type { Stamped } from 'delphitools-v2/lib/errata/doc-model';
import {
	scopePages,
	type PageScope as Scope,
} from 'delphitools-v2/lib/errata/stamps';
import { preview } from 'delphitools-v2/lib/errata/ui';
import { ANCHORS, type Anchor } from 'delphitools-v2/lib/pdf-stamp';

export interface ToolPanelSignature {
	Element: HTMLElement;
	Args: {
		open: boolean;
		mode?: string | null;
		icon?: string;
		label: string;
		onCancel?: () => void;
		cancelLabel?: string;
		onApply?: () => void;
		applyLabel?: string;
		canApply?: boolean;
		busy?: boolean;
		failed?: boolean;
	};
	Blocks: {
		default: [];
		status: [];
		actions: [];
	};
}

function applyOff(busy?: boolean, canApply?: boolean): boolean {
	return busy === true || canApply === false;
}

const ToolPanel: TOC<ToolPanelSignature> = <template>
	<section
		class="err-mode {{if @open 'is-open'}}"
		data-mode={{@mode}}
		aria-label={{@label}}
		inert={{unless @open true}}
		...attributes
	>
		<div class="sub-panel-header err-mode-head">
			<CanonHeading
				@text={{@label}}
				class="sub-panel-title"
			/>
			{{#if (has-block "status")}}
				<span class="err-mode-status">{{yield
						to="status"
					}}</span>
			{{/if}}
			{{#if @failed}}
				<span
					class="err-mode-tag err-mode-failed"
				>Failed</span>
			{{/if}}
			{{#if @busy}}
				<span class="err-mode-busy"><CanonLoader
					/></span>
			{{/if}}
			{{yield to="actions"}}
			{{#if @onCancel}}
				<Cell
					@label={{if
						@cancelLabel
						@cancelLabel
						"Cancel"
					}}
					@text={{if
						@cancelLabel
						@cancelLabel
						"Cancel"
					}}
					@onClick={{@onCancel}}
				/>
			{{/if}}
			{{#if @onApply}}
				<CanonButton
					class="sub-cell err-mode-apply"
					@kind="primary"
					@text={{if
						@applyLabel
						@applyLabel
						"Apply"
					}}
					@disabled={{applyOff @busy @canApply}}
					@onClick={{@onApply}}
				/>
			{{/if}}
		</div>
		{{#if (has-block)}}
			<div class="err-mode-body">{{yield}}</div>
		{{/if}}
	</section>
</template>;

export default ToolPanel;

export const Group: TOC<{
	Element: HTMLDivElement;
	Blocks: { default: [] };
}> = <template>
	<div class="err-mode-group" ...attributes>{{yield}}</div>
</template>;

export const Field: TOC<{
	Element: HTMLDivElement;
	Args: { label: string };
	Blocks: { default: [] };
}> = <template>
	<CanonRow
		@title={{@label}}
		@form="flush"
		class="err-mode-field"
		...attributes
	>
		<span class="err-mode-control">{{yield}}</span>
	</CanonRow>
</template>;

export const InputField = Field;

export interface SegmentedOption<V> {
	value: V;
	label?: string;
	icon?: string;
}

export class Segmented<V extends string | number> extends Component<{
	Element: HTMLDivElement;
	Args: {
		options: readonly SegmentedOption<V>[];
		value: V | null;
		onChange: (value: V) => void;
		label?: string;
		columns?: number;
	};
}> {
	get items(): string[] {
		return this.args.options.map((o) => o.label ?? String(o.value));
	}

	get icons(): ComponentLike[] | undefined {
		const options = this.args.options;
		return options.every((o) => o.icon)
			? options.map((o) => menuIcon(o.icon!))
			: undefined;
	}

	get selected(): number | null {
		const index = this.args.options.findIndex(
			(o) => o.value === this.args.value,
		);
		return index < 0 ? null : index;
	}

	change = (index: number) => {
		const option = this.args.options[index];
		if (option) this.args.onChange(option.value);
	};

	<template>
		<CanonSegmented
			class="err-mode-seg"
			@items={{this.items}}
			@icons={{this.icons}}
			@selected={{this.selected}}
			@onChange={{this.change}}
			@columns={{@columns}}
			aria-label={{@label}}
			...attributes
		/>
	</template>
}

export class Choice<V extends string | number> extends Component<{
	Element: HTMLDivElement;
	Args: {
		label: string;
		options: readonly SegmentedOption<V>[];
		value: V | null;
		onChange: (value: V) => void;
		columns?: number;
	};
}> {
	<template>
		<CanonRow @title={{@label}} @form="stacked" class="err-choice">
			<Segmented
				@options={{@options}}
				@value={{@value}}
				@onChange={{@onChange}}
				@label={{@label}}
				@columns={{@columns}}
				...attributes
			/>
		</CanonRow>
	</template>
}

export function readNumber(onChange: (value: number) => void) {
	return (event: Event) =>
		onChange(Number((event.target as HTMLInputElement).value));
}

export function readText(onChange: (value: string) => void) {
	return (event: Event) =>
		onChange((event.target as HTMLInputElement).value);
}

export const focusOnOpen = modifier(
	(
		el: HTMLInputElement,
		[open]: [boolean],
		{ onOpen }: { onOpen?: (el: HTMLInputElement) => void },
	) => {
		if (!open) return;
		onOpen?.(el);
		el.focus({ preventScroll: true });
		el.select();
	},
);

export const livePreview = modifier(
	(_el: Element, [items]: [Stamped[] | undefined]) => {
		if (items) preview(items);
	},
);

function readout(unit?: string) {
	return (value: number) => `${value}${unit ?? ''}`;
}

export const Slider: TOC<{
	Args: {
		label: string;
		value: number;
		min: number;
		max: number;
		step?: number;
		unit?: string;
		onChange: (value: number) => void;
	};
}> = <template>
	<Field @label={{@label}}>
		<CanonSlider
			class="err-mode-slider"
			@value={{@value}}
			@min={{@min}}
			@max={{@max}}
			@step={{if @step @step 1}}
			@label={{@label}}
			@readout={{readout @unit}}
			@onChange={{@onChange}}
		/>
	</Field>
</template>;

const SCOPES: SegmentedOption<Scope>[] = [
	{ value: 'all', label: 'All' },
	{ value: 'current', label: 'Current' },
	{ value: 'range', label: 'Range' },
];

export class PageScopeState {
	@tracked scope: Scope;
	@tracked range = '';

	constructor(scope: Scope) {
		this.scope = scope;
	}

	setScope = (scope: Scope) => (this.scope = scope);
	setRange = (range: string) => (this.range = range);

	indices(pageCount: number, pageIndex: { current: number }) {
		return scopePages(
			this.scope,
			this.range,
			pageCount,
			this.scope === 'current' ? pageIndex.current : 0,
		);
	}
}

export const PageScope: TOC<{
	Args: {
		state: PageScopeState;
		invalid: boolean;
	};
}> = <template>
	<Field @label="Pages">
		<Segmented
			@options={{SCOPES}}
			@value={{@state.scope}}
			@onChange={{@state.setScope}}
			@label="Pages"
		/>
		{{#if (eq @state.scope "range")}}
			<input
				class="err-mode-input is-narrow"
				aria-label="Range"
				aria-invalid={{if @invalid "true" "false"}}
				placeholder="1-3, 5"
				value={{@state.range}}
				{{on "input" (readText @state.setRange)}}
			/>
		{{/if}}
	</Field>
</template>;

export const AnchorPicker: TOC<{
	Args: {
		value: Anchor | null;
		anchors?: Anchor[];
		onChange: (anchor: Anchor) => void;
	};
}> = <template>
	<Field @label="Position" class="is-tall">
		<span
			class="err-anchor-page"
			role="radiogroup"
			aria-label="Position"
		>
			{{#each (if @anchors @anchors ANCHORS) as |a|}}
				<button
					type="button"
					role="radio"
					class="err-anchor-cell
						{{if
							(eq @value a)
							'is-active'
						}}"
					aria-checked={{if
						(eq @value a)
						"true"
						"false"
					}}
					aria-label={{a}}
					title={{a}}
					data-anchor={{a}}
					{{on "click" (fn @onChange a)}}
				></button>
			{{/each}}
		</span>
	</Field>
</template>;
