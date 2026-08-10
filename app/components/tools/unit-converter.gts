import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import Icon from 'delphitools-v2/components/icon';
import { Tabs, TabsList, TabsTrigger } from 'delphitools-v2/components/ui/tabs';

export interface Unit {
	name: string;
	symbol: string;
	toBase: (value: number) => number;
	fromBase: (value: number) => number;
}

export interface UnitCategory {
	name: string;
	baseUnit: string;
	units: Record<string, Unit>;
}

export type CategoryKey =
	| 'length'
	| 'weight'
	| 'data'
	| 'temperature'
	| 'speed'
	| 'area'
	| 'volume';

// Unit names, symbols and factors carried over from the Next app, verbatim.
export const UNIT_CATEGORIES: Record<CategoryKey, UnitCategory> = {
	length: {
		name: 'Length',
		baseUnit: 'meter',
		units: {
			meter: {
				name: 'Metre',
				symbol: 'm',
				toBase: (v) => v,
				fromBase: (v) => v,
			},
			kilometer: {
				name: 'Kilometre',
				symbol: 'km',
				toBase: (v) => v * 1000,
				fromBase: (v) => v / 1000,
			},
			centimeter: {
				name: 'Centimetre',
				symbol: 'cm',
				toBase: (v) => v / 100,
				fromBase: (v) => v * 100,
			},
			millimeter: {
				name: 'Millimetre',
				symbol: 'mm',
				toBase: (v) => v / 1000,
				fromBase: (v) => v * 1000,
			},
			mile: {
				name: 'Mile',
				symbol: 'mi',
				toBase: (v) => v * 1609.344,
				fromBase: (v) => v / 1609.344,
			},
			yard: {
				name: 'Yard',
				symbol: 'yd',
				toBase: (v) => v * 0.9144,
				fromBase: (v) => v / 0.9144,
			},
			foot: {
				name: 'Foot',
				symbol: 'ft',
				toBase: (v) => v * 0.3048,
				fromBase: (v) => v / 0.3048,
			},
			inch: {
				name: 'Inch',
				symbol: 'in',
				toBase: (v) => v * 0.0254,
				fromBase: (v) => v / 0.0254,
			},
			nauticalMile: {
				name: 'Nautical Mile',
				symbol: 'nmi',
				toBase: (v) => v * 1852,
				fromBase: (v) => v / 1852,
			},
		},
	},
	weight: {
		name: 'Weight',
		baseUnit: 'kilogram',
		units: {
			kilogram: {
				name: 'Kilogram',
				symbol: 'kg',
				toBase: (v) => v,
				fromBase: (v) => v,
			},
			gram: {
				name: 'Gram',
				symbol: 'g',
				toBase: (v) => v / 1000,
				fromBase: (v) => v * 1000,
			},
			milligram: {
				name: 'Milligram',
				symbol: 'mg',
				toBase: (v) => v / 1000000,
				fromBase: (v) => v * 1000000,
			},
			pound: {
				name: 'Pound',
				symbol: 'lb',
				toBase: (v) => v * 0.453592,
				fromBase: (v) => v / 0.453592,
			},
			ounce: {
				name: 'Ounce',
				symbol: 'oz',
				toBase: (v) => v * 0.0283495,
				fromBase: (v) => v / 0.0283495,
			},
			stone: {
				name: 'Stone',
				symbol: 'st',
				toBase: (v) => v * 6.35029,
				fromBase: (v) => v / 6.35029,
			},
			tonne: {
				name: 'Tonne',
				symbol: 't',
				toBase: (v) => v * 1000,
				fromBase: (v) => v / 1000,
			},
		},
	},
	data: {
		name: 'Data',
		baseUnit: 'byte',
		units: {
			byte: {
				name: 'Byte',
				symbol: 'B',
				toBase: (v) => v,
				fromBase: (v) => v,
			},
			kilobyte: {
				name: 'Kilobyte',
				symbol: 'KB',
				toBase: (v) => v * 1024,
				fromBase: (v) => v / 1024,
			},
			megabyte: {
				name: 'Megabyte',
				symbol: 'MB',
				toBase: (v) => v * 1024 ** 2,
				fromBase: (v) => v / 1024 ** 2,
			},
			gigabyte: {
				name: 'Gigabyte',
				symbol: 'GB',
				toBase: (v) => v * 1024 ** 3,
				fromBase: (v) => v / 1024 ** 3,
			},
			terabyte: {
				name: 'Terabyte',
				symbol: 'TB',
				toBase: (v) => v * 1024 ** 4,
				fromBase: (v) => v / 1024 ** 4,
			},
			petabyte: {
				name: 'Petabyte',
				symbol: 'PB',
				toBase: (v) => v * 1024 ** 5,
				fromBase: (v) => v / 1024 ** 5,
			},
			bit: {
				name: 'Bit',
				symbol: 'b',
				toBase: (v) => v / 8,
				fromBase: (v) => v * 8,
			},
			kilobit: {
				name: 'Kilobit',
				symbol: 'Kb',
				toBase: (v) => (v * 1024) / 8,
				fromBase: (v) => (v * 8) / 1024,
			},
			megabit: {
				name: 'Megabit',
				symbol: 'Mb',
				toBase: (v) => (v * 1024 ** 2) / 8,
				fromBase: (v) => (v * 8) / 1024 ** 2,
			},
			gigabit: {
				name: 'Gigabit',
				symbol: 'Gb',
				toBase: (v) => (v * 1024 ** 3) / 8,
				fromBase: (v) => (v * 8) / 1024 ** 3,
			},
		},
	},
	temperature: {
		name: 'Temp',
		baseUnit: 'celsius',
		units: {
			celsius: {
				name: 'Celsius',
				symbol: '°C',
				toBase: (v) => v,
				fromBase: (v) => v,
			},
			fahrenheit: {
				name: 'Fahrenheit',
				symbol: '°F',
				toBase: (v) => ((v - 32) * 5) / 9,
				fromBase: (v) => (v * 9) / 5 + 32,
			},
			kelvin: {
				name: 'Kelvin',
				symbol: 'K',
				toBase: (v) => v - 273.15,
				fromBase: (v) => v + 273.15,
			},
		},
	},
	speed: {
		name: 'Speed',
		baseUnit: 'mps',
		units: {
			mps: {
				name: 'Metres/sec',
				symbol: 'm/s',
				toBase: (v) => v,
				fromBase: (v) => v,
			},
			kmph: {
				name: 'km/hour',
				symbol: 'km/h',
				toBase: (v) => v / 3.6,
				fromBase: (v) => v * 3.6,
			},
			mph: {
				name: 'Miles/hour',
				symbol: 'mph',
				toBase: (v) => v * 0.44704,
				fromBase: (v) => v / 0.44704,
			},
			knot: {
				name: 'Knot',
				symbol: 'kn',
				toBase: (v) => v * 0.514444,
				fromBase: (v) => v / 0.514444,
			},
			fps: {
				name: 'Feet/sec',
				symbol: 'ft/s',
				toBase: (v) => v * 0.3048,
				fromBase: (v) => v / 0.3048,
			},
		},
	},
	area: {
		name: 'Area',
		baseUnit: 'sqm',
		units: {
			sqm: {
				name: 'Square metre',
				symbol: 'm²',
				toBase: (v) => v,
				fromBase: (v) => v,
			},
			sqkm: {
				name: 'Square km',
				symbol: 'km²',
				toBase: (v) => v * 1000000,
				fromBase: (v) => v / 1000000,
			},
			sqft: {
				name: 'Square foot',
				symbol: 'ft²',
				toBase: (v) => v * 0.092903,
				fromBase: (v) => v / 0.092903,
			},
			sqyd: {
				name: 'Square yard',
				symbol: 'yd²',
				toBase: (v) => v * 0.836127,
				fromBase: (v) => v / 0.836127,
			},
			acre: {
				name: 'Acre',
				symbol: 'ac',
				toBase: (v) => v * 4046.86,
				fromBase: (v) => v / 4046.86,
			},
			hectare: {
				name: 'Hectare',
				symbol: 'ha',
				toBase: (v) => v * 10000,
				fromBase: (v) => v / 10000,
			},
			sqmi: {
				name: 'Square mile',
				symbol: 'mi²',
				toBase: (v) => v * 2589988.11,
				fromBase: (v) => v / 2589988.11,
			},
		},
	},
	volume: {
		name: 'Volume',
		baseUnit: 'liter',
		units: {
			liter: {
				name: 'Litre',
				symbol: 'L',
				toBase: (v) => v,
				fromBase: (v) => v,
			},
			milliliter: {
				name: 'Millilitre',
				symbol: 'mL',
				toBase: (v) => v / 1000,
				fromBase: (v) => v * 1000,
			},
			cubicMeter: {
				name: 'Cubic metre',
				symbol: 'm³',
				toBase: (v) => v * 1000,
				fromBase: (v) => v / 1000,
			},
			gallon: {
				name: 'Gallon (US)',
				symbol: 'gal',
				toBase: (v) => v * 3.78541,
				fromBase: (v) => v / 3.78541,
			},
			gallonUK: {
				name: 'Gallon (UK)',
				symbol: 'gal UK',
				toBase: (v) => v * 4.54609,
				fromBase: (v) => v / 4.54609,
			},
			quart: {
				name: 'Quart (US)',
				symbol: 'qt',
				toBase: (v) => v * 0.946353,
				fromBase: (v) => v / 0.946353,
			},
			pint: {
				name: 'Pint (US)',
				symbol: 'pt',
				toBase: (v) => v * 0.473176,
				fromBase: (v) => v / 0.473176,
			},
			cup: {
				name: 'Cup (US)',
				symbol: 'cup',
				toBase: (v) => v * 0.236588,
				fromBase: (v) => v / 0.236588,
			},
			fluidOz: {
				name: 'Fluid oz (US)',
				symbol: 'fl oz',
				toBase: (v) => v * 0.0295735,
				fromBase: (v) => v / 0.0295735,
			},
		},
	},
};

