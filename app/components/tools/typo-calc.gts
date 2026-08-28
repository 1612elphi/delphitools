import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import Icon from 'delphitools-v2/components/icon';
import {
	Select,
	SelectTrigger,
	SelectValue,
	SelectContent,
	SelectItem,
} from 'delphitools-v2/components/ui/select';

export type Unit =
	'px' | 'pt' | 'pc' | 'ag' | 'cc' | 'in' | 'mm' | 'cm' | 'em' | 'rem';

export interface UnitInfo {
	name: string;
	description: string;
	toPx: (value: number, basePx: number) => number;
	fromPx: (px: number, basePx: number) => number;
}

// css 96px per inch
const PX_PER_INCH = 96;
const PT_PER_INCH = 72;
const PT_PER_PICA = 12;
const AGATES_PER_INCH = 14;
const MM_PER_INCH = 25.4;
const MM_PER_CICERO = 4.512;

export const UNITS: Record<Unit, UnitInfo> = {
	px: {
		name: 'Pixels',
		description: 'Screen pixels (96 per inch)',
		toPx: (v) => v,
		fromPx: (px) => px,
	},
	pt: {
		name: 'Points',
		description: 'Print points (72 per inch)',
		toPx: (v) => v * (PX_PER_INCH / PT_PER_INCH),
		fromPx: (px) => px * (PT_PER_INCH / PX_PER_INCH),
	},
	pc: {
		name: 'Picas',
		description: '12 points per pica',
		toPx: (v) => v * PT_PER_PICA * (PX_PER_INCH / PT_PER_INCH),
		fromPx: (px) =>
			(px / PT_PER_PICA) * (PT_PER_INCH / PX_PER_INCH),
	},
	ag: {
		name: 'Agates',
		description: '14 agates per inch (US newspapers)',
		toPx: (v) => v * (PX_PER_INCH / AGATES_PER_INCH),
		fromPx: (px) => px * (AGATES_PER_INCH / PX_PER_INCH),
	},
	cc: {
		name: 'Ciceros',
		description: 'European unit (≈4.512mm)',
		toPx: (v) => v * MM_PER_CICERO * (PX_PER_INCH / MM_PER_INCH),
		fromPx: (px) =>
			px / (MM_PER_CICERO * (PX_PER_INCH / MM_PER_INCH)),
	},
	in: {
		name: 'Inches',
		description: 'Imperial inch',
		toPx: (v) => v * PX_PER_INCH,
		fromPx: (px) => px / PX_PER_INCH,
	},
	mm: {
		name: 'Millimeters',
		description: 'Metric millimeter',
		toPx: (v) => v * (PX_PER_INCH / MM_PER_INCH),
		fromPx: (px) => px * (MM_PER_INCH / PX_PER_INCH),
	},
	cm: {
		name: 'Centimeters',
		description: 'Metric centimeter',
		toPx: (v) => v * (PX_PER_INCH / (MM_PER_INCH / 10)),
		fromPx: (px) => px * (MM_PER_INCH / 10 / PX_PER_INCH),
	},
	em: {
		name: 'Em',
		description: 'Relative to parent font-size',
		toPx: (v, basePx) => v * basePx,
		fromPx: (px, basePx) => px / basePx,
	},
	rem: {
		name: 'Rem',
		description: 'Relative to root font-size',
		toPx: (v, basePx) => v * basePx,
		fromPx: (px, basePx) => px / basePx,
	},
};

export const UNIT_ORDER: Unit[] = [
	'px',
	'pt',
	'pc',
	'ag',
	'cc',
	'in',
	'mm',
	'cm',
	'em',
	'rem',
];

const QUICK_REF: { label: string; value: string }[] = [
	{ label: '1 inch =', value: '96px / 72pt / 25.4mm' },
	{ label: '1 pica =', value: '12 points' },
	{ label: '1 point =', value: '1/72 inch' },
	{ label: '1 agate =', value: '1/14 inch (≈5.14pt)' },
	{ label: '1 cicero =', value: '12 Didot pts (≈4.512mm)' },
];

const DEFAULT_BASE_PX = 16;

// round-trips small units
export function formatValue(value: number): string {
	const magnitude = Math.abs(value);
	if (magnitude < 0.001) return '0';
	if (magnitude >= 1000) return value.toFixed(2);
	if (magnitude >= 100) return value.toFixed(3);
	if (magnitude >= 10) return value.toFixed(4);
	if (magnitude >= 1) return value.toFixed(5);
	return value.toFixed(6);
}

