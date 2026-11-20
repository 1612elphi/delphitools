import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import { registerDestructor } from '@ember/destroyable';
import type Owner from '@ember/owner';
import { modifier } from 'ember-modifier';
import { TrackedObject } from 'tracked-built-ins';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonCodeBlock from 'delphicanon/components/canon-code-block';
import CanonColourWell from 'delphicanon/components/canon-colour-well';
import CanonDropZone from 'delphicanon/components/canon-drop-zone';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonLoader from 'delphicanon/components/canon-loader';
import CanonNumberField from 'delphicanon/components/canon-number-field';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSlider from 'delphicanon/components/canon-slider';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonSwitch from 'delphicanon/components/canon-switch';
import CanonTextArea from 'delphicanon/components/canon-text-area';
import CanonTextCell from 'delphicanon/components/canon-text-cell';
import CanonTiles from 'delphicanon/components/canon-tiles';
import CanonTooltip from 'delphicanon/components/canon-tooltip';
import CanonValueLine from 'delphicanon/components/canon-value-line';
import {
	contrastFigure,
	contrastRatio,
	hex,
	parseHex,
	type Rgb,
} from 'delphicanon/lib/colour';
import type CanonToastService from 'delphicanon/services/canon-toast';
import Icon, { IconSvg } from 'delphitools-v2/components/icon';
import { downloadBlob } from 'delphitools-v2/lib/download';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import CodeSheetPicture from './qr-genny/picture';
import {
	eventEndsBeforeStart,
	eventString,
	type EventData,
} from './qr-genny/event';
import Swatches, { type Swatch } from './qr-genny/swatches';
import {
	drawDots,
	drawEye,
	drawSample,
	qrMatrix,
	qrSheet,
	versionOf,
	type CornerDotType,
	type CornerSquareType,
	type DotType,
	type ErrorLevel,
	type Logo,
	type QrPicture,
	type QrStyle,
} from './qr-genny/qr';
import './qr-genny/qr-genny.css';

export { wrapText } from './qr-genny/qr';

export async function qrDataUrl(
	text: string,
	size = 80,
): Promise<string | null> {
	try {
		const { default: Styling } = await import('qr-code-styling');
		const qr = new Styling({
			width: size,
			height: size,
			type: 'svg',
			data: text,
			margin: 2,
			qrOptions: { errorCorrectionLevel: 'M' },
			dotsOptions: { type: 'square', color: '#000000' },
			cornersSquareOptions: {
				type: 'square',
				color: '#000000',
			},
			cornersDotOptions: {
				type: 'square',
				color: '#000000',
			},
			backgroundOptions: { color: '#ffffff' },
		});
		const blob = await qr.getRawData('png');
		if (!(blob instanceof Blob)) return null;
		return await blobToDataUrl(blob);
	} catch {
		return null;
	}
}

type Mode = 'single' | 'wifi' | 'vcard' | 'batch' | 'event';
type SecurityType = 'nopass' | 'WPA' | 'WEP';

export type VCardData = {
	firstName: string;
	lastName: string;
	organization: string;
	title: string;
	email: string;
	phone: string;
	website: string;
	address: string;
};

export type WifiData = {
	ssid: string;
	password: string;
	securityType: SecurityType;
	isHidden: boolean;
};

const URL_CHECK_MS = 500;
const URL_LIKE = /^https?:\/\/.+/i;
const UNDO_PAUSE_MS = 600;
const UNDO_LIMIT = 100;

const MODES: Mode[] = ['single', 'wifi', 'vcard', 'batch', 'event'];
const MODE_TITLES = ['Single', 'WiFi', 'vCard', 'Batch', 'Event'];

const DOT_STYLES: { value: DotType; label: string }[] = [
	{ value: 'square', label: 'Boxy' },
	{ value: 'rounded', label: 'Bouba' },
	{ value: 'dots', label: 'Braille' },
	{ value: 'classy', label: 'Calligraph' },
	{ value: 'classy-rounded', label: 'Kiki' },
	{ value: 'extra-rounded', label: 'Blobby' },
	{ value: 'diamond', label: 'Diamond' },
	{ value: 'cushion', label: 'Cushion' },
];

const CORNER_SQUARE_STYLES: { value: CornerSquareType; label: string }[] = [
	{ value: 'square', label: 'Boxy' },
	{ value: 'dot', label: 'Circular' },
	{ value: 'extra-rounded', label: 'Rounded' },
	{ value: 'leaf', label: 'Leaf' },
	{ value: 'shield', label: 'Shield' },
	{ value: 'diamond', label: 'Diamond' },
];

const CORNER_DOT_STYLES: { value: CornerDotType; label: string }[] = [
	{ value: 'square', label: 'Square' },
	{ value: 'dot', label: 'Circle' },
	{ value: 'rounded', label: 'Rounded' },
	{ value: 'diamond', label: 'Diamond' },
	{ value: 'leaf', label: 'Leaf' },
	{ value: 'cushion', label: 'Cushion' },
];

const ERROR_LEVELS: ErrorLevel[] = ['L', 'M', 'Q', 'H'];
const ERROR_TITLES = [
	'Low (7%)',
	'Medium (15%)',
	'Quartile (25%)',
	'High (30%)',
];
const ERROR_SHARES = ['7%', '15%', '25%', '30%'];
const FORMATS = ['PNG', 'SVG'];

interface QuickStyle {
	label: string;
	dotType: DotType;
	cornerSquareType: CornerSquareType;
	cornerDotType: CornerDotType;
	foreground: string;
	background: string;
}

const QUICK_STYLES: QuickStyle[] = [
	{
		label: 'Classic',
		dotType: 'square',
		cornerSquareType: 'square',
		cornerDotType: 'square',
		foreground: '#000000',
		background: '#ffffff',
	},
	{
		label: 'Rounded',
		dotType: 'rounded',
		cornerSquareType: 'extra-rounded',
		cornerDotType: 'dot',
		foreground: '#000000',
		background: '#ffffff',
	},
	{
		label: 'Dots',
		dotType: 'dots',
		cornerSquareType: 'dot',
		cornerDotType: 'dot',
		foreground: '#000000',
		background: '#ffffff',
	},
	{
		label: 'Classy',
		dotType: 'classy-rounded',
		cornerSquareType: 'extra-rounded',
		cornerDotType: 'dot',
		foreground: '#000000',
		background: '#ffffff',
	},
	{
		label: 'Indigo',
		dotType: 'rounded',
		cornerSquareType: 'extra-rounded',
		cornerDotType: 'dot',
		foreground: '#6366f1',
		background: '#ffffff',
	},
	{
		label: 'Rose',
		dotType: 'extra-rounded',
		cornerSquareType: 'extra-rounded',
		cornerDotType: 'dot',
		foreground: '#e11d48',
		background: '#ffffff',
	},
	{
		label: 'Teal',
		dotType: 'classy',
		cornerSquareType: 'square',
		cornerDotType: 'square',
		foreground: '#0d9488',
		background: '#ffffff',
	},
	{
		label: 'Amber',
		dotType: 'rounded',
		cornerSquareType: 'extra-rounded',
		cornerDotType: 'dot',
		foreground: '#d97706',
		background: '#ffffff',
	},
	{
		label: 'Violet',
		dotType: 'classy-rounded',
		cornerSquareType: 'extra-rounded',
		cornerDotType: 'dot',
		foreground: '#7c3aed',
		background: '#ffffff',
	},
];

