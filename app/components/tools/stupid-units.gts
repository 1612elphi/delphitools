import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { htmlSafe } from '@ember/template';
import { Tabs, TabsList, TabsTrigger } from 'delphitools-v2/components/ui/tabs';
import {
	STUPID_CATEGORIES,
	convertStupid,
	formatStupid,
	type StupidCategory,
	type StupidUnit,
} from 'delphitools-v2/lib/stupid-units';

export default class StupidUnitsTool extends Component {
	@tracked category: StupidCategory = STUPID_CATEGORIES[0]!;
	@tracked inputUnit: StupidUnit | null = null;
	@tracked inputValue = '';

	get rows() {
		const { category, inputUnit, inputValue } = this;
		const amount = Number.parseFloat(inputValue);
		const hasValue = inputUnit !== null && Number.isFinite(amount);
		const { units, symbol } = category;
		// ponytail: bar is the unit's log size, not the count; counts span 40 decades
		const lo = Math.log10(units[0]!.factor);
		const hi = Math.log10(units[units.length - 1]!.factor);
		const span = hi - lo || 1;

		return units.map((unit) => {
			const isActive = unit === inputUnit;
			return {
				key: unit.key,
				name: unit.name,
				base: `${formatStupid(unit.factor)} ${symbol}`.trim(),
				style: htmlSafe(
					`width: ${((Math.log10(unit.factor) - lo) / span) * 100}%`,
				),
				isActive,
				value: isActive
					? inputValue
					: hasValue
						? formatStupid(
								convertStupid(
									amount,
									inputUnit,
									unit,
								),
							)
						: '',
			};
		});
	}

	chooseCategory = (key: string) => {
		this.category =
			STUPID_CATEGORIES.find((c) => c.key === key) ??
			this.category;
		this.inputUnit = null;
		this.inputValue = '';
	};

	setUnitValue = (key: string, event: Event) => {
		this.inputUnit =
			this.category.units.find((u) => u.key === key) ?? null;
		this.inputValue = (event.target as HTMLInputElement).value;
	};

	<template>
		<div class="dt-su">
			<Tabs
				@value={{this.category.key}}
				@onValueChange={{this.chooseCategory}}
			>
				<TabsList class="dt-su-tabs">
					{{#each
						STUPID_CATEGORIES key="key"
						as |option|
					}}
						<TabsTrigger
							class="dt-su-tab"
							@value={{option.key}}
						>
							{{option.name}}
						</TabsTrigger>
					{{/each}}
				</TabsList>
			</Tabs>

			<div class="dt-su-table">
				{{#each this.rows key="key" as |row|}}
					<div
						class="dt-su-row
							{{if
								row.isActive
								'is-active'
							}}"
					>
						<span class="dt-su-name">
							<span
								class="dt-su-unit"
							>{{row.name}}</span>
							<span
								class="dt-su-base"
							>{{row.base}}</span>
						</span>
						<span
							class="dt-su-bar"
							aria-hidden="true"
						>
							<span
								class="dt-su-fill"
								style={{row.style}}
							></span>
						</span>
						<input
							type="text"
							inputmode="decimal"
							class="dt-su-input"
							value={{row.value}}
							placeholder="0"
							aria-label={{row.name}}
							{{on
								"input"
								(fn
									this.setUnitValue
									row.key
								)
							}}
						/>
					</div>
				{{/each}}
			</div>
		</div>
	</template>
}
