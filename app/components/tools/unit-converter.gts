import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import type Owner from '@ember/owner';
import type { TOC } from '@ember/component/template-only';
import { modifier } from 'ember-modifier';
import CanonBigNumberField from 'delphicanon/components/canon-big-number-field';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonFromTo from 'delphicanon/components/canon-from-to';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonNumberField from 'delphicanon/components/canon-number-field';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonTiles from 'delphicanon/components/canon-tiles';
import press from 'delphicanon/modifiers/canon-press';
import { formatDecimal } from 'delphicanon/lib/number';
import type CanonToastService from 'delphicanon/services/canon-toast';
import { IconSvg } from 'delphitools-v2/components/icon';
import Picture, {
	pictureHeight,
} from 'delphitools-v2/components/tools/unit-converter/picture';
import {
	categories,
	convert,
	format,
	formula,
	fromBase,
	instrumentFor,
	openingPairs,
	pixels,
} from 'delphitools-v2/components/tools/unit-converter/units';
import './unit-converter/unit-converter.css';

const categoryNames = categories.map((c) => c.name);

const SwapIcon = <template><IconSvg @name="arrow-left-right" /></template>;
const CopyIcon = <template><IconSvg @name="copy" /></template>;

type Role = 'from' | 'to' | 'other';

interface UnitRowSignature {
	Args: {
		label: string;
		symbol: string;
		value: string;
		role: Role;
		onPick: () => void;
	};
}

const UnitRow: TOC<UnitRowSignature> = <template>
	<button
		type="button"
		class="uc-row uc-row--{{@role}}"
		aria-label="{{@label}}{{if @value ', '}}{{@value}}{{if
			@value
			' '
		}}{{if @value @symbol}}"
		aria-current={{if (lit @role) "true"}}
		{{press}}
		{{on "click" @onPick}}
	>
		<span class="uc-plate">{{@symbol}}</span>
		<span class="uc-name">{{@label}}</span>
		<span class="uc-value">{{@value}}</span>
	</button>
</template>;

function lit(role: Role) {
	return role !== 'other';
}

const inputMode = modifier((element: HTMLElement, [mode]: [string]) => {
	const input = element.querySelector('input');
	if (input) input.inputMode = mode;
});

function selectAll(event: FocusEvent) {
	const field = event.target;
	if (field instanceof HTMLInputElement)
		requestAnimationFrame(() => field.select());
}

function clean(text: string) {
	return text.replace(/,/g, '.').replace(/−/g, '-');
}

export default class UnitConverter extends Component {
	@service('canon-toast') declare toast: CanonToastService;

