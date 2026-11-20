import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import type Owner from '@ember/owner';
import CanonBar from 'delphicanon/components/canon-bar';
import CanonBigNumberField from 'delphicanon/components/canon-big-number-field';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import press from 'delphicanon/modifiers/canon-press';
import {
	STUPID_CATEGORIES,
	convertStupid,
	formatStupid,
	type StupidCategory,
} from 'delphitools-v2/lib/stupid-units';
import './stupid-units/stupid-units.css';

const categoryNames = STUPID_CATEGORIES.map((c) => c.name);

const middle = (category: StupidCategory) =>
	Math.floor(category.units.length / 2);

function launchFlags(search: string) {
	const query = new URLSearchParams(search);
	const category =
		STUPID_CATEGORIES.find(
			(c) => c.key === query.get('suCategory'),
		) ?? STUPID_CATEGORIES[0]!;
	const unit = category.units.findIndex(
		(u) => u.key === (query.get('suUnit') ?? 'banana'),
	);
	return {
		category,
		unit: unit < 0 ? middle(category) : unit,
		value: query.get('suValue') ?? '1',
	};
}

export default class StupidUnits extends Component {
	@tracked category: StupidCategory;
	@tracked fromIndex: number;
	@tracked text: string;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const flags = launchFlags(window.location.search);
		this.category = flags.category;
		this.fromIndex = flags.unit;
		this.text = flags.value;
	}

	get categoryIndex() {
		return STUPID_CATEGORIES.indexOf(this.category);
	}

	get from() {
		return this.category.units[this.fromIndex]!;
	}

	get amount() {
		const value = Number.parseFloat(this.text.replace(',', '.'));
		return Number.isFinite(value) ? value : undefined;
	}

	get rows() {
		const { category, amount, from } = this;
		const { units, symbol } = category;
		// ponytail: bar is the unit's log size, not the count; counts span 40 decades
		const lo = Math.log10(units[0]!.factor);
		const hi = Math.log10(units[units.length - 1]!.factor);
		const span = hi - lo || 1;
		return units.map((unit, index) => {
			const value =
				amount === undefined
					? '—'
					: formatStupid(
							convertStupid(
								amount,
								from,
								unit,
							),
						);
			return {
				index,
				name: unit.name,
				base: `${formatStupid(unit.factor)} ${symbol}`.trim(),
				share: (Math.log10(unit.factor) - lo) / span,
				value,
				lit: index === this.fromIndex,
			};
		});
	}

	pickCategory = (index: number) => {
		const category = STUPID_CATEGORIES[index];
		if (!category || category === this.category) return;
		this.category = category;
		this.fromIndex = middle(category);
	};

	pickUnit = (index: number) => {
		if (index === this.fromIndex) return;
		const { amount } = this;
		const unit = this.category.units[index]!;
		if (amount !== undefined)
			this.text = formatStupid(
				convertStupid(amount, this.from, unit),
			).replaceAll(',', '');
		this.fromIndex = index;
	};

	typed = (text: string) => (this.text = text);

	step = (direction: -1 | 1) => {
		const current = this.amount ?? 0;
		const size = current !== 0 && Math.abs(current) < 1 ? 0.1 : 1;
		const next = (Math.round(current / size) + direction) * size;
		this.text = String(Math.max(0, Number(next.toFixed(10))));
	};

	selectAll = (event: FocusEvent) => {
		const field = event.target;
		if (field instanceof HTMLInputElement)
			requestAnimationFrame(() => field.select());
	};

	<template>
		<CanonSplit class="stupid-units">
			<:sidebar>
				<CanonRows @framed={{true}}>
					<CanonBigNumberField
						class="stupid-units-value"
						@value={{this.text}}
						@placeholder="0"
						@unit={{this.from.name}}
						@label="Value"
						@onStep={{this.step}}
						@onInput={{this.typed}}
						{{on "focusin" this.selectAll}}
					/>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Category" />
					<CanonSegmented
						@items={{categoryNames}}
						@selected={{this.categoryIndex}}
						@columns={{2}}
						@onChange={{this.pickCategory}}
					/>
				</CanonRows>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonHeading
						@text={{this.category.name}}
					/>
					{{#each this.rows key="index" as |row|}}
						<button
							type="button"
							class="stupid-units-row
								{{if
									row.lit
									'stupid-units-row--lit'
								}}"
							aria-pressed={{if
								row.lit
								"true"
								"false"
							}}
							aria-label="{{row.name}}, {{row.value}}"
							{{press}}
							{{on
								"click"
								(fn
									this.pickUnit
									row.index
								)
							}}
						>
							<span
								class="stupid-units-name"
							>
								<span
									class="stupid-units-unit"
								>{{row.name}}</span>
								<span
									class="stupid-units-base"
								>{{row.base}}</span>
							</span>
							<CanonBar
								class="stupid-units-bar"
								@share={{row.share}}
							/>
							<span
								class="stupid-units-amount"
							>{{row.value}}</span>
						</button>
					{{/each}}
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}