export const CATEGORY_KEYS = Object.keys(UNIT_CATEGORIES) as CategoryKey[];

const COPIED_MS = 1500;

/** Through the category's base unit. Zero if either unit is not in the category. */
export function convertUnit(
	category: CategoryKey,
	value: number,
	from: string,
	to: string,
): number {
	const units = UNIT_CATEGORIES[category].units;
	const fromDef = units[from];
	const toDef = units[to];
	if (!fromDef || !toDef) return 0;

	return toDef.fromBase(fromDef.toBase(value));
}

/** Every unit in the category, from one reading. Null if the reading is not a number. */
export function conversions(
	category: CategoryKey,
	value: string,
	from: string | null,
): Record<string, number> | null {
	const num = Number.parseFloat(value);
	if (Number.isNaN(num) || !from) return null;

	const results: Record<string, number> = {};
	for (const key of Object.keys(UNIT_CATEGORIES[category].units)) {
		results[key] = convertUnit(category, num, from, key);
	}
	return results;
}

/** Eight significant figures, dropping to exponent form at either extreme. */
export function formatNumber(num: number): string {
	if (num === 0) return '0';
	if (Math.abs(num) < 0.0001 || Math.abs(num) >= 1e9) {
		return num.toExponential(4);
	}
	return Number.parseFloat(num.toPrecision(8)).toString();
}

