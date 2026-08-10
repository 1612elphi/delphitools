import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { eq } from 'ember-truth-helpers';
import type Owner from '@ember/owner';
import Icon from 'delphitools-v2/components/icon';
import {
	Select,
	SelectTrigger,
	SelectValue,
	SelectContent,
	SelectItem,
} from 'delphitools-v2/components/ui/select';
import {
	Tabs,
	TabsList,
	TabsTrigger,
	TabsContent,
} from 'delphitools-v2/components/ui/tabs';

export type TimeFormat = 'unix' | 'unixMs' | 'iso' | 'rfc822' | 'human';
export type TimeUnit = 'minutes' | 'hours' | 'days' | 'weeks' | 'months';
export type ArithmeticMode = 'add' | 'subtract';

export interface FormatValues {
	unix: string;
	unixMs: string;
	iso: string;
	rfc822: string;
	human: string;
}

// Zone names and labels carried over from the Next app, verbatim.
export const TIMEZONES: { value: string; label: string }[] = [
	{ value: 'UTC', label: 'UTC' },
	{ value: 'America/New_York', label: 'New York' },
	{ value: 'America/Los_Angeles', label: 'Los Angeles' },
	{ value: 'America/Chicago', label: 'Chicago' },
	{ value: 'Europe/London', label: 'London' },
	{ value: 'Europe/Paris', label: 'Paris' },
	{ value: 'Europe/Berlin', label: 'Berlin' },
	{ value: 'Asia/Tokyo', label: 'Tokyo' },
	{ value: 'Asia/Shanghai', label: 'Shanghai' },
	{ value: 'Asia/Kolkata', label: 'Mumbai' },
	{ value: 'Asia/Singapore', label: 'Singapore' },
	{ value: 'Australia/Sydney', label: 'Sydney' },
	{ value: 'Pacific/Auckland', label: 'Auckland' },
];

export const FORMAT_INFO: Record<
	TimeFormat,
	{ name: string; placeholder: string }
> = {
	unix: { name: 'Unix (seconds)', placeholder: '1704067200' },
	unixMs: { name: 'Unix (milliseconds)', placeholder: '1704067200000' },
	iso: { name: 'ISO 8601', placeholder: '2024-01-01T00:00:00.000Z' },
	rfc822: {
		name: 'RFC 822',
		placeholder: 'Mon, 01 Jan 2024 00:00:00 GMT',
	},
	human: { name: 'Date & Time', placeholder: '2024-01-01 00:00:00' },
};

export const FORMATS: TimeFormat[] = [
	'unix',
	'unixMs',
	'iso',
	'rfc822',
	'human',
];

export const UNITS: { value: TimeUnit; label: string }[] = [
	{ value: 'minutes', label: 'Minutes' },
	{ value: 'hours', label: 'Hours' },
	{ value: 'days', label: 'Days' },
	{ value: 'weeks', label: 'Weeks' },
	{ value: 'months', label: 'Months' },
];

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * A month is a flat thirty days here, carried over from the Next app. Calendar
 * month arithmetic would land "31 January + 1 month" somewhere in March.
 */
export const MS_PER_UNIT: Record<TimeUnit, number> = {
	minutes: MINUTE_MS,
	hours: HOUR_MS,
	days: DAY_MS,
	weeks: 7 * DAY_MS,
	months: 30 * DAY_MS,
};

const MAX_ZONES = 6;
const TICK_MS = 1000;
const COPIED_MS = 1500;

const EMPTY_VALUES: FormatValues = {
	unix: '',
	unixMs: '',
	iso: '',
	rfc822: '',
	human: '',
};

const ARITHMETIC_PLACEHOLDER = '2024-01-01 00:00:00';

/** Wording carried over from the Next app. */
const ADD_TIMEZONE_PLACEHOLDER = 'Add timezone...';

function pad(value: number): string {
	return value.toString().padStart(2, '0');
}