export default class TypoCalcTool extends Component {
	@tracked inputValue = '16';
	@tracked inputUnit: Unit = 'px';
	@tracked baseFontSize = String(DEFAULT_BASE_PX);

	get basePx() {
		return Number.parseFloat(this.baseFontSize) || DEFAULT_BASE_PX;
	}

	get pxValue() {
		const num = Number.parseFloat(this.inputValue) || 0;
		return UNITS[this.inputUnit].toPx(num, this.basePx);
	}

	get units() {
		return UNIT_ORDER.map((unit) => ({ id: unit }));
	}

	get rows() {
		const px = this.pxValue;
		const basePx = this.basePx;
		return UNIT_ORDER.map((unit) => {
			const info = UNITS[unit];
			const isActive = unit === this.inputUnit;
			return {
				unit,
				name: info.name,
				description: info.description,
				value: formatValue(info.fromPx(px, basePx)),
				isActive,
				rowClass: isActive
					? 'dt-typo-row is-active'
					: 'dt-typo-row',
			};
		});
	}

	get quickRef() {
		return [
			...QUICK_REF,
			{
				label: '1 em/rem =',
				value: `${this.basePx}px (base)`,
			},
		];
	}

	setInputValue = (event: Event) => {
		this.inputValue = (event.target as HTMLInputElement).value;
	};

	setBaseFontSize = (event: Event) => {
		this.baseFontSize = (event.target as HTMLInputElement).value;
	};

	// dropdown re-reads, table converts
	chooseUnit = (id: string) => {
		this.inputUnit = id as Unit;
	};

	swapUnit = (unit: Unit) => {
		this.inputValue = formatValue(
			UNITS[unit].fromPx(this.pxValue, this.basePx),
		);
		this.inputUnit = unit;
	};

	<template>
		<div class="dt-typo">
			<div class="dt-typo-base">
				<div class="dt-typo-base-text">
					<label for="dt-typo-base">Base Font Size</label>
					<p>Used for em and rem calculations</p>
				</div>
				<div class="dt-typo-base-field">
					<input
						id="dt-typo-base"
						type="number"
						value={{this.baseFontSize}}
						{{on
							"input"
							this.setBaseFontSize
						}}
					/>
					<span class="dt-typo-unit">px</span>
				</div>
			</div>

			<div class="dt-typo-from">
				<div class="dt-typo-head">
					<label for="dt-typo-value">Convert From</label>
				</div>
				<div class="dt-typo-from-row">
					<input
						id="dt-typo-value"
						type="number"
						step="any"
						value={{this.inputValue}}
						{{on
							"input"
							this.setInputValue
						}}
					/>
					<div class="dt-typo-picker">
						<Select
							@value={{this.inputUnit}}
							@onValueChange={{this.chooseUnit}}
						>
							<SelectTrigger>
								<SelectValue
								>{{this.inputUnit}}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{{#each
									this.units
									key="id"
									as |unit|
								}}
									<SelectItem
										@value={{unit.id}}
									>{{unit.id}}</SelectItem>
								{{/each}}
							</SelectContent>
						</Select>
					</div>
				</div>
			</div>

			<div class="dt-typo-table">
				<div class="dt-typo-head">
					<span class="dt-typo-heading">Converted
						Values</span>
				</div>
				<div class="dt-typo-rows">
					{{#each this.rows key="unit" as |row|}}
						<button
							type="button"
							class={{row.rowClass}}
							disabled={{row.isActive}}
							{{on
								"click"
								(fn
									this.swapUnit
									row.unit
								)
							}}
						>
							<span
								class="dt-typo-badge"
							>{{row.unit}}</span>
							<span
								class="dt-typo-value"
							>{{row.value}}</span>
							<span
								class="dt-typo-meta"
							>
								<span
									class="dt-typo-name"
								>{{row.name}}</span>
								<span
									class="dt-typo-desc"
								>{{row.description}}</span>
							</span>
							<span
								class="dt-typo-swap"
							>
								<Icon
									@name="arrow-right-left"
								/>
							</span>
						</button>
					{{/each}}
				</div>
			</div>

			<div class="dt-typo-ref">
				<span class="dt-typo-heading">Quick Reference</span>
				<div class="segmented dt-typo-ref-grid">
					{{#each
						this.quickRef key="label"
						as |ref|
					}}
						<div class="dt-typo-ref-cell">
							<span
								class="dt-typo-ref-label"
							>{{ref.label}}</span>
							<span
								class="dt-typo-ref-value"
							>{{ref.value}}</span>
						</div>
					{{/each}}
				</div>
			</div>
		</div>
	</template>
}