export default class UnitConverterTool extends Component {
	@tracked category: CategoryKey = 'length';
	@tracked inputUnit: string | null = null;
	@tracked inputValue = '';
	@tracked copied: string | null = null;

	#copiedTimer?: ReturnType<typeof setTimeout>;

	willDestroy() {
		super.willDestroy();
		clearTimeout(this.#copiedTimer);
	}

	get categories() {
		return CATEGORY_KEYS.map((key) => ({
			key,
			name: UNIT_CATEGORIES[key].name,
		}));
	}

	get hasValue() {
		return this.inputValue !== '' && this.inputUnit !== null;
	}

	get rows() {
		const results = conversions(
			this.category,
			this.inputValue,
			this.inputUnit,
		);
		const units = UNIT_CATEGORIES[this.category].units;

		return Object.keys(units).map((key) => {
			const unit = units[key]!;
			const isActive =
				this.inputUnit === key && this.hasValue;
			const converted = results?.[key];
			const display =
				converted === undefined
					? ''
					: formatNumber(converted);

			return {
				key,
				name: unit.name,
				symbol: unit.symbol,
				isActive,
				// The row being typed in keeps the raw text, so a
				// half-written "1." is not rewritten under the caret.
				value: isActive ? this.inputValue : display,
				copyText: display || this.inputValue,
				isEmpty: !display && !this.inputValue,
				isCopied: this.copied === key,
			};
		});
	}

	chooseCategory = (key: string) => {
		this.category = key as CategoryKey;
		this.inputUnit = null;
		this.inputValue = '';
	};

	setUnitValue = (key: string, event: Event) => {
		this.inputUnit = key;
		this.inputValue = (event.target as HTMLInputElement).value;
	};

	copy = async (value: string, key: string) => {
		if (!value) return;
		await navigator.clipboard.writeText(value);
		this.copied = key;
		clearTimeout(this.#copiedTimer);
		this.#copiedTimer = setTimeout(
			() => (this.copied = null),
			COPIED_MS,
		);
	};

	copyRow = (value: string, key: string) => void this.copy(value, key);

	<template>
		<div class="dt-uc">
			<Tabs
				@value={{this.category}}
				@onValueChange={{this.chooseCategory}}
			>
				<TabsList class="dt-uc-tabs">
					{{#each
						this.categories key="key"
						as |option|
					}}
						{{! wording carried over from the Next app }}
						<TabsTrigger
							class="dt-uc-tab"
							@value={{option.key}}
						>{{option.name}}</TabsTrigger>
					{{/each}}
				</TabsList>
			</Tabs>

			<div class="dt-uc-table">
				{{#each this.rows key="key" as |row|}}
					<div
						class="dt-uc-row
							{{if
								row.isActive
								'is-active'
							}}"
					>
						<span class="dt-uc-name">
							<span
								class="dt-uc-unit"
							>{{row.name}}</span>
							<span
								class="dt-uc-symbol"
							>{{row.symbol}}</span>
						</span>
						<input
							type="number"
							class="dt-uc-input"
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
						<button
							type="button"
							class="dt-uc-copy
								{{if
									row.isCopied
									'is-copied'
								}}"
							disabled={{row.isEmpty}}
							aria-label="Copy {{row.name}}"
							{{on
								"click"
								(fn
									this.copyRow
									row.copyText
									row.key
								)
							}}
						>
							<Icon
								@name={{if
									row.isCopied
									"check"
									"copy"
								}}
							/>
						</button>
					</div>
				{{/each}}
			</div>
		</div>
	</template>
}
