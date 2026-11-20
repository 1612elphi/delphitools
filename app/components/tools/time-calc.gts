import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import type Owner from '@ember/owner';
import { modifier } from 'ember-modifier';
import CanonBigNumberField from 'delphicanon/components/canon-big-number-field';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonMenuCell from 'delphicanon/components/canon-menu-cell';
import CanonNumberField from 'delphicanon/components/canon-number-field';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonTiles from 'delphicanon/components/canon-tiles';
import CanonValueLine from 'delphicanon/components/canon-value-line';
import { IconSvg } from 'delphitools-v2/components/icon';
import Picture from 'delphitools-v2/components/tools/time-calc/picture';
import ZoneCell from 'delphitools-v2/components/tools/time-calc/zone-cell';
import {
	bandHeight,
	type Scene,
} from 'delphitools-v2/components/tools/time-calc/draw';
import {
	breakdown,
	city,
	detail,
	difference,
	formatNames,
	formats,
	full,
	knownZone,
	localZone,
	medium,
	offsets,
	pickerValue,
	read,
	relativeTime,
	rewrite,
	shift,
	title,
	units,
	type Unit,
} from 'delphitools-v2/components/tools/time-calc/time';
import './time-calc/time-calc.css';

type Mode = 'timestamp' | 'arithmetic' | 'timezone';

const modes: Mode[] = ['timestamp', 'arithmetic', 'timezone'];
const modeNames = ['Timestamp', 'Arithmetic', 'Timezone'];
const operations = ['Add', 'Subtract'];
const unitNames = units.map((u) => u.label);
const dash = '—';
const maxZones = 6;
const addZonePlaceholder = 'Add timezone...';
const FRAME_MS = 50;

function refitMs() {
	const value = getComputedStyle(document.documentElement)
		.getPropertyValue('--canon-canvas-refit')
		.trim();
	const time = parseFloat(value);
	if (!Number.isFinite(time)) return 300;
	return value.endsWith('ms') ? time : time * 1000;
}

const ClockIcon = <template><IconSvg @name="clock" /></template>;
const PasteIcon = <template><IconSvg @name="clipboard-paste" /></template>;
const CalendarIcon = <template><IconSvg @name="calendar-clock" /></template>;
const SwapIcon = <template><IconSvg @name="arrow-up-down" /></template>;
const RemoveIcon = <template><IconSvg @name="x" /></template>;

function selectAll(event: FocusEvent) {
	const field = event.target;
	if (field instanceof HTMLInputElement)
		requestAnimationFrame(() => field.select());
}

let measureContext: CanvasRenderingContext2D | null | undefined;

const fit = modifier((element: HTMLElement, [text]: [string]) => {
	const input = element.querySelector('input');
	if (!input) return;
	const place = () => {
		input.style.fontSize = '';
		const style = getComputedStyle(input);
		measureContext ??= document
			.createElement('canvas')
			.getContext('2d');
		if (!measureContext) return;
		measureContext.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
		const width = measureContext.measureText(
			text || input.placeholder,
		).width;
		const room = input.clientWidth - 4;
		const base = parseFloat(style.fontSize);
		if (width > room && room > 0)
			input.style.fontSize = `${Math.max(14, Math.floor((base * room) / width))}px`;
	};
	place();
	void document.fonts?.ready.then(place);
	const observer = new ResizeObserver(place);
	observer.observe(input);
	return () => observer.disconnect();
});

const capture = modifier<{
	Element: HTMLInputElement;
	Args: { Positional: [(node: HTMLInputElement) => void] };
}>((node, [keep]) => {
	keep(node);
});

function openPicker(input?: HTMLInputElement) {
	if (!input) return;
	try {
		input.showPicker();
	} catch {
		input.focus();
	}
}

function fromPicker(value: string) {
	const text = value.replace('T', ' ');
	return text.length === 16 ? `${text}:00` : text;
}

const decimal = (value: number, places: number) =>
	value.toLocaleString(undefined, { maximumFractionDigits: places });