const PRESETS: { label: string; value: string }[] = [
	{ label: 'URL', value: 'https://example.com' },
	{ label: 'Email', value: 'mailto:hello@example.com' },
	{ label: 'Phone', value: 'tel:+1234567890' },
	{ label: 'WiFi', value: 'WIFI:T:WPA;S:NetworkName;P:password;;' },
	{ label: 'SMS', value: 'sms:+1234567890?body=Hello' },
	{ label: 'Geo', value: 'geo:40.7128,-74.0060' },
];

const SECURITY_TYPES: { value: SecurityType; label: string }[] = [
	{ value: 'nopass', label: 'No password' },
	{ value: 'WPA', label: 'WPA/WPA2' },
	{ value: 'WEP', label: 'WEP' },
];
const SECURITY_TITLES = SECURITY_TYPES.map((type) => type.label);

const CHECKING_URL = 'Checking URL...';
const VALID_URL = 'Valid URL format';
const INVALID_URL = 'Invalid URL format';
const EMPTY_WIFI = 'Enter network details to generate QR code';
const EMPTY_VCARD = 'Fill in contact details to generate QR code';
const EMPTY_SINGLE = 'Enter content to generate QR code';
const EMPTY_EVENT = 'Fill in event details to generate code...';
const EVENT_BACKWARDS = 'Causality violation: End date before start date.';
const CONTENT_PLACEHOLDER = 'Enter URL, text, or data...';
const NEEDS_PASSWORD = 'Enter the password to generate the QR code.';
const HIDDEN_DETAIL = "For networks that don't broadcast their SSID.";
const BATCH_HINT =
	'Insert your data manually or upload a text file with one QR code content per line';
const BATCH_GENERATE = 'Generate & Download ZIP';
const LEVEL_HINT =
	'Higher error correction allows the QR code to be readable even if partially damaged or obscured (e.g., by a logo).';
const LOGO_TIP =
	'Tip: Use High (H) error correction when adding a logo to ensure the QR code remains scannable.';
const TOO_LONG = 'Too long for a QR code. Shorten your text!';
const LOGO_PROMPT = 'Add a logo to the centre';

const QR_INFO = {
	name: 'QR Code',
	inventor: 'Masahiro Hara (Denso Wave)',
	year: '1994',
	description:
		'Quick Response code, originally for automotive tracking. Now ubiquitous for URLs, payments, and more.',
};

export function vcardString(data: VCardData): string {
	const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
	if (data.firstName || data.lastName) {
		lines.push(`N:${data.lastName};${data.firstName};;;`);
		lines.push(`FN:${data.firstName} ${data.lastName}`.trim());
	}
	if (data.organization) lines.push(`ORG:${data.organization}`);
	if (data.title) lines.push(`TITLE:${data.title}`);
	if (data.email) lines.push(`EMAIL:${data.email}`);
	if (data.phone) lines.push(`TEL:${data.phone}`);
	if (data.website) lines.push(`URL:${data.website}`);
	if (data.address) lines.push(`ADR:;;${data.address};;;;`);
	lines.push('END:VCARD');
	return lines.join('\n');
}

function escapeWifiValue(value: string): string {
	return value.replace(/[\\;,":]/g, '\\$&');
}

export function wifiString(data: WifiData): string {
	if (!data.ssid.trim()) return '';
	if (data.securityType !== 'nopass' && !data.password) return '';

	let out = `WIFI:T:${data.securityType};S:${escapeWifiValue(data.ssid)}`;
	if (data.securityType !== 'nopass') {
		out += `;P:${escapeWifiValue(data.password)}`;
	}
	if (data.isHidden) out += ';H:true';
	return `${out};;`;
}

function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve) => {
		const reader = new FileReader();
		reader.onloadend = () => resolve(reader.result as string);
		reader.readAsDataURL(blob);
	});
}

const rgbOf = (colour: string): Rgb => parseHex(colour) ?? [0, 0, 0];

const editable = (target: EventTarget | null) =>
	target instanceof HTMLElement &&
	(target.isContentEditable || target.matches('input, textarea, select'));

class BatchItem {
	id = crypto.randomUUID();
	@tracked content;
	@tracked status: 'pending' | 'generating' | 'done' | 'error' =
		'pending';
	@tracked dataUrl: string | null = null;

	constructor(content: string) {
		this.content = content;
	}

	get isDone() {
		return this.status === 'done';
	}

	get isGenerating() {
		return this.status === 'generating';
	}

	get isError() {
		return this.status === 'error';
	}
}

interface Snapshot {
	mode: Mode;
	content: string;
	wifi: WifiData;
	vcard: VCardData;
	event: EventData;
	size: number;
	padding: number;
	foreground: string;
	background: string;
	transparent: boolean;
	dotType: DotType;
	cornerSquareType: CornerSquareType;
	cornerDotType: CornerDotType;
	errorCorrection: ErrorLevel;
	logoSize: number;
	logoMargin: number;
	showInfo: boolean;
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

const Copy = <template><IconSvg @name="copy" /></template>;
const Download = <template><IconSvg @name="download" /></template>;
const Remove = <template><IconSvg @name="x" /></template>;
const Plus = <template><IconSvg @name="plus" /></template>;
const Upload = <template><IconSvg @name="upload" /></template>;
const Trash = <template><IconSvg @name="trash-2" /></template>;
const Info = <template><IconSvg @name="info" /></template>;
const Peek = <template><IconSvg @name="eye" /></template>;
const Hide = <template><IconSvg @name="eye-off" /></template>;

export default class QrGennyTool extends Component {
	@service('canon-toast') declare toast: CanonToastService;