	@tracked category = 'Length';
	@tracked text = '1';
	@tracked fromIndex = 0;
	@tracked toIndex = 1;
	@tracked ppi = 300;
	#tapsFrom = true;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		const ppi = Number(query.get('ucPpi'));
		if (ppi >= 1) this.ppi = Math.round(ppi);
		const name = query.get('ucCategory');
		this.choose(
			name && categoryNames.includes(name) ? name : 'Length',
		);
		const find = (key: string) =>
			this.units.findIndex(
				(u) => u.symbol === query.get(key),
			);
		const from = find('ucFrom');
		const to = find('ucTo');
		if (from >= 0) this.fromIndex = from;
		if (to >= 0) this.toIndex = to;
		const value = query.get('ucValue');
		if (value !== null) this.text = clean(value);
	}

	get categoryNames() {
		return categoryNames;
	}

	get bandHeight() {
		return pictureHeight;
	}

	get units() {
		const { units } = categories.find(
			(c) => c.name === this.category,
		)!;
		return this.hasPixels ? [...units, pixels(this.ppi)] : units;
	}

	get hasPixels() {
		return this.category === 'Length';
	}

	setPpi = (ppi: number) => (this.ppi = ppi);

	get labels() {
		return this.units.map((u) => u.label);
	}

	get from() {
		return this.units[this.fromIndex]!;
	}

	get to() {
		return this.units[this.toIndex]!;
	}

	get instrument() {
		return instrumentFor(this.category);
	}

	get value() {
		const typed = clean(this.text).trim();
		const value = typed === '' ? NaN : Number(typed);
		return Number.isFinite(value) ? value : undefined;
	}

	get categoryIndex() {
		return categoryNames.indexOf(this.category);
	}

	get inputMode() {
		return this.category === 'Temperature' ? 'text' : 'decimal';
	}

	get rows() {
		const { value } = this;
		return this.units.map((unit, index) => ({
			index,
			label: unit.label,
			symbol: unit.symbol,
			value:
				value === undefined
					? ''
					: format(
							convert(
								value,
								this.from,
								unit,
							),
						),
			role: this.roleOf(index),
		}));
	}

	roleOf(index: number): Role {
		if (index === this.fromIndex) return 'from';
		return index === this.toIndex ? 'to' : 'other';
	}

	get reference() {
		const { from, to } = this;
		if (this.category === 'Temperature')
			return [
				{ label: to.symbol, value: formula(from, to) },
				{
					label: from.symbol,
					value: formula(to, from),
				},
			];
		return [
			{
				label: `1 ${from.symbol}`,
				value: `${format(convert(1, from, to))} ${to.symbol}`,
			},
			{
				label: `1 ${to.symbol}`,
				value: `${format(convert(1, to, from))} ${from.symbol}`,
			},
		];
	}

	get copyDisabled() {
		return this.value === undefined;
	}

	choose(name: string) {
		this.category = name;
		const [from, to] = openingPairs[name] ?? [];
		const index = (symbol?: string) =>
			this.units.findIndex((u) => u.symbol === symbol);
		this.fromIndex = Math.max(0, index(from));
		const toIndex = index(to);
		this.toIndex =
			toIndex >= 0
				? toIndex
				: Math.min(1, this.units.length - 1);
		this.#tapsFrom = true;
	}

	pickCategory = (index: number) => this.choose(categoryNames[index]!);

	typed = (text: string) => (this.text = clean(text));

	nudge = (direction: -1 | 1) => {
		const current = this.value ?? 0;
		const step = current !== 0 && Math.abs(current) < 1 ? 0.1 : 1;
		const next = (Math.round(current / step) + direction) * step;
		const floor =
			this.category === 'Temperature'
				? fromBase(this.from, 0)
				: 0;
		this.text = formatDecimal(Math.max(floor, next), 4);
	};

	pickFrom = (index: number) => {
		if (index === this.toIndex) this.toIndex = this.fromIndex;
		this.fromIndex = index;
	};

	pickTo = (index: number) => {
		if (index === this.fromIndex) this.fromIndex = this.toIndex;
		this.toIndex = index;
	};

	tap = (index: number) => {
		if (this.#tapsFrom) this.pickFrom(index);
		else this.pickTo(index);
		this.#tapsFrom = !this.#tapsFrom;
	};

	swap = () => {
		[this.fromIndex, this.toIndex] = [this.toIndex, this.fromIndex];
	};

	copy = () => {
		const { value } = this;
		if (value === undefined) return;
		const result = convert(value, this.from, this.to);
		void this.toast.copy(String(Number(result.toPrecision(10))));
	};

	<template>
		<CanonSplit class="unit-converter">
			<:banner>
				<CanonCanvas @height={{this.bandHeight}}>
					<Picture
						@instrument={{this.instrument}}
						@value={{this.value}}
						@from={{this.from}}
						@to={{this.to}}
					/>
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<CanonRows @framed={{true}}>
					<CanonBigNumberField
						class="uc-field"
						@value={{this.text}}
						@placeholder="0"
						@unit={{this.from.symbol}}
						@label="Value"
						@onStep={{this.nudge}}
						@onInput={{this.typed}}
						{{inputMode this.inputMode}}
						{{on "focusin" selectAll}}
					/>
					<CanonFromTo
						@items={{this.labels}}
						@from={{this.fromIndex}}
						@to={{this.toIndex}}
						@onFromChange={{this.pickFrom}}
						@onToChange={{this.pickTo}}
					/>
					<CanonGrid @columns={{2}}>
						<CanonButton
							@text="Swap"
							@icon={{SwapIcon}}
							@onClick={{this.swap}}
						/>
						<CanonButton
							@text="Copy"
							@icon={{CopyIcon}}
							@disabled={{this.copyDisabled}}
							@onClick={{this.copy}}
						/>
					</CanonGrid>
					{{#if this.hasPixels}}
						<CanonRow
							@title="Pixel Density"
							as |titleId|
						>
							<CanonNumberField
								@value={{this.ppi}}
								@min={{1}}
								@max={{10000}}
								@unit="PPI"
								@labelledBy={{titleId}}
								@onChange={{this.setPpi}}
							/>
						</CanonRow>
					{{/if}}
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Category" />
					<CanonSegmented
						aria-label="Category"
						@items={{this.categoryNames}}
						@columns={{3}}
						@selected={{this.categoryIndex}}
						@onChange={{this.pickCategory}}
					/>
				</CanonRows>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Units" />
					{{#each this.rows as |row|}}
						<UnitRow
							@label={{row.label}}
							@symbol={{row.symbol}}
							@value={{row.value}}
							@role={{row.role}}
							@onPick={{fn
								this.tap
								row.index
							}}
						/>
					{{/each}}
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Quick Reference" />
					<CanonTiles @items={{this.reference}} />
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}