/** `2024-01-01 00:00:00` in local time, the shape the human field takes. */
export function toHumanDate(date: Date): string {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * Null for anything that does not parse. The Next app checked only isNaN on the
 * parsed number, so a unix value past the Date range produced an Invalid Date
 * whose toISOString() then threw a RangeError; the getTime() check stops that.
 */
export function parseToDate(value: string, format: TimeFormat): Date | null {
	const trimmed = value.trim();
	if (!trimmed) return null;

	let date: Date;
	switch (format) {
		case 'unix':
		case 'unixMs': {
			const parsed = Number.parseInt(trimmed, 10);
			if (Number.isNaN(parsed)) return null;
			date = new Date(
				format === 'unix' ? parsed * 1000 : parsed,
			);
			break;
		}
		// Date's own parser handles both. RFC 822 is not in the ECMA-262
		// grammar, but every browser engine accepts it, and this tool only
		// ever runs in one.
		case 'iso':
		case 'rfc822':
			date = new Date(trimmed);
			break;
		// Accepts "2024-01-01 00:00:00" as well as the T-separated form.
		case 'human':
			date = new Date(trimmed.replace(' ', 'T'));
			break;
	}

	return Number.isNaN(date.getTime()) ? null : date;
}

export function dateToFormats(date: Date): FormatValues {
	return {
		unix: Math.floor(date.getTime() / 1000).toString(),
		unixMs: date.getTime().toString(),
		iso: date.toISOString(),
		// ECMA-262 fixes toUTCString at "Mon, 01 Jan 2024 00:00:00 GMT",
		// English abbreviations and all, which is the RFC 822 date RSS 2.0
		// asks for with the four-digit year RSS also allows.
		rfc822: date.toUTCString(),
		human: toHumanDate(date),
	};
}

export function formatInTimezone(date: Date, timeZone: string): string {
	try {
		return date.toLocaleString('en-GB', {
			timeZone,
			weekday: 'short',
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: false,
		});
	} catch {
		return date.toLocaleString();
	}
}

export function timezoneOffset(date: Date, timeZone: string): string {
	try {
		const parts = new Intl.DateTimeFormat('en', {
			timeZone,
			timeZoneName: 'shortOffset',
		}).formatToParts(date);
		return (
			parts.find((part) => part.type === 'timeZoneName')
				?.value ?? ''
		);
	} catch {
		return '';
	}
}

/** Wording and thresholds carried over from the Next app, line for line. */
export function relativeTime(date: Date, now: Date): string {
	const difference = date.getTime() - now.getTime();
	const distance = Math.abs(difference);

	const minutes = Math.floor(distance / MINUTE_MS);
	const hours = Math.floor(distance / HOUR_MS);
	const days = Math.floor(distance / DAY_MS);
	const weeks = Math.floor(days / 7);
	const months = Math.floor(days / 30);
	const years = Math.floor(days / 365);

	let value: string;
	if (years > 0) value = `${years} year${years > 1 ? 's' : ''}`;
	else if (months > 0) value = `${months} month${months > 1 ? 's' : ''}`;
	else if (weeks > 0) value = `${weeks} week${weeks > 1 ? 's' : ''}`;
	else if (days > 0) value = `${days} day${days > 1 ? 's' : ''}`;
	else if (hours > 0) value = `${hours} hour${hours > 1 ? 's' : ''}`;
	else if (minutes > 0)
		value = `${minutes} minute${minutes > 1 ? 's' : ''}`;
	else return 'just now';

	return difference < 0 ? `${value} ago` : `in ${value}`;
}

export function shiftDate(
	base: Date,
	amount: number,
	unit: TimeUnit,
	mode: ArithmeticMode,
): Date {
	const direction = mode === 'add' ? 1 : -1;
	return new Date(
		base.getTime() + direction * amount * MS_PER_UNIT[unit],
	);
}

export default class TimeCalcTool extends Component {
	@tracked values: FormatValues = EMPTY_VALUES;
	@tracked activeFormat: TimeFormat | null = null;
	@tracked error: string | null = null;
	@tracked copied: string | null = null;

	@tracked zones: string[] = [
		'UTC',
		'America/New_York',
		'Europe/London',
		'Asia/Tokyo',
	];

	@tracked baseDateTime = '';
	@tracked amountInput = '1';
	@tracked unit: TimeUnit = 'days';
	@tracked mode: ArithmeticMode = 'add';

	@tracked now = new Date();

	#tick: ReturnType<typeof setInterval>;
	#copiedTimer?: ReturnType<typeof setTimeout>;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		this.#tick = setInterval(
			() => (this.now = new Date()),
			TICK_MS,
		);
	}

	willDestroy() {
		super.willDestroy();
		clearInterval(this.#tick);
		clearTimeout(this.#copiedTimer);
	}

	get nowUtc() {
		return formatInTimezone(this.now, 'UTC');
	}

	get nowUnix() {
		return Math.floor(this.now.getTime() / 1000);
	}

	get hasValue() {
		return this.values.unix !== '';
	}

	get formatRows() {
		return FORMATS.map((format) => {
			const value = this.values[format];
			return {
				id: format,
				name: FORMAT_INFO[format].name,
				placeholder: FORMAT_INFO[format].placeholder,
				value,
				isEmpty: value === '',
				isActive:
					this.activeFormat === format &&
					this.hasValue,
				isCopied: this.copied === format,
			};
		});
	}

	/** The parsed instant, for the relative-time line under the table. */
	get currentDate() {
		if (!this.hasValue) return null;
		const ms = Number.parseInt(this.values.unixMs, 10);
		return Number.isNaN(ms) ? null : new Date(ms);
	}

	get relative() {
		const date = this.currentDate;
		return date ? relativeTime(date, this.now) : '';
	}

	get zoneRows() {
		return this.zones.map((zone) => ({
			zone,
			label:
				TIMEZONES.find((entry) => entry.value === zone)
					?.label ?? zone,
			offset: timezoneOffset(this.now, zone),
			time: formatInTimezone(this.now, zone),
		}));
	}

	get canRemoveZone() {
		return this.zones.length > 1;
	}

	get availableZones() {
		return TIMEZONES.filter((tz) => !this.zones.includes(tz.value));
	}

	get addZonePlaceholder() {
		return ADD_TIMEZONE_PLACEHOLDER;
	}

	get units() {
		return UNITS;
	}

	get unitLabel() {
		return (
			UNITS.find((entry) => entry.value === this.unit)
				?.label ?? ''
		);
	}

	get isAdding() {
		return this.mode === 'add';
	}

	get basePlaceholder() {
		return ARITHMETIC_PLACEHOLDER;
	}

	get arithmeticResult() {
		if (!this.baseDateTime) return null;
		const base = parseToDate(this.baseDateTime, 'human');
		if (!base) return null;

		const amount = Number.parseInt(this.amountInput, 10) || 0;
		if (amount === 0) return base;

		const shifted = shiftDate(base, amount, this.unit, this.mode);
		return Number.isNaN(shifted.getTime()) ? null : shifted;
	}

	get resultRows() {
		const result = this.arithmeticResult;
		if (!result) return [];
		const formats = dateToFormats(result);
		return [
			{
				key: 'utc',
				label: 'UTC',
				value: formatInTimezone(result, 'UTC'),
			},
			{
				key: 'iso',
				label: FORMAT_INFO.iso.name,
				value: formats.iso,
			},
			{
				key: 'rfc822',
				label: FORMAT_INFO.rfc822.name,
				value: formats.rfc822,
			},
			{
				key: 'unix',
				label: 'Unix',
				value: formats.unix,
			},
			{
				key: 'relative',
				label: 'Relative',
				value: relativeTime(result, this.now),
			},
		];
	}

	setFormatValue = (format: TimeFormat, event: Event) => {
		const value = (event.target as HTMLInputElement).value;
		this.activeFormat = format;
		this.error = null;

		if (!value.trim()) {
			this.values = EMPTY_VALUES;
			return;
		}

		const date = parseToDate(value, format);
		if (!date) {
			this.error = `Invalid ${FORMAT_INFO[format].name.toLowerCase()}`;
			this.values = { ...this.values, [format]: value };
			return;
		}

		// Every field but the one being typed in. Overwriting that one puts
		// the canonical form under the caret the moment a prefix parses, and
		// the rest of the keystrokes land after it: typing an ISO date gave
		// "2001-01-31T23:00:00.000Z025-08-09T11:45:30Z".
		this.values = { ...dateToFormats(date), [format]: value };
	};

	setNow = () => {
		this.values = dateToFormats(new Date());
	};

	addZone = (zone: string) => {
		if (this.zones.includes(zone) || this.zones.length >= MAX_ZONES)
			return;
		this.zones = [...this.zones, zone];
	};

	removeZone = (zone: string) => {
		if (!this.canRemoveZone) return;
		this.zones = this.zones.filter((entry) => entry !== zone);
	};

	setBaseDateTime = (event: Event) => {
		this.baseDateTime = (event.target as HTMLInputElement).value;
	};

	setBaseToNow = () => {
		this.baseDateTime = toHumanDate(new Date());
	};

	setAmount = (event: Event) => {
		this.amountInput = (event.target as HTMLInputElement).value;
	};

	setUnit = (value: string) => {
		this.unit = value as TimeUnit;
	};

	setMode = (mode: ArithmeticMode) => {
		this.mode = mode;
	};

	copyValue = (value: string, key: string) => void this.copy(value, key);

	async copy(value: string, key: string) {
		if (!value) return;
		await navigator.clipboard.writeText(value);
		this.copied = key;
		clearTimeout(this.#copiedTimer);
		this.#copiedTimer = setTimeout(
			() => (this.copied = null),
			COPIED_MS,
		);
	}

	<template>
		<div class="dt-tc">
			<div class="dt-tc-now">
				<div class="dt-tc-now-head">
					{{! wording carried over from the Next app }}
					<span class="dt-tc-label">Current Time</span>
				</div>
				<div class="dt-tc-now-body">
					<p
						class="dt-tc-clock"
					>{{this.nowUtc}}<span
							class="dt-tc-zone"
						>UTC</span></p>
					<p
						class="dt-tc-epoch"
					>{{this.nowUnix}}</p>
				</div>
			</div>

			<Tabs @defaultValue="convert">
				<TabsList class="dt-tc-tabs">
					<TabsTrigger
						class="dt-tc-tab"
						@value="convert"
					>Convert</TabsTrigger>
					<TabsTrigger
						class="dt-tc-tab"
						@value="timezones"
					>Timezones</TabsTrigger>
					{{! wording carried over from the Next app }}
					<TabsTrigger
						class="dt-tc-tab"
						@value="arithmetic"
					>Date Math</TabsTrigger>
				</TabsList>

				<div class="dt-tc-frame">
					<TabsContent
						class="dt-tc-panel"
						@value="convert"
					>
						<div class="dt-tc-table">
							{{#each
								this.formatRows
								key="id"
								as |row|
							}}
								<div
									class="dt-tc-row
										{{if
											row.isActive
											'is-active'
										}}"
								>
									<label
										class="dt-tc-row-name"
										for="dt-tc-{{row.id}}"
									>{{row.name}}</label>
									<input
										id="dt-tc-{{row.id}}"
										type="text"
										class="dt-tc-input"
										placeholder={{row.placeholder}}
										value={{row.value}}
										{{on
											"input"
											(fn
												this.setFormatValue
												row.id
											)
										}}
									/>
									<button
										type="button"
										class="dt-tc-copy"
										disabled={{row.isEmpty}}
										aria-label="Copy
											{{row.name}}"
										{{on
											"click"
											(fn
												this.copyValue
												row.value
												row.id
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

						{{#if this.error}}
							<p
								class="dt-tc-error"
							>{{this.error}}</p>
						{{/if}}

						{{! wording carried over from the Next app }}
						<button
							type="button"
							class="dt-tc-wide"
							{{on
								"click"
								this.setNow
							}}
						>Use Current Time</button>

						{{#if this.currentDate}}
							<div
								class="dt-tc-relative"
							>
								{{! wording carried over from the Next app }}
								<span
									class="dt-tc-label"
								>Relative</span>
								<p
									class="dt-tc-relative-value"
								>{{this.relative}}</p>
							</div>
						{{/if}}
					</TabsContent>

					<TabsContent
						class="dt-tc-panel"
						@value="timezones"
					>
						<div class="dt-tc-section">
							{{! wording carried over from the Next app }}
							<span
								class="dt-tc-label"
							>Add Timezone</span>
							<div
								class="dt-tc-select"
							>
								<Select
									@value=""
									@onValueChange={{this.addZone}}
								>
									<SelectTrigger
									>
										<SelectValue
											@placeholder={{this.addZonePlaceholder}}
										/>
									</SelectTrigger>
									<SelectContent
									>
										{{#each
											this.availableZones
											key="value"
											as |tz|
										}}
											<SelectItem
												@value={{tz.value}}
											>{{tz.label}}</SelectItem>
										{{/each}}
									</SelectContent>
								</Select>
							</div>
						</div>

						<div class="dt-tc-table">
							{{#each
								this.zoneRows
								key="zone"
								as |row|
							}}
								<div
									class="dt-tc-row"
								>
									<span
										class="dt-tc-zone-cell"
									>
										<span
											class="dt-tc-zone-head"
										>
											<span
												class="dt-tc-zone-name"
											>{{row.label}}</span>
											<span
												class="dt-tc-zone-offset"
											>{{row.offset}}</span>
										</span>
										<span
											class="dt-tc-zone-time"
										>{{row.time}}</span>
									</span>
									{{#if
										this.canRemoveZone
									}}
										<button
											type="button"
											class="dt-tc-copy"
											aria-label="Remove
												{{row.label}}"
											{{on
												"click"
												(fn
													this.removeZone
													row.zone
												)
											}}
										>
											<Icon
												@name="x"
											/>
										</button>
									{{/if}}
								</div>
							{{/each}}
						</div>

						{{! wording carried over from the Next app }}
						<p class="dt-tc-note">Times
							update live. Add up to 6
							timezones.</p>
					</TabsContent>

					<TabsContent
						class="dt-tc-panel"
						@value="arithmetic"
					>
						<div class="dt-tc-section">
							{{! wording carried over from the Next app }}
							<label
								class="dt-tc-label"
								for="dt-tc-base"
							>Starting Date & Time</label>
							<div
								class="dt-tc-combo"
							>
								<input
									id="dt-tc-base"
									type="text"
									class="dt-tc-input"
									placeholder={{this.basePlaceholder}}
									value={{this.baseDateTime}}
									{{on
										"input"
										this.setBaseDateTime
									}}
								/>
								<button
									type="button"
									class="dt-tc-now-btn"
									{{on
										"click"
										this.setBaseToNow
									}}
								>Now</button>
							</div>
						</div>

						<div class="dt-tc-section">
							{{! wording carried over from the Next app }}
							<span
								class="dt-tc-label"
							>Operation</span>
							<div
								class="segmented dt-tc-modes"
							>
								<button
									type="button"
									class="dt-tc-mode
										{{if
											this.isAdding
											'is-active'
										}}"
									{{on
										"click"
										(fn
											this.setMode
											"add"
										)
									}}
								>
									<Icon
										@name="plus"
									/>
									Add
								</button>
								<button
									type="button"
									class="dt-tc-mode
										{{unless
											this.isAdding
											'is-active'
										}}"
									{{on
										"click"
										(fn
											this.setMode
											"subtract"
										)
									}}
								>
									<Icon
										@name="minus"
									/>
									Subtract
								</button>
							</div>
						</div>

						<div class="dt-tc-section">
							{{! wording carried over from the Next app }}
							<label
								class="dt-tc-label"
								for="dt-tc-amount"
							>Amount</label>
							<div
								class="dt-tc-combo"
							>
								<input
									id="dt-tc-amount"
									type="number"
									min="0"
									class="dt-tc-input is-amount"
									value={{this.amountInput}}
									{{on
										"input"
										this.setAmount
									}}
								/>
								<div
									class="dt-tc-unit"
								>
									<Select
										@value={{this.unit}}
										@onValueChange={{this.setUnit}}
									>
										<SelectTrigger
										>
											<SelectValue
											>{{this.unitLabel}}</SelectValue>
										</SelectTrigger>
										<SelectContent
										>
											{{#each
												this.units
												key="value"
												as |option|
											}}
												<SelectItem
													@value={{option.value}}
												>{{option.label}}</SelectItem>
											{{/each}}
										</SelectContent>
									</Select>
								</div>
							</div>
						</div>

						{{#if this.resultRows}}
							<div
								class="dt-tc-results"
							>
								<div
									class="dt-tc-results-head"
								>
									{{! wording carried over from the Next app }}
									<span
										class="dt-tc-label"
									>Result</span>
								</div>
								{{#each
									this.resultRows
									key="key"
									as |row|
								}}
									<div
										class="dt-tc-row"
									>
										<span
											class="dt-tc-result-name"
										>{{row.label}}</span>
										<span
											class="dt-tc-result-value
												{{unless
													(eq
														row.key
														'relative'
													)
													'is-mono'
												}}"
										>{{row.value}}</span>
									</div>
								{{/each}}
							</div>
						{{/if}}
					</TabsContent>
				</div>
			</Tabs>
		</div>
	</template>
}