	@tracked mode: Mode = 'single';
	@tracked content = '';
	@tracked size = 300;
	@tracked padding = 2;
	@tracked foreground = '#000000';
	@tracked background = '#ffffff';
	@tracked transparent = false;
	@tracked dotType: DotType = 'square';
	@tracked cornerSquareType: CornerSquareType = 'square';
	@tracked cornerDotType: CornerDotType = 'square';
	@tracked errorCorrection: ErrorLevel = 'M';
	@tracked logo: string | null = null;
	@tracked logoImage?: Logo;
	@tracked logoSize = 0.3;
	@tracked logoMargin = 4;
	@tracked showInfo = false;
	@tracked isSvg = false;
	@tracked showPassword = false;
	@tracked urlChecking = false;
	@tracked urlValid: boolean | null = null;
	@tracked urlMessage = '';
	@tracked batchItems: BatchItem[] = [];
	@tracked batchGenerating = false;

	vcard = new TrackedObject<VCardData>({
		firstName: '',
		lastName: '',
		organization: '',
		title: '',
		email: '',
		phone: '',
		website: '',
		address: '',
	});

	event = new TrackedObject<EventData>({
		title: '',
		location: '',
		notes: '',
		allDay: false,
		start: '',
		end: '',
	});

	wifi = new TrackedObject<WifiData>({
		ssid: '',
		password: '',
		securityType: 'nopass',
		isHidden: false,
	});

	#urlTimer?: number;
	#timers: number[] = [];
	#destroyed = false;
	#undo: Snapshot[] = [];
	#redo: Snapshot[] = [];
	#lastEdit = 0;
	#picture?: { key: string; value: QrPicture | undefined };
	#batchInput?: HTMLInputElement;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		this.#launch(new URLSearchParams(window.location.search));
		registerDestructor(this, () => {
			this.#destroyed = true;
			window.clearTimeout(this.#urlTimer);
			this.#timers.forEach((timer) =>
				window.clearTimeout(timer),
			);
		});
	}