export default class TimeCalc extends Component {
	@tracked mode: Mode = 'timestamp';
	@tracked live = true;
	@tracked text = '';
	@tracked now = new Date();
	@tracked fromZone = localZone;
	@tracked toZone = 'UTC';
	@tracked zones = [
		'UTC',
		'America/New_York',
		'Europe/London',
		'Asia/Tokyo',
	];
	@tracked amount = 1;
	@tracked unit: Unit = 'weeks';
	@tracked subtracts = false;
	@tracked endPicked?: Date;
	@tracked width = 0;
	@tracked refitting = false;
	fieldPicker?: HTMLInputElement;
	endPicker?: HTMLInputElement;
	#clock?: ReturnType<typeof setInterval>;
	#refit?: ReturnType<typeof setTimeout>;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		const mode = query.get('timeMode')?.toLowerCase() as Mode;
		if (modes.includes(mode)) this.mode = mode;
		const zone = (key: string) => {
			const value = query.get(key);
			return value && knownZone(value) ? value : undefined;
		};
		this.fromZone = zone('timeFrom') ?? localZone;
		this.toZone = zone('timeTo') ?? 'UTC';
		const typed =
			query.get('timeEpoch') ??
			query.get('timeStart') ??
			query.get('timeZoneDate');
		if (typed !== null) {
			this.text = typed;
			this.live = false;
		}
		const end = query.get('timeEnd');
		if (end) this.endPicked = read(end)?.date;
		const stopped = read(query.get('timeNow') ?? '')?.date;
		if (stopped) this.now = stopped;
		else
			this.#clock = setInterval(
				() => (this.now = new Date()),
				1000,
			);
	}

	willDestroy() {
		super.willDestroy();
		clearInterval(this.#clock);
		clearTimeout(this.#refit);
	}

	get modeNames() {
		return modeNames;
	}

	get modeIndex() {
		return modes.indexOf(this.mode);
	}

	get isTimestamp() {
		return this.mode === 'timestamp';
	}

	get isArithmetic() {
		return this.mode === 'arithmetic';
	}

	get isTimezone() {
		return this.mode === 'timezone';
	}

	get readZone() {
		return this.isTimezone ? this.fromZone : localZone;
	}

	get fieldText() {
		return this.live
			? String(Math.floor(this.now.getTime() / 1000))
			: this.text;
	}

	get reading() {
		return read(this.fieldText, this.readZone);
	}

	get instant() {
		return this.reading?.date;
	}

	get invalid() {
		return !this.reading && this.fieldText.trim() !== '';
	}

	get fieldLabel() {
		return this.isArithmetic
			? 'Start Date'
			: this.isTimezone
				? 'Date & Time'
				: 'Timestamp';
	}

	get fieldUnit() {
		const { reading } = this;
		if (!reading) return this.isArithmetic ? 'Start Date' : '';
		const name = formatNames[reading.format];
		if (this.isArithmetic) return `Start Date · ${name}`;
		if (this.isTimezone && reading.floating)
			return `${name} · ${city(this.fromZone)}`;
		return name;
	}

	get fieldPickerValue() {
		return pickerValue(this.instant ?? this.now, this.readZone);
	}

	get end() {
		const { instant } = this;
		if (this.endPicked) return this.endPicked;
		if (!instant) return undefined;
		return shift(
			instant,
			this.subtracts ? -this.amount : this.amount,
			this.unit,
		);
	}

	get endText() {
		return this.end ? medium(this.end) : dash;
	}

	get endPickerValue() {
		return pickerValue(this.end ?? this.now);
	}

	get scene(): Scene {
		const { instant, now } = this;
		if (this.isArithmetic)
			return {
				kind: 'span',
				a: instant ?? now,
				b: this.end ?? now,
				blank: !instant,
			};
		if (this.isTimezone)
			return {
				kind: 'zones',
				instant: instant ?? now,
				from: this.fromZone,
				to: this.toZone,
			};
		return { kind: 'epoch', date: instant };
	}

	get bandHeight() {
		return bandHeight(
			this.scene.kind,
			this.width,
			window.innerHeight,
		);
	}

	get stampLines() {
		const { instant, now } = this;
		const values = instant ? formats(instant) : undefined;
		return [
			{
				label: 'Local Time',
				value: instant && full(instant),
			},
			{
				label: 'UTC',
				value: instant && full(instant, 'UTC'),
			},
			{ label: formatNames.iso, value: values?.iso },
			{ label: formatNames.rfc822, value: values?.rfc822 },
			{ label: formatNames.unix, value: values?.unix },
			{ label: formatNames.unixMs, value: values?.unixMs },
			{ label: formatNames.human, value: values?.human },
			{
				label: 'Relative',
				value: instant && relativeTime(instant, now),
			},
		];
	}

	get spanTiles() {
		const { instant, end } = this;
		if (!instant || !end)
			return ['Difference', 'Total Days', 'Total Hours'].map(
				(label) => ({ label, value: dash }),
			);
		const seconds =
			Math.abs(end.getTime() - instant.getTime()) / 1000;
		return [
			{
				label: 'Difference',
				value: breakdown(difference(instant, end)),
			},
			{
				label: 'Total Days',
				value: decimal(seconds / 86_400, 2),
			},
			{
				label: 'Total Hours',
				value: decimal(seconds / 3600, 1),
			},
		];
	}

	get endLines() {
		const { end, now } = this;
		const values = end ? formats(end) : undefined;
		return [
			{ label: 'UTC', value: end && full(end, 'UTC') },
			{ label: formatNames.iso, value: values?.iso },
			{ label: formatNames.rfc822, value: values?.rfc822 },
			{ label: 'Unix', value: values?.unix },
			{
				label: 'Relative',
				value: end && relativeTime(end, now),
			},
		];
	}

	get shownInstant() {
		return this.instant ?? this.now;
	}

	get fromDetail() {
		return detail(this.fromZone, this.shownInstant);
	}

	get toDetail() {
		return detail(this.toZone, this.shownInstant);
	}

	get zoneLines() {
		const { instant } = this;
		return [this.fromZone, this.toZone].map((zone) => ({
			label: title(zone, this.shownInstant),
			value: instant && full(instant, zone),
		}));
	}

	get extraZones() {
		const { instant } = this;
		return this.zones.map((zone) => ({
			zone,
			label: title(zone, this.shownInstant),
			value: instant && full(instant, zone),
			remove: `Remove ${city(zone)}`,
		}));
	}

	get zonesFull() {
		return this.zones.length >= maxZones;
	}

	get addZonePlaceholder() {
		return addZonePlaceholder;
	}

	get unitNames() {
		return unitNames;
	}

	get unitIndex() {
		return units.findIndex((u) => u.value === this.unit);
	}

	get operations() {
		return operations;
	}

	get offsets() {
		return offsets;
	}

	setWidth = (width: number) => {
		if (width !== this.width) this.width = width;
	};

	pickMode = (index: number) => {
		this.mode = modes[index] ?? 'timestamp';
		this.refitting = true;
		clearTimeout(this.#refit);
		this.#refit = setTimeout(
			() => (this.refitting = false),
			refitMs() + FRAME_MS,
		);
	};

	focusField = (event: FocusEvent) => {
		if (this.live) {
			this.text = this.fieldText;
			this.live = false;
		}
		selectAll(event);
	};

	type = (text: string) => {
		this.text = text;
		this.live = false;
	};

	step = (direction: -1 | 1) => {
		const { reading } = this;
		const base = reading
			? reading.format === 'unix'
				? Math.floor(reading.date.getTime() / 1000) *
					1000
				: reading.date.getTime()
			: Math.floor(this.now.getTime() / 1000) * 1000;
		const date = new Date(base + direction * 1000);
		this.text = reading
			? rewrite(date, reading, this.readZone)
			: String(date.getTime() / 1000);
		this.live = false;
	};

	fillNow = () => (this.live = true);

	paste = async () => {
		try {
			const text = (
				await navigator.clipboard.readText()
			).trim();
			if (text) this.type(text);
		} catch {
			// clipboard refused: nothing to paste
		}
	};

	keepFieldPicker = (input: HTMLInputElement) =>
		(this.fieldPicker = input);
	keepEndPicker = (input: HTMLInputElement) => (this.endPicker = input);
	openFieldPicker = () => openPicker(this.fieldPicker);
	openEndPicker = () => openPicker(this.endPicker);

	pickField = (event: Event) => {
		const { value } = event.target as HTMLInputElement;
		if (value) this.type(fromPicker(value));
	};

	pickEnd = (event: Event) => {
		const { value } = event.target as HTMLInputElement;
		const date = value ? read(fromPicker(value))?.date : undefined;
		if (date) this.endPicked = date;
	};

	endNow = () => (this.endPicked = new Date(this.now.getTime()));

	applyOffset = (offset: { unit: Unit; amount: number }) => {
		this.unit = offset.unit;
		this.amount = Math.abs(offset.amount);
		this.subtracts = offset.amount < 0;
		this.endPicked = undefined;
	};

	pickOperation = (index: number) => {
		this.subtracts = index === 1;
		this.endPicked = undefined;
	};

	setAmount = (value: number) => {
		this.amount = value;
		this.endPicked = undefined;
	};

	pickUnit = (index: number) => {
		this.unit = units[index]?.value ?? 'days';
		this.endPicked = undefined;
	};

	pickFrom = (zone: string) => (this.fromZone = zone);
	pickTo = (zone: string) => (this.toZone = zone);

	swap = () => {
		[this.fromZone, this.toZone] = [this.toZone, this.fromZone];
	};

	addZone = (zone: string) => {
		if (this.zonesFull || this.zones.includes(zone)) return;
		this.zones = [...this.zones, zone];
	};

	removeZone = (zone: string) => {
		this.zones = this.zones.filter((entry) => entry !== zone);
	};

	<template>
		<CanonSplit class="time-calc">
			<:banner>
				<CanonCanvas
					class={{if
						this.refitting
						"canon-canvas--eases"
					}}
					@height={{this.bandHeight}}
				>
					<Picture
						@scene={{this.scene}}
						@now={{this.now}}
						@onWidth={{this.setWidth}}
					/>
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<CanonRows class="tc-source" @framed={{true}}>
					<CanonBigNumberField
						class="tc-field"
						@value={{this.fieldText}}
						@placeholder="1700000000"
						@unit={{this.fieldUnit}}
						@label={{this.fieldLabel}}
						@onStep={{this.step}}
						@onInput={{this.type}}
						{{on "focusin" this.focusField}}
						{{fit this.fieldText}}
					/>
					{{#if this.invalid}}
						<CanonStatus
							@text="Invalid date"
							@tone="warn"
							@row={{true}}
						/>
					{{/if}}
					<CanonGrid @columns={{3}}>
						<CanonButton
							@text="Now"
							@icon={{ClockIcon}}
							@onClick={{this.fillNow}}
						/>
						<CanonButton
							@text="Paste"
							@icon={{PasteIcon}}
							@onClick={{this.paste}}
						/>
						<CanonButton
							@label="Date & Time"
							@icon={{CalendarIcon}}
							@onClick={{this.openFieldPicker}}
						/>
					</CanonGrid>
					<input
						class="tc-picker"
						type="datetime-local"
						step="1"
						tabindex="-1"
						aria-hidden="true"
						aria-label="Date & Time"
						value={{this.fieldPickerValue}}
						{{capture this.keepFieldPicker}}
						{{on "change" this.pickField}}
					/>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonSegmented
						aria-label="Mode"
						@items={{this.modeNames}}
						@selected={{this.modeIndex}}
						@onChange={{this.pickMode}}
					/>
					{{#if this.isArithmetic}}
						<CanonHeading
							@text="End Date"
						/>
						<div class="tc-date">
							<CanonButton
								class="tc-date-pick"
								@text={{this.endText}}
								@icon={{CalendarIcon}}
								@kind="cell"
								@label="End Date"
								@onClick={{this.openEndPicker}}
							/>
							<CanonButton
								@text="Now"
								@kind="cell"
								@onClick={{this.endNow}}
							/>
							<input
								class="tc-picker"
								type="datetime-local"
								step="1"
								tabindex="-1"
								aria-hidden="true"
								aria-label="End Date"
								value={{this.endPickerValue}}
								{{capture
									this.keepEndPicker
								}}
								{{on
									"change"
									this.pickEnd
								}}
							/>
						</div>
						<CanonHeading
							@text="Quick Offsets"
						/>
						<CanonGrid
							class="tc-offsets"
							@columns={{4}}
						>
							{{#each
								this.offsets
								as |offset|
							}}
								<CanonButton
									@text={{offset.title}}
									@kind="cell"
									@onClick={{fn
										this.applyOffset
										offset
									}}
								/>
							{{/each}}
						</CanonGrid>
						<CanonHeading
							@text="Operation"
						/>
						<CanonSegmented
							aria-label="Operation"
							@items={{this.operations}}
							@selected={{if
								this.subtracts
								1
								0
							}}
							@onChange={{this.pickOperation}}
						/>
						<CanonHeading @text="Amount" />
						<CanonGrid @columns={{2}}>
							<CanonNumberField
								@value={{this.amount}}
								@min={{0}}
								@label="Amount"
								@onChange={{this.setAmount}}
							/>
							<CanonMenuCell
								@items={{this.unitNames}}
								@selected={{this.unitIndex}}
								@label="Unit"
								@onChange={{this.pickUnit}}
							/>
						</CanonGrid>
					{{/if}}
					{{#if this.isTimezone}}
						<CanonRow
							@title="From"
							@detail={{this.fromDetail}}
							@form="flush"
							as |titleId|
						>
							<ZoneCell
								@zone={{this.fromZone}}
								@date={{this.shownInstant}}
								@labelledBy={{titleId}}
								@onPick={{this.pickFrom}}
							/>
						</CanonRow>
						<CanonRow
							@title="To"
							@detail={{this.toDetail}}
							@form="flush"
							as |titleId|
						>
							<ZoneCell
								@zone={{this.toZone}}
								@date={{this.shownInstant}}
								@labelledBy={{titleId}}
								@onPick={{this.pickTo}}
							/>
						</CanonRow>
						<CanonGrid>
							<CanonButton
								@text="Swap"
								@icon={{SwapIcon}}
								@onClick={{this.swap}}
							/>
						</CanonGrid>
					{{/if}}
				</CanonRows>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Result" />
					{{#if this.isTimestamp}}
						{{#each
							this.stampLines
							as |row|
						}}
							<CanonValueLine
								@label={{row.label}}
								@value={{row.value}}
								@layout="above"
							/>
						{{/each}}
					{{/if}}
					{{#if this.isArithmetic}}
						<CanonTiles
							@items={{this.spanTiles}}
						/>
					{{/if}}
					{{#if this.isTimezone}}
						{{#each
							this.zoneLines
							as |row|
						}}
							<CanonValueLine
								@label={{row.label}}
								@value={{row.value}}
								@layout="above"
							/>
						{{/each}}
					{{/if}}
				</CanonRows>
				{{#if this.isArithmetic}}
					<CanonRows @framed={{true}}>
						<CanonHeading
							@text="End Date"
						/>
						{{#each this.endLines as |row|}}
							<CanonValueLine
								@label={{row.label}}
								@value={{row.value}}
								@layout="above"
							/>
						{{/each}}
					</CanonRows>
				{{/if}}
				{{#if this.isTimezone}}
					<CanonRows @framed={{true}}>
						<CanonHeading
							@text="Timezones"
						/>
						{{#each
							this.extraZones
							key="zone"
							as |row|
						}}
							<div
								class="tc-zone-row"
							>
								<CanonValueLine
									@label={{row.label}}
									@value={{row.value}}
									@layout="above"
								/>
								<CanonButton
									@icon={{RemoveIcon}}
									@kind="cell"
									@label={{row.remove}}
									@onClick={{fn
										this.removeZone
										row.zone
									}}
								/>
							</div>
						{{/each}}
						<CanonRow
							@title="Add Timezone"
							@form="flush"
							as |titleId|
						>
							<ZoneCell
								@date={{this.shownInstant}}
								@placeholder={{this.addZonePlaceholder}}
								@labelledBy={{titleId}}
								@disabled={{this.zonesFull}}
								@onPick={{this.addZone}}
							/>
						</CanonRow>
					</CanonRows>
				{{/if}}
			</:main>
		</CanonSplit>
	</template>
}
