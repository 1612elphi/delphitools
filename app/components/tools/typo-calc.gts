import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import type Owner from '@ember/owner';
import CanonBigNumberField from 'delphicanon/components/canon-big-number-field';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonDecimalField from 'delphicanon/components/canon-decimal-field';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonTiles from 'delphicanon/components/canon-tiles';
import { clamp, parseDecimal } from 'delphicanon/lib/number';
import Gauge, {
	gaugeHeight,
} from 'delphitools-v2/components/tools/typo-calc/gauge';
import {
	CSS_PPI,
	UNITS,
	UNIT_ORDER,
	formatValue,
	isUnit,
	nudged,
	type Unit,
} from 'delphitools-v2/components/tools/typo-calc/units';
import './typo-calc/typo-calc.css';

const baseRange = { min: 1, max: 200 };
const ppiRange = { min: 1, max: 2400 };
const ppiPresets = [72, 96, 150, 300];
const canvasHeight = gaugeHeight + 4;

export default class TypoCalcTool extends Component {
	@tracked inputValue = '16';
	@tracked inputUnit: Unit = 'px';
	@tracked basePx = 16;
	@tracked ppi = CSS_PPI;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		const value = query.get('typoValue');
		if (value !== null) this.setValue(value);
		const unit = query.get('typoUnit');
		if (isUnit(unit)) this.inputUnit = unit;
		const base = parseDecimal(query.get('typoBase') ?? '');
		if (base !== undefined)
			this.basePx = clamp(base, baseRange.min, baseRange.max);
		const ppi = parseDecimal(query.get('typoPPI') ?? '');
		if (ppi !== undefined)
			this.ppi = clamp(ppi, ppiRange.min, ppiRange.max);
	}

	get typed() {
		return parseDecimal(this.inputValue);
	}

	get pxValue() {
		return UNITS[this.inputUnit].toPx(
			this.typed ?? 0,
			this.basePx,
			this.ppi,
		);
	}

	valueIn(unit: Unit) {
		return UNITS[unit].fromPx(this.pxValue, this.basePx, this.ppi);
	}

	get unitIndex() {
		return UNIT_ORDER.indexOf(this.inputUnit);
	}

	get ppiText() {
		return formatValue(this.ppi);
	}

	get rows() {
		return UNIT_ORDER.map((unit) => {
			const info = UNITS[unit];
			return {
				unit,
				name: info.name,
				detail:
					unit === 'px' && this.ppi !== CSS_PPI
						? `${this.ppiText} ppi`
						: info.description,
				value: formatValue(this.valueIn(unit)),
				input: unit === this.inputUnit,
			};
		});
	}

	get presets() {
		return ppiPresets.map((value) => ({
			value,
			text: String(value),
			selected: value === this.ppi,
		}));
	}

	get reference() {
		const base = formatValue(this.basePx);
		return [
			{
				label: '1 in',
				value: `${this.ppiText} px · 72 pt · 25.4 mm`,
			},
			{ label: '1 pc', value: '12 pt · 1/6 in' },
			{ label: '1 pt', value: '1/72 in' },
			{ label: '1 ag', value: '1/14 in · 5.14 pt' },
			{ label: '1 cc', value: '12 Didot pt · 4.512 mm' },
			{ label: '1 em · rem', value: `${base} px` },
		];
	}

	setValue(text: string) {
		this.inputValue = text;
	}

	type = (text: string) => (this.inputValue = text);

	nudge = (direction: -1 | 1) =>
		this.setValue(
			formatValue(
				nudged(this.typed, this.inputUnit, direction),
			),
		);

	selectAll = (event: FocusEvent) => {
		const field = event.target;
		if (field instanceof HTMLInputElement)
			requestAnimationFrame(() => field.select());
	};

	pickUnit = (index: number) => (this.inputUnit = UNIT_ORDER[index]!);

	convert = (unit: Unit) => {
		if (unit === this.inputUnit) return;
		this.setValue(formatValue(this.valueIn(unit)));
		this.inputUnit = unit;
	};

	pickBase = (value: number) => (this.basePx = value);

	usePPI = (value: number) =>
		(this.ppi = clamp(value, ppiRange.min, ppiRange.max));

	<template>
		<CanonSplit class="typo-calc">
			<:banner>
				<CanonCanvas @height={{canvasHeight}}>
					<Gauge
						@px={{this.pxValue}}
						@base={{this.basePx}}
						@ppi={{this.ppi}}
						@unit={{this.inputUnit}}
					/>
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<CanonRows @framed={{true}}>
					<CanonBigNumberField
						@value={{this.inputValue}}
						@placeholder="0"
						@unit={{upper this.inputUnit}}
						@label="Convert From"
						@onStep={{this.nudge}}
						@onInput={{this.type}}
						{{on "focusin" this.selectAll}}
					/>
					<CanonSegmented
						aria-label="Unit"
						@items={{UNIT_ORDER}}
						@columns={{5}}
						@selected={{this.unitIndex}}
						@onChange={{this.pickUnit}}
					/>
					<CanonRow
						@title="Base Font Size"
						@detail="Used for em and rem"
						@form="stacked"
						as |titleId|
					>
						<CanonDecimalField
							@value={{this.basePx}}
							@min={{baseRange.min}}
							@max={{baseRange.max}}
							@unit="px"
							@step={{1}}
							@decimals={{2}}
							@labelledBy={{titleId}}
							@onChange={{this.pickBase}}
						/>
					</CanonRow>
					<CanonRow
						@title="Resolution"
						@form="stacked"
						as |titleId|
					>
						<CanonDecimalField
							@value={{this.ppi}}
							@min={{ppiRange.min}}
							@max={{ppiRange.max}}
							@unit="ppi"
							@step={{1}}
							@decimals={{0}}
							@labelledBy={{titleId}}
							@onChange={{this.usePPI}}
						/>
					</CanonRow>
					<CanonGrid @columns={{4}}>
						{{#each
							this.presets key="value"
							as |preset|
						}}
							<CanonButton
								@kind="segment"
								@text={{preset.text}}
								@label="{{preset.text}} ppi"
								@selected={{preset.selected}}
								@onClick={{fn
									this.usePPI
									preset.value
								}}
							/>
						{{/each}}
					</CanonGrid>
				</CanonRows>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonHeading
						@text="Converted Values"
					/>
					{{#each this.rows key="unit" as |row|}}
						<button
							type="button"
							class="typo-row"
							aria-label="{{row.name}}, {{row.value}} {{row.unit}}"
							aria-current={{if
								row.input
								"true"
							}}
							{{on
								"click"
								(fn
									this.convert
									row.unit
								)
							}}
						>
							<span
								class="typo-row-symbol"
							>{{row.unit}}</span>
							<span
								class="typo-row-names"
							>
								<span
									class="typo-row-name"
								>{{row.name}}</span>
								<span
									class="typo-row-detail"
								>{{row.detail}}</span>
							</span>
							<span
								class="typo-row-value"
							>{{row.value}}</span>
						</button>
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

function upper(text: string) {
	return text.toUpperCase();
}