	#launch(query: URLSearchParams) {
		const kind = Number(query.get('qrKind'));
		if (MODES[kind]) this.mode = MODES[kind];
		const text = query.get('qrText');
		if (text !== null) {
			if (this.mode === 'wifi') this.wifi.ssid = text;
			else this.content = text;
		}
		const password = query.get('qrPassword');
		if (password !== null) {
			this.wifi.password = password;
			this.wifi.securityType = 'WPA';
		}
		const preset =
			QUICK_STYLES[Number(query.get('qrPreset') ?? '-1')];
		if (preset) this.#applyStyle(preset);
		if (query.get('qrInfo')) this.showInfo = true;
		if (query.get('qrFormat') === '1') this.isSvg = true;
		const grow = query.get('qrGrow');
		if (grow) {
			[...grow].forEach((_, index) =>
				this.#timers.push(
					window.setTimeout(
						() =>
							(this.content =
								grow.slice(
									0,
									index +
										1,
								)),
						3000 + 900 * index,
					),
				),
			);
		}
		this.focusFirst = query.get('qrFocus') !== null;
	}

	focusFirst = false;

	#snapshot(): Snapshot {
		return {
			mode: this.mode,
			content: this.content,
			wifi: { ...this.wifi },
			vcard: { ...this.vcard },
			event: { ...this.event },
			size: this.size,
			padding: this.padding,
			foreground: this.foreground,
			background: this.background,
			transparent: this.transparent,
			dotType: this.dotType,
			cornerSquareType: this.cornerSquareType,
			cornerDotType: this.cornerDotType,
			errorCorrection: this.errorCorrection,
			logoSize: this.logoSize,
			logoMargin: this.logoMargin,
			showInfo: this.showInfo,
		};
	}

	#restore(s: Snapshot) {
		this.mode = s.mode;
		this.content = s.content;
		Object.assign(this.wifi, s.wifi);
		Object.assign(this.vcard, s.vcard);
		Object.assign(this.event, s.event);
		this.size = s.size;
		this.padding = s.padding;
		this.foreground = s.foreground;
		this.background = s.background;
		this.transparent = s.transparent;
		this.dotType = s.dotType;
		this.cornerSquareType = s.cornerSquareType;
		this.cornerDotType = s.cornerDotType;
		this.errorCorrection = s.errorCorrection;
		this.logoSize = s.logoSize;
		this.logoMargin = s.logoMargin;
		this.showInfo = s.showInfo;
	}

	#remember() {
		const time = performance.now();
		if (time - this.#lastEdit > UNDO_PAUSE_MS) {
			this.#undo.push(this.#snapshot());
			if (this.#undo.length > UNDO_LIMIT) this.#undo.shift();
			this.#redo = [];
		}
		this.#lastEdit = time;
	}

	#step(redo: boolean) {
		const from = redo ? this.#redo : this.#undo;
		const to = redo ? this.#undo : this.#redo;
		const state = from.pop();
		if (!state) return;
		to.push(this.#snapshot());
		this.#restore(state);
		this.#lastEdit = 0;
	}

	undoKeys = modifier(() => {
		const keydown = (event: KeyboardEvent) => {
			if (
				!(event.metaKey || event.ctrlKey) ||
				editable(event.target)
			)
				return;
			const key = event.key.toLowerCase();
			const redo =
				(key === 'z' && event.shiftKey) || key === 'y';
			if (key !== 'z' && key !== 'y') return;
			event.preventDefault();
			this.#step(redo);
		};
		document.addEventListener('keydown', keydown);
		return () => document.removeEventListener('keydown', keydown);
	});

	get isBatch() {
		return this.mode === 'batch';
	}

	get isSingle() {
		return this.mode === 'single';
	}

	get isWifi() {
		return this.mode === 'wifi';
	}

	get isVcard() {
		return this.mode === 'vcard';
	}

	get isEvent() {
		return this.mode === 'event';
	}

	get eventBackwards() {
		return eventEndsBeforeStart(this.event);
	}

	get eventPreview() {
		return eventString(this.event);
	}

	get modeIndex() {
		return MODES.indexOf(this.mode);
	}

	get isSecured() {
		return this.wifi.securityType !== 'nopass';
	}

	get isOpenNetwork() {
		return !this.isSecured;
	}

	get passwordType() {
		return this.showPassword ? 'text' : 'password';
	}

	get securityIndex() {
		return SECURITY_TYPES.findIndex(
			(type) => type.value === this.wifi.securityType,
		);
	}

	get wifiNeedsPassword() {
		return (
			this.isSecured &&
			!!this.wifi.ssid.trim() &&
			!this.wifi.password
		);
	}

	get hasName() {
		return !!(this.vcard.firstName || this.vcard.lastName);
	}

	get vcardPreview() {
		return vcardString(this.vcard);
	}

	get qrContent() {
		if (this.mode === 'vcard') return vcardString(this.vcard);
		if (this.mode === 'event') return eventString(this.event);
		if (this.mode === 'wifi') return wifiString(this.wifi);
		if (this.mode === 'batch')
			return (
				this.batchItems.find((item) =>
					item.content.trim(),
				)?.content ?? ''
			);
		return this.content;
	}

	get emptyMessage() {
		if (this.mode === 'wifi') return EMPTY_WIFI;
		if (this.mode === 'vcard') return EMPTY_VCARD;
		if (this.mode === 'event') return EMPTY_EVENT;
		return EMPTY_SINGLE;
	}

	get safeForeground() {
		return CSS.supports('color', this.foreground)
			? this.foreground
			: '#000000';
	}

	get safeBackground() {
		return CSS.supports('color', this.background)
			? this.background
			: '#ffffff';
	}

	get foregroundRgb() {
		return rgbOf(this.safeForeground);
	}

	get backgroundRgb() {
		return rgbOf(this.safeBackground);
	}

	get urlTone() {
		if (this.urlChecking) return 'muted';
		return this.urlValid ? 'ok' : 'warn';
	}

	get infoTexts(): string[] {
		const entries: { label?: string; value: string }[] = [];

		if (this.mode === 'wifi') {
			entries.push({
				label: 'Network',
				value: this.wifi.ssid.trim(),
			});
			if (this.isSecured) {
				entries.push({
					label: 'Password',
					value: this.wifi.password,
				});
			}
			if (this.wifi.isHidden) {
				entries.push({ value: 'Hidden network' });
			}
		} else if (this.mode === 'vcard') {
			entries.push(
				{
					label: 'Name',
					value: `${this.vcard.firstName} ${this.vcard.lastName}`.trim(),
				},
				{
					label: 'Organisation',
					value: this.vcard.organization,
				},
				{ label: 'Job Title', value: this.vcard.title },
				{ label: 'Email', value: this.vcard.email },
				{ label: 'Phone', value: this.vcard.phone },
				{ label: 'Website', value: this.vcard.website },
				{ label: 'Address', value: this.vcard.address },
			);
		} else if (this.mode === 'event') {
			entries.push(
				{
					label: 'Event',
					value: this.event.title.trim(),
				},
				{
					label: 'Starts',
					value: this.event.start.replace(
						'T',
						' ',
					),
				},
				{
					label: 'Ends',
					value: this.event.end.replace('T', ' '),
				},
				{
					label: 'Location',
					value: this.event.location,
				},
			);
		} else {
			entries.push({
				label: 'Content',
				value: this.content.trim(),
			});
		}

		return entries
			.filter((entry) => entry.value)
			.map((entry) =>
				entry.label
					? `${entry.label}: ${entry.value}`
					: entry.value,
			);
	}

	get includeInfo() {
		return (
			this.showInfo &&
			!this.isBatch &&
			this.infoTexts.length > 0
		);
	}

	get matrix() {
		const data = this.qrContent;
		return data.trim()
			? qrMatrix(data, this.errorCorrection)
			: undefined;
	}

	get picture(): QrPicture | undefined {
		const matrix = this.matrix;
		if (!matrix) return undefined;
		const style = this.#style(
			this.includeInfo ? this.infoTexts : [],
		);
		const key = JSON.stringify({
			...style,
			logo: style.logo?.id,
			data: this.qrContent,
		});
		if (this.#picture?.key !== key)
			// eslint-disable-next-line ember/no-side-effects
			this.#picture = { key, value: qrSheet(matrix, style) };
		return this.#picture.value;
	}

	#style(info: string[]): QrStyle {
		return {
			size: this.size,
			margin: this.padding * 4,
			level: this.errorCorrection,
			dotType: this.dotType,
			cornerSquareType: this.cornerSquareType,
			cornerDotType: this.cornerDotType,
			ink: this.safeForeground,
			paper: this.transparent
				? undefined
				: this.safeBackground,
			logo: this.logo ? this.logoImage : undefined,
			logoSize: this.logoSize,
			logoMargin: this.logoMargin,
			info,
		};
	}

	get tooLong() {
		return !!this.qrContent.trim() && !this.picture;
	}

	get hasCode() {
		return !!this.picture;
	}

	get noCode() {
		return !this.picture;
	}

	get pictureLabel() {
		return this.picture ? this.qrContent : this.emptyMessage;
	}

	get tiles() {
		const count = this.picture?.count ?? 0;
		const level = ERROR_LEVELS.indexOf(this.errorCorrection);
		const contrast = this.transparent
			? undefined
			: contrastRatio(this.foregroundRgb, this.backgroundRgb);
		return [
			{
				label: 'Version',
				value: count ? String(versionOf(count)) : '—',
			},
			{
				label: 'Modules',
				value: count ? `${count} × ${count}` : '—',
			},
			{
				label: 'Error Correction',
				value: `${this.errorCorrection} · ${ERROR_SHARES[level]}`,
			},
			{
				label: 'Payload',
				value: `${new TextEncoder().encode(this.qrContent).length} B`,
			},
			{
				label: 'Contrast',
				value: contrast
					? `${contrastFigure(contrast)}:1`
					: '—',
			},
		];
	}

	get presetItems(): Swatch[] {
		return QUICK_STYLES.map((style) => ({
			title: style.label,
			paper: style.background,
			draw: (context, side) =>
				drawSample(
					context,
					side,
					style.dotType,
					style.cornerSquareType,
					style.cornerDotType,
					style.foreground,
				),
		}));
	}

	get paper() {
		return this.transparent ? undefined : this.safeBackground;
	}

	get dotItems(): Swatch[] {
		const ink = this.safeForeground;
		return DOT_STYLES.map((style) => ({
			title: style.label,
			paper: this.paper,
			draw: (context, side) =>
				drawDots(context, side, style.value, ink),
		}));
	}

	get eyeItems(): Swatch[] {
		const ink = this.safeForeground;
		const pupil = this.cornerDotType;
		return CORNER_SQUARE_STYLES.map((style) => ({
			title: style.label,
			paper: this.paper,
			draw: (context, side) =>
				drawEye(context, side, style.value, pupil, ink),
		}));
	}

	get pupilItems(): Swatch[] {
		const ink = this.safeForeground;
		const eye = this.cornerSquareType;
		return CORNER_DOT_STYLES.map((style) => ({
			title: style.label,
			paper: this.paper,
			draw: (context, side) =>
				drawEye(context, side, eye, style.value, ink),
		}));
	}

	get presetIndex() {
		const index = QUICK_STYLES.findIndex(
			(style) =>
				style.dotType === this.dotType &&
				style.cornerSquareType ===
					this.cornerSquareType &&
				style.cornerDotType === this.cornerDotType &&
				style.foreground ===
					this.foreground.toLowerCase() &&
				style.background ===
					this.background.toLowerCase(),
		);
		return index < 0 ? undefined : index;
	}

	get dotIndex() {
		return DOT_STYLES.findIndex(
			(style) => style.value === this.dotType,
		);
	}

	get eyeIndex() {
		return CORNER_SQUARE_STYLES.findIndex(
			(style) => style.value === this.cornerSquareType,
		);
	}

	get pupilIndex() {
		return CORNER_DOT_STYLES.findIndex(
			(style) => style.value === this.cornerDotType,
		);
	}

	get levelIndex() {
		return ERROR_LEVELS.indexOf(this.errorCorrection);
	}

	get logoText() {
		const image = this.logoImage;
		return image ? `${image.width} × ${image.height} px` : '';
	}

	get batchRows() {
		return this.batchItems.map((item, index) => ({
			item,
			number: `${index + 1}.`,
		}));
	}

	get batchBusy() {
		return this.batchGenerating || this.batchItems.length === 0;
	}

	#applyStyle(style: QuickStyle) {
		this.dotType = style.dotType;
		this.cornerSquareType = style.cornerSquareType;
		this.cornerDotType = style.cornerDotType;
		this.foreground = style.foreground;
		this.background = style.background;
	}

	setMode = (index: number) => {
		this.#remember();
		this.mode = MODES[index] ?? 'single';
	};

	setContent = (value: string) => {
		this.#remember();
		this.content = value;
		this.#queueUrlCheck();
	};

	usePreset = (preset: { value: string }) => {
		this.#remember();
		this.content = preset.value;
		this.#queueUrlCheck();
	};

	selectAll = (event: FocusEvent) => {
		const field = event.target;
		if (field instanceof HTMLTextAreaElement)
			requestAnimationFrame(() => field.select());
	};

	focusOnLaunch = modifier((field: HTMLElement) => {
		if (this.focusFirst) field.focus();
	});

	setVcard = (field: keyof VCardData, value: string) => {
		this.#remember();
		this.vcard[field] = value;
	};

	setSsid = (value: string) => {
		this.#remember();
		this.wifi.ssid = value;
	};

	setPassword = (value: string) => {
		this.#remember();
		this.wifi.password = value;
	};

	setSecurity = (index: number) => {
		this.#remember();
		this.wifi.securityType =
			SECURITY_TYPES[index]?.value ?? 'nopass';
	};

	setEvent = (
		field: 'title' | 'location' | 'notes' | 'start' | 'end',
		value: string,
	) => {
		this.#remember();
		this.event[field] = value;
	};

	// ponytail: timed fallback is 09:00, no per-field memory of the old time
	setAllDay = (on: boolean) => {
		this.#remember();
		const convert = (value: string) => {
			if (!value) return value;
			const day = value.slice(0, 10);
			return on ? day : `${day}T09:00`;
		};
		this.event.allDay = on;
		this.event.start = convert(this.event.start);
		this.event.end = convert(this.event.end);
	};

	setHidden = (on: boolean) => {
		this.#remember();
		this.wifi.isHidden = on;
	};

	togglePassword = () => {
		this.showPassword = !this.showPassword;
	};

	setSize = (value: number) => {
		this.#remember();
		this.size = value;
	};

	setPadding = (value: number) => {
		this.#remember();
		this.padding = value;
	};

	setLevel = (index: number) => {
		this.#remember();
		this.errorCorrection = ERROR_LEVELS[index] ?? 'M';
	};

	setForeground = (colour: Rgb) => {
		this.#remember();
		this.foreground = hex(colour).toLowerCase();
	};

	setBackground = (colour: Rgb) => {
		this.#remember();
		this.background = hex(colour).toLowerCase();
	};

	setTransparent = (on: boolean) => {
		this.#remember();
		this.transparent = on;
	};

	pickPreset = (index: number) => {
		const style = QUICK_STYLES[index];
		if (!style) return;
		this.#remember();
		this.#applyStyle(style);
	};

	pickDot = (index: number) => {
		this.#remember();
		this.dotType = DOT_STYLES[index]?.value ?? 'square';
	};

	pickEye = (index: number) => {
		this.#remember();
		this.cornerSquareType =
			CORNER_SQUARE_STYLES[index]?.value ?? 'square';
	};

	pickPupil = (index: number) => {
		this.#remember();
		this.cornerDotType =
			CORNER_DOT_STYLES[index]?.value ?? 'square';
	};

	setShowInfo = (on: boolean) => {
		this.#remember();
		this.showInfo = on;
	};

	setFormat = (index: number) => {
		this.isSvg = index === 1;
	};

	#queueUrlCheck() {
		window.clearTimeout(this.#urlTimer);

		const value = this.content;
		if (!value.trim() || !URL_LIKE.test(value)) {
			this.urlChecking = false;
			this.urlValid = null;
			this.urlMessage = '';
			return;
		}

		this.urlChecking = true;
		this.urlValid = null;
		this.urlMessage = CHECKING_URL;

		this.#urlTimer = window.setTimeout(() => {
			let valid = true;
			try {
				new URL(value);
			} catch {
				valid = false;
			}
			this.urlChecking = false;
			this.urlValid = valid;
			this.urlMessage = valid ? VALID_URL : INVALID_URL;
		}, URL_CHECK_MS);
	}

	readLogo = (file: File) => {
		if (!file.type.startsWith('image/')) return;
		const reader = new FileReader();
		reader.onload = () => {
			if (this.#destroyed) return;
			const url = reader.result as string;
			const image = new Image();
			image.onload = () => {
				if (this.#destroyed) return;
				this.logo = url;
				this.logoImage = {
					image,
					width: image.naturalWidth,
					height: image.naturalHeight,
					id: crypto.randomUUID(),
				};
			};
			image.src = url;
		};
		reader.readAsDataURL(file);
	};

	dropLogo = (files: File[]) => {
		const [file] = files;
		if (file) this.readLogo(file);
	};

	removeLogo = () => {
		this.logo = null;
		this.logoImage = undefined;
	};

	setLogoSize = (value: number) => {
		this.#remember();
		this.logoSize = value;
	};

	setLogoMargin = (value: number) => {
		this.#remember();
		this.logoMargin = value;
	};

	#png(picture: QrPicture): Promise<Blob | null> {
		const canvas = picture.canvas();
		if (!canvas) return Promise.resolve(null);
		return new Promise((resolve) =>
			canvas.toBlob(resolve, 'image/png'),
		);
	}

	export = () => void this.#export();

	async #export() {
		const picture = this.picture;
		if (!picture) return;
		const filename = `qr-code-${Date.now()}`;
		if (this.isSvg) {
			downloadBlob(
				new Blob(
					[picture.svg(this.logo ?? undefined)],
					{
						type: 'image/svg+xml',
					},
				),
				`${filename}.svg`,
			);
			return;
		}
		const png = await this.#png(picture);
		if (png) downloadBlob(png, `${filename}.png`);
	}

	copy = () => void this.#copy();

	async #copy() {
		const picture = this.picture;
		if (!picture) return;
		if (this.isSvg) {
			await this.toast.copy(
				picture.svg(this.logo ?? undefined),
			);
			return;
		}
		try {
			const blob = await this.#png(picture);
			if (!blob) return;
			await navigator.clipboard.write([
				new ClipboardItem({ 'image/png': blob }),
			]);
			if (!this.#destroyed) this.toast.show();
		} catch {
			// clipboard denied: no-op
		}
	}

	addBatchItem = () => {
		this.batchItems = [...this.batchItems, new BatchItem('')];
	};

	removeBatchItem = (item: BatchItem) => {
		this.batchItems = this.batchItems.filter(
			(other) => other !== item,
		);
	};

	updateBatchItem = (item: BatchItem, value: string) => {
		item.content = value;
	};

	keepBatchInput = modifier((input: HTMLInputElement) => {
		this.#batchInput = input;
	});

	chooseBatchList = () => this.#batchInput?.click();

	uploadBatchList = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;

		const reader = new FileReader();
		reader.onload = () => {
			if (this.#destroyed) return;
			const lines = (reader.result as string)
				.split(/\r?\n/)
				.map((line) => line.trim())
				.filter((line) => line.length > 0);
			this.batchItems = [
				...this.batchItems,
				...lines.map((line) => new BatchItem(line)),
			];
		};
		reader.readAsText(file);
	};

	generateBatch = () => void this.#generateBatch();

	async #generateBatch() {
		if (this.batchItems.length === 0) return;
		this.batchGenerating = true;

		const { default: JSZip } = await import('jszip');
		if (this.#destroyed) return;

		const zip = new JSZip();

		for (const item of this.batchItems) {
			if (this.#destroyed) return;
			if (!item.content.trim()) continue;

			item.status = 'generating';
			try {
				const matrix = qrMatrix(
					item.content,
					this.errorCorrection,
				);
				const written =
					matrix &&
					qrSheet(matrix, this.#style([]));
				const blob = written
					? await this.#png(written)
					: null;
				if (this.#destroyed) return;
				if (!blob) {
					item.status = 'error';
					continue;
				}

				const safeName = item.content
					.slice(0, 30)
					.replace(/[^a-zA-Z0-9]/g, '_');
				zip.file(`qr-${safeName}.png`, blob);
				item.dataUrl = await blobToDataUrl(blob);
				item.status = 'done';
			} catch {
				item.status = 'error';
			}
		}

		const archive = await zip.generateAsync({ type: 'blob' });
		if (this.#destroyed) return;
		downloadBlob(archive, `qr-codes-batch-${Date.now()}.zip`);
		this.batchGenerating = false;
	}

	<template>
		<CanonSplit
			class="qr-genny"
			@halves={{true}}
			@collapsesTo={{240}}
			{{filePaste this.readLogo accept="image/*"}}
			{{this.undoKeys}}
		>
			<:sidebar>
				<CanonCanvas @aspect={{1}} @maxHeight={{520}}>
					<CodeSheetPicture
						@sheet={{this.picture.sheet}}
						@caption="QR code"
						@pixels={{this.picture.pixels}}
						@label={{this.pictureLabel}}
						@emptyIcon="qr-code"
						@emptyText={{this.emptyMessage}}
					/>
				</CanonCanvas>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Content" />
					<CanonSegmented
						@items={{MODE_TITLES}}
						@selected={{this.modeIndex}}
						@columns={{5}}
						@onChange={{this.setMode}}
						aria-label="Type"
					/>
					{{#if this.isSingle}}
						<CanonTextArea
							class="qr-content"
							@value={{this.content}}
							@placeholder={{CONTENT_PLACEHOLDER}}
							@height={{132}}
							@onChange={{this.setContent}}
							aria-label="Content"
							{{on
								"focusin"
								this.selectAll
							}}
							{{this.focusOnLaunch}}
						/>
						{{#if this.urlMessage}}
							<CanonStatus
								@text={{this.urlMessage}}
								@tone={{this.urlTone}}
								@row={{true}}
							/>
						{{/if}}
						<CanonGrid @columns={{3}}>
							{{#each
								PRESETS
								key="label"
								as |preset|
							}}
								<CanonButton
									@kind="cell"
									@text={{preset.label}}
									@onClick={{fn
										this.usePreset
										preset
									}}
								/>
							{{/each}}
						</CanonGrid>
					{{else if this.isWifi}}
						<CanonRow
							@title="Network Name (SSID)"
							@form="flush"
							as |titleId|
						>
							<CanonTextCell
								@value={{this.wifi.ssid}}
								@placeholder="My WiFi Network"
								@onChange={{this.setSsid}}
								aria-labelledby={{titleId}}
								{{this.focusOnLaunch}}
							/>
						</CanonRow>
						<CanonHeading
							@text="Security Type"
						/>
						<CanonSegmented
							@items={{SECURITY_TITLES}}
							@selected={{this.securityIndex}}
							@onChange={{this.setSecurity}}
							aria-label="Security Type"
						/>
						<CanonRow
							class="qr-password"
							@title="Password"
							@form="flush"
							as |titleId|
						>
							<CanonTextCell
								type={{this.passwordType}}
								autocomplete="off"
								disabled={{this.isOpenNetwork}}
								@value={{if
									this.isSecured
									this.wifi.password
									""
								}}
								@placeholder={{if
									this.isSecured
									"Enter WiFi password"
									"Open network"
								}}
								@onChange={{this.setPassword}}
								aria-labelledby={{titleId}}
							/>
							{{#if this.isSecured}}
								<CanonButton
									@kind="cell"
									@icon={{if
										this.showPassword
										Hide
										Peek
									}}
									@label={{if
										this.showPassword
										"Hide password"
										"Show password"
									}}
									@onClick={{this.togglePassword}}
								/>
							{{/if}}
						</CanonRow>
						{{#if this.wifiNeedsPassword}}
							<CanonStatus
								@text={{NEEDS_PASSWORD}}
								@tone="warn"
								@row={{true}}
							/>
						{{/if}}
						<CanonRow
							@title="Hidden network"
							@detail={{HIDDEN_DETAIL}}
							as |titleId|
						>
							<CanonSwitch
								@on={{this.wifi.isHidden}}
								@onChange={{this.setHidden}}
								aria-labelledby={{titleId}}
							/>
						</CanonRow>
					{{else if this.isVcard}}
						<CanonRow
							@title="First Name"
							@form="flush"
							as |titleId|
						>
							<CanonTextCell
								@value={{this.vcard.firstName}}
								@placeholder="John"
								@onChange={{fn
									this.setVcard
									"firstName"
								}}
								aria-labelledby={{titleId}}
								{{this.focusOnLaunch}}
							/>
						</CanonRow>
						<CanonRow
							@title="Last Name"
							@form="flush"
							as |titleId|
						>
							<CanonTextCell
								@value={{this.vcard.lastName}}
								@placeholder="Doe"
								@onChange={{fn
									this.setVcard
									"lastName"
								}}
								aria-labelledby={{titleId}}
							/>
						</CanonRow>
						<CanonRow
							@title="Organisation"
							@form="flush"
							as |titleId|
						>
							<CanonTextCell
								@value={{this.vcard.organization}}
								@placeholder="Acme Inc."
								@onChange={{fn
									this.setVcard
									"organization"
								}}
								aria-labelledby={{titleId}}
							/>
						</CanonRow>
						<CanonRow
							@title="Job Title"
							@form="flush"
							as |titleId|
						>
							<CanonTextCell
								@value={{this.vcard.title}}
								@placeholder="Software Engineer"
								@onChange={{fn
									this.setVcard
									"title"
								}}
								aria-labelledby={{titleId}}
							/>
						</CanonRow>
						<CanonRow
							@title="Email"
							@form="flush"
							as |titleId|
						>
							<CanonTextCell
								type="email"
								@value={{this.vcard.email}}
								@placeholder="john@example.com"
								@onChange={{fn
									this.setVcard
									"email"
								}}
								aria-labelledby={{titleId}}
							/>
						</CanonRow>
						<CanonRow
							@title="Phone"
							@form="flush"
							as |titleId|
						>
							<CanonTextCell
								type="tel"
								@value={{this.vcard.phone}}
								@placeholder="+1 234 567 8900"
								@onChange={{fn
									this.setVcard
									"phone"
								}}
								aria-labelledby={{titleId}}
							/>
						</CanonRow>
						<CanonRow
							@title="Website"
							@form="flush"
							as |titleId|
						>
							<CanonTextCell
								type="url"
								@value={{this.vcard.website}}
								@placeholder="https://example.com"
								@onChange={{fn
									this.setVcard
									"website"
								}}
								aria-labelledby={{titleId}}
							/>
						</CanonRow>
						<CanonRow
							@title="Address"
							@form="flush"
							as |titleId|
						>
							<CanonTextCell
								@value={{this.vcard.address}}
								@placeholder="123 Main St, City"
								@onChange={{fn
									this.setVcard
									"address"
								}}
								aria-labelledby={{titleId}}
							/>
						</CanonRow>
						{{#if this.hasName}}
							<CanonCodeBlock
								@code={{this.vcardPreview}}
							/>
						{{/if}}
					{{else if this.isEvent}}
						<CanonRow
							@title="Title"
							@form="flush"
							as |titleId|
						>
							<CanonTextCell
								@value={{this.event.title}}
								@onChange={{fn
									this.setEvent
									"title"
								}}
								aria-labelledby={{titleId}}
								{{this.focusOnLaunch}}
							/>
						</CanonRow>
						<CanonRow
							@title="Location"
							@form="flush"
							as |titleId|
						>
							<CanonTextCell
								@value={{this.event.location}}
								@onChange={{fn
									this.setEvent
									"location"
								}}
								aria-labelledby={{titleId}}
							/>
						</CanonRow>
						<CanonRow
							@title="All day"
							as |titleId|
						>
							<CanonSwitch
								@on={{this.event.allDay}}
								@onChange={{this.setAllDay}}
								aria-labelledby={{titleId}}
							/>
						</CanonRow>
						{{#if this.event.allDay}}
							<CanonRow
								@title="Starts"
								@form="flush"
								as |titleId|
							>
								<CanonTextCell
									type="date"
									@value={{this.event.start}}
									@onChange={{fn
										this.setEvent
										"start"
									}}
									aria-labelledby={{titleId}}
								/>
							</CanonRow>
							<CanonRow
								@title="Ends"
								@form="flush"
								as |titleId|
							>
								<CanonTextCell
									type="date"
									@value={{this.event.end}}
									@onChange={{fn
										this.setEvent
										"end"
									}}
									aria-labelledby={{titleId}}
								/>
							</CanonRow>
						{{else}}
							<CanonRow
								@title="Starts"
								@form="flush"
								as |titleId|
							>
								<CanonTextCell
									type="datetime-local"
									@value={{this.event.start}}
									@onChange={{fn
										this.setEvent
										"start"
									}}
									aria-labelledby={{titleId}}
								/>
							</CanonRow>
							<CanonRow
								@title="Ends"
								@form="flush"
								as |titleId|
							>
								<CanonTextCell
									type="datetime-local"
									@value={{this.event.end}}
									@onChange={{fn
										this.setEvent
										"end"
									}}
									aria-labelledby={{titleId}}
								/>
							</CanonRow>
						{{/if}}
						<CanonRow
							@title="Notes"
							@form="flush"
							as |titleId|
						>
							<CanonTextCell
								@value={{this.event.notes}}
								@onChange={{fn
									this.setEvent
									"notes"
								}}
								aria-labelledby={{titleId}}
							/>
						</CanonRow>
						{{#if this.eventBackwards}}
							<CanonStatus
								@text={{EVENT_BACKWARDS}}
								@tone="warn"
								@row={{true}}
							/>
						{{/if}}
						{{#if this.eventPreview}}
							<CanonCodeBlock
								@code={{this.eventPreview}}
							/>
						{{/if}}
					{{else}}
						{{#each
							this.batchRows
							key="item.id"
							as |row|
						}}
							<div
								class="qr-batch-row"
							>
								<span
									class="qr-batch-index"
								>{{row.number}}</span>
								<CanonTextCell
									@value={{row.item.content}}
									@placeholder="Enter content..."
									@onChange={{fn
										this.updateBatchItem
										row.item
									}}
									aria-label="Batch content"
								/>
								<span
									class="qr-batch-state"
								>
									{{#if
										row.item.isDone
									}}
										<img
											class="qr-batch-thumb"
											src={{row.item.dataUrl}}
											alt=""
										/>
									{{else if
										row.item.isGenerating
									}}
										<CanonLoader
											@cell={{4}}
											@gap={{1}}
										/>
									{{else if
										row.item.isError
									}}
										<Icon
											class="qr-batch-error"
											@name="circle-alert"
										/>
									{{/if}}
								</span>
								<CanonButton
									@kind="cell"
									@icon={{Trash}}
									@label="Remove item"
									@onClick={{fn
										this.removeBatchItem
										row.item
									}}
								/>
							</div>
						{{/each}}
						<CanonGrid @columns={{2}}>
							<CanonButton
								@kind="cell"
								@text="Add Item"
								@icon={{Plus}}
								@onClick={{this.addBatchItem}}
							/>
							<CanonButton
								@kind="cell"
								@text="Upload List"
								@icon={{Upload}}
								@onClick={{this.chooseBatchList}}
							/>
						</CanonGrid>
						<input
							type="file"
							class="qr-hidden-input"
							accept=".txt,text/plain"
							aria-label="Upload List"
							tabindex="-1"
							{{this.keepBatchInput}}
							{{on
								"change"
								this.uploadBatchList
							}}
						/>
						<CanonStatus
							@text={{BATCH_HINT}}
							@tone="muted"
							@row={{true}}
						/>
						<CanonButton
							@kind="primary"
							@text={{BATCH_GENERATE}}
							@icon={{Download}}
							@disabled={{this.batchBusy}}
							@onClick={{this.generateBatch}}
						/>
					{{/if}}
					{{#if this.tooLong}}
						<CanonStatus
							@text={{TOO_LONG}}
							@tone="warn"
							@row={{true}}
						/>
					{{/if}}
				</CanonRows>

				<CanonRows @framed={{true}}>
					<CanonHeading @text="Presets" />
					<Swatches
						@items={{this.presetItems}}
						@selected={{this.presetIndex}}
						@label="Presets"
						@onChange={{this.pickPreset}}
					/>
					<CanonHeading @text="Dots" />
					<Swatches
						@items={{this.dotItems}}
						@selected={{this.dotIndex}}
						@label="Dots"
						@onChange={{this.pickDot}}
					/>
					<CanonHeading @text="Eyes" />
					<Swatches
						@items={{this.eyeItems}}
						@selected={{this.eyeIndex}}
						@label="Eyes"
						@onChange={{this.pickEye}}
					/>
					<CanonHeading @text="Pupils" />
					<Swatches
						@items={{this.pupilItems}}
						@selected={{this.pupilIndex}}
						@label="Pupils"
						@onChange={{this.pickPupil}}
					/>
				</CanonRows>

				<CanonRows @framed={{true}}>
					<CanonHeading @text="Logo" />
					{{#if this.logo}}
						<CanonRow
							@title="Logo"
							@detail={{this.logoText}}
							@form="flush"
						>
							<CanonButton
								@kind="cell"
								@text="Remove"
								@icon={{Remove}}
								@onClick={{this.removeLogo}}
							/>
						</CanonRow>
						<CanonRow
							@title="Logo Size"
							@form="flush"
							as |titleId|
						>
							<CanonSlider
								@value={{this.logoSize}}
								@min={{0.1}}
								@max={{0.5}}
								@step={{0.05}}
								@readout={{percent}}
								@labelledBy={{titleId}}
								@onChange={{this.setLogoSize}}
							/>
						</CanonRow>
						<CanonRow
							@title="Logo Margin"
							@form="flush"
							as |titleId|
						>
							<CanonNumberField
								@value={{this.logoMargin}}
								@min={{0}}
								@max={{20}}
								@unit="px"
								@labelledBy={{titleId}}
								@onChange={{this.setLogoMargin}}
							/>
						</CanonRow>
						<CanonStatus
							@text={{LOGO_TIP}}
							@tone="muted"
							@row={{true}}
						/>
					{{else}}
						<CanonDropZone
							@prompt={{LOGO_PROMPT}}
							@onFiles={{this.dropLogo}}
						/>
					{{/if}}
				</CanonRows>

				<CanonRows @framed={{true}}>
					<CanonHeading @text="Colours" />
					<CanonColourWell
						@label="Foreground"
						@colour={{this.foregroundRgb}}
						@onChange={{this.setForeground}}
					/>
					<div
						class="qr-background
							{{if
								this.transparent
								'qr-background--off'
							}}"
						inert={{this.transparent}}
					>
						<CanonColourWell
							@label="Background"
							@colour={{this.backgroundRgb}}
							@onChange={{this.setBackground}}
						/>
					</div>
					<CanonRow
						@title="Transparent"
						as |titleId|
					>
						<CanonSwitch
							@on={{this.transparent}}
							@onChange={{this.setTransparent}}
							aria-labelledby={{titleId}}
						/>
					</CanonRow>
					<CanonRow
						@title="Error Correction"
						@form="flush"
					>
						<CanonTooltip
							@text={{LEVEL_HINT}}
							as |tip|
						>
							<CanonButton
								{{tip.trigger}}
								@kind="cell"
								@icon={{Info}}
								@label="Error Correction"
							/>
						</CanonTooltip>
					</CanonRow>
					<CanonSegmented
						@items={{ERROR_TITLES}}
						@selected={{this.levelIndex}}
						@columns={{2}}
						@onChange={{this.setLevel}}
						aria-label="Error Correction"
					/>
					<CanonRow
						@title="Size"
						@form="flush"
						as |titleId|
					>
						<CanonNumberField
							@value={{this.size}}
							@min={{100}}
							@max={{600}}
							@step={{10}}
							@unit="px"
							@labelledBy={{titleId}}
							@onChange={{this.setSize}}
						/>
					</CanonRow>
					<CanonRow
						@title="Padding"
						@form="flush"
						as |titleId|
					>
						<CanonNumberField
							@value={{this.padding}}
							@min={{0}}
							@max={{10}}
							@labelledBy={{titleId}}
							@onChange={{this.setPadding}}
						/>
					</CanonRow>
					<CanonRow
						@title="Add information"
						as |titleId|
					>
						<CanonSwitch
							@on={{this.showInfo}}
							@onChange={{this.setShowInfo}}
							aria-labelledby={{titleId}}
						/>
					</CanonRow>
					{{#unless this.isBatch}}
						<CanonHeading @text="Code" />
						<CanonTiles
							@items={{this.tiles}}
						/>
						<CanonHeading @text="Format" />
						<CanonSegmented
							@items={{FORMATS}}
							@selected={{if
								this.isSvg
								1
								0
							}}
							@onChange={{this.setFormat}}
							aria-label="Format"
						/>
						<CanonGrid @columns={{2}}>
							<CanonButton
								@kind="secondary"
								@text="Copy"
								@icon={{Copy}}
								@disabled={{this.noCode}}
								@onClick={{this.copy}}
							/>
							<CanonButton
								@kind="primary"
								@text="Export"
								@icon={{Download}}
								@iconStyle="oversized"
								@disabled={{this.noCode}}
								@onClick={{this.export}}
							/>
						</CanonGrid>
					{{/unless}}
				</CanonRows>

				<CanonRows @framed={{true}}>
					<CanonHeading
						@text="About {{QR_INFO.name}}"
					/>
					<CanonValueLine
						@label="Invented by"
						@value={{QR_INFO.inventor}}
						@labelWidth={{96}}
					/>
					<CanonValueLine
						@label="Year"
						@value={{QR_INFO.year}}
						@labelWidth={{96}}
					/>
					<p
						class="qr-about-note"
					>{{QR_INFO.description}}</p>
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}
