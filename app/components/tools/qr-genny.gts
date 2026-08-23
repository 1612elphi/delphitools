import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { htmlSafe } from '@ember/template';
import { TrackedObject } from 'tracked-built-ins';
import Icon from 'delphitools-v2/components/icon';
import NdsLoader from 'delphitools-v2/components/ui/nds-loader';
import DownloadLabel from 'delphitools-v2/components/download-label';
import { downloadBlob } from 'delphitools-v2/lib/download';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import {
	Tabs,
	TabsList,
	TabsTrigger,
	TabsContent,
} from 'delphitools-v2/components/ui/tabs';
import {
	Select,
	SelectTrigger,
	SelectValue,
	SelectContent,
	SelectItem,
} from 'delphitools-v2/components/ui/select';
import {
	Tooltip,
	TooltipTrigger,
	TooltipContent,
} from 'delphitools-v2/components/ui/tooltip';
import type QRCodeStyling from 'qr-code-styling';
import type { Options as StylingOptions } from 'qr-code-styling';

/**
 * Same-colour outline on every filled shape: adjacent QR modules then
 * overlap by half the stroke, which closes the antialiasing seams
 * renderers draw between separate paths that only touch (Ruby 2026-08-23).
 */
export function sealSvgSeams(svg: string, strokeWidth = 0.5): string {
	const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
	if (doc.querySelector('parsererror')) return svg;
	for (const el of doc.querySelectorAll('[fill]')) {
		const fill = el.getAttribute('fill');
		if (!fill || fill === 'none' || el.hasAttribute('stroke'))
			continue;
		el.setAttribute('stroke', fill);
		el.setAttribute('stroke-width', String(strokeWidth));
	}
	return new XMLSerializer().serializeToString(doc);
}

type Mode = 'single' | 'wifi' | 'vcard' | 'batch';
type DotType =
	| 'square'
	| 'rounded'
	| 'dots'
	| 'classy'
	| 'classy-rounded'
	| 'extra-rounded';
type CornerSquareType = 'square' | 'dot' | 'extra-rounded';
type CornerDotType = 'square' | 'dot';
type ErrorLevel = 'L' | 'M' | 'Q' | 'H';
type SecurityType = 'nopass' | 'WPA' | 'WEP';

// Type aliases rather than interfaces: TrackedObject's parameter is constrained
// to Record<PropertyKey, unknown>, and only an alias gets an implicit index
// signature.
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

/** Regeneration is a full encode plus a PNG round trip, so typing debounces. */
const GENERATE_DEBOUNCE_MS = 300;
const URL_CHECK_MS = 500;
const COPY_RESET_MS = 1500;

const URL_LIKE = /^https?:\/\/.+/i;

/** Small PNG data URL for the omnibox QR preview. */
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
		return new Promise((resolve) => {
			const reader = new FileReader();
			reader.onloadend = () =>
				resolve(reader.result as string);
			reader.readAsDataURL(blob);
		});
	} catch {
		return null;
	}
}

const INFO_FONT =
	'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

const DOT_STYLES: { value: DotType; label: string }[] = [
	{ value: 'square', label: 'Boxy' },
	{ value: 'rounded', label: 'Bouba' },
	{ value: 'dots', label: 'Braille' },
	{ value: 'classy', label: 'Calligraph' },
	{ value: 'classy-rounded', label: 'Kiki' },
	{ value: 'extra-rounded', label: 'Blobby' },
];

const CORNER_SQUARE_STYLES: { value: CornerSquareType; label: string }[] = [
	{ value: 'square', label: 'Boxy' },
	{ value: 'dot', label: 'Circular' },
	{ value: 'extra-rounded', label: 'Rounded' },
];

const CORNER_DOT_STYLES: { value: CornerDotType; label: string }[] = [
	{ value: 'square', label: 'Square' },
	{ value: 'dot', label: 'Circle' },
];

const ERROR_LEVELS: ErrorLevel[] = ['L', 'M', 'Q', 'H'];

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

// Every string below is the Next app's wording, carried across unchanged.
const CHECKING_URL = 'Checking URL...';
const VALID_URL = 'Valid URL format';
const INVALID_URL = 'Invalid URL format';
const EMPTY_WIFI = 'Enter network details to generate QR code';
const EMPTY_VCARD = 'Fill in contact details to generate QR code';
const EMPTY_SINGLE = 'Enter content to generate QR code';

const QR_INFO = {
	name: 'QR Code',
	inventor: 'Masahiro Hara (Denso Wave)',
	year: '1994',
	description:
		'Quick Response code, originally for automotive tracking. Now ubiquitous for URLs, payments, and more.',
};

const XML_ESCAPES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	"'": '&apos;',
	'"': '&quot;',
};

function escapeXml(value: string): string {
	return value.replace(/[&<>'"]/g, (c) => XML_ESCAPES[c] ?? c);
}

/**
 * Word-wrap for the exported info block; hard-breaks words wider than the line
 * (long URLs) so text never overflows the QR width.
 */
export function wrapText(
	ctx: CanvasRenderingContext2D,
	text: string,
	maxWidth: number,
): string[] {
	const lines: string[] = [];
	let line = '';
	for (const word of text.split(/\s+/)) {
		let chunk = word;
		while (
			ctx.measureText(chunk).width > maxWidth &&
			chunk.length > 1
		) {
			let cut = chunk.length - 1;
			while (
				cut > 1 &&
				ctx.measureText(chunk.slice(0, cut)).width >
					maxWidth
			) {
				cut--;
			}
			if (line) {
				lines.push(line);
				line = '';
			}
			lines.push(chunk.slice(0, cut));
			chunk = chunk.slice(cut);
		}
		const tryLine = line ? `${line} ${chunk}` : chunk;
		if (!line || ctx.measureText(tryLine).width <= maxWidth) {
			line = tryLine;
		} else {
			lines.push(line);
			line = chunk;
		}
	}
	if (line) lines.push(line);
	return lines;
}

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

// The ZXing WIFI: spec requires escaping \ ; , " : — unescaped quotes make
// scanners treat the value as hex/quoted rather than literal text.
function escapeWifiValue(value: string): string {
	return value.replace(/[\\;,":]/g, '\\$&');
}

/**
 * Format: WIFI:T:{security};S:{ssid};P:{password};H:true;;
 *
 * Returns "" while the form is incomplete — a secured network without a
 * password would encode an unjoinable QR.
 */
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

function inputValue(event: Event): string {
	return (event.target as HTMLInputElement).value;
}

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

export default class QrGennyTool extends Component {
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
	@tracked logoSize = 0.3;
	@tracked logoMargin = 4;
	@tracked showInfo = false;
	@tracked qrDataUrl: string | null = null;
	@tracked generating = false;
	@tracked copied = false;
	@tracked logoDragging = false;
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

	wifi = new TrackedObject<WifiData>({
		ssid: '',
		password: '',
		securityType: 'nopass',
		isHidden: false,
	});

	#qr: QRCodeStyling | null = null;
	#generateTimer: ReturnType<typeof setTimeout> | null = null;
	#urlTimer: ReturnType<typeof setTimeout> | null = null;
	#copyTimer: ReturnType<typeof setTimeout> | null = null;
	#destroyed = false;
	/** A logo has to load before the encode finishes, so runs can overlap. */
	#runId = 0;

	willDestroy() {
		super.willDestroy();
		this.#destroyed = true;
		if (this.#generateTimer) clearTimeout(this.#generateTimer);
		if (this.#urlTimer) clearTimeout(this.#urlTimer);
		if (this.#copyTimer) clearTimeout(this.#copyTimer);
	}

	/* ── derived state ─────────────────────────────────────────────── */

	get isBatch() {
		return this.mode === 'batch';
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

	get securityLabel() {
		return (
			SECURITY_TYPES.find(
				(entry) =>
					entry.value === this.wifi.securityType,
			)?.label ?? ''
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
		if (this.mode === 'wifi') return wifiString(this.wifi);
		return this.content;
	}

	get emptyMessage() {
		if (this.mode === 'wifi') return EMPTY_WIFI;
		if (this.mode === 'vcard') return EMPTY_VCARD;
		return EMPTY_SINGLE;
	}

	/**
	 * A colour reaches the canvas, an SVG attribute and an inline style, so an
	 * unparseable value would either paint nothing or break out of the markup.
	 * The Next app interpolated the raw field.
	 */
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

	get backgroundField() {
		return this.transparent ? 'transparent' : this.background;
	}

	get previewStyle() {
		return htmlSafe(
			this.transparent
				? ''
				: `background-color: ${this.safeBackground}`,
		);
	}

	get foregroundSwatchStyle() {
		return htmlSafe(`background-color: ${this.safeForeground}`);
	}

	get backgroundSwatchStyle() {
		return htmlSafe(
			this.transparent
				? ''
				: `background-color: ${this.safeBackground}`,
		);
	}

	get infoStyle() {
		return htmlSafe(`color: ${this.safeForeground}`);
	}

	get urlClass() {
		if (this.urlChecking) return '';
		return this.urlValid ? 'is-valid' : 'is-invalid';
	}

	get logoPercent() {
		return Math.round(this.logoSize * 100);
	}

	get dotStyles() {
		return DOT_STYLES.map((style) => ({
			...style,
			isActive: style.value === this.dotType,
		}));
	}

	get cornerSquareStyles() {
		return CORNER_SQUARE_STYLES.map((style) => ({
			...style,
			isActive: style.value === this.cornerSquareType,
		}));
	}

	get cornerDotStyles() {
		return CORNER_DOT_STYLES.map((style) => ({
			...style,
			isActive: style.value === this.cornerDotType,
		}));
	}

	get errorLevels() {
		return ERROR_LEVELS.map((level) => ({
			level,
			isActive: level === this.errorCorrection,
		}));
	}

	quickStyles = QUICK_STYLES;
	presets = PRESETS;
	securityTypes = SECURITY_TYPES;
	qrInfo = QR_INFO;

	/**
	 * Plaintext details shown under the QR when "Add information" is on;
	 * entries without a label render as a bare line.
	 */
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
					label: 'Organization',
					value: this.vcard.organization,
				},
				{ label: 'Job Title', value: this.vcard.title },
				{ label: 'Email', value: this.vcard.email },
				{ label: 'Phone', value: this.vcard.phone },
				{ label: 'Website', value: this.vcard.website },
				{ label: 'Address', value: this.vcard.address },
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
		return this.showInfo && this.infoTexts.length > 0;
	}

	get noQr() {
		return this.qrDataUrl === null;
	}

	get batchRows() {
		return this.batchItems.map((item, index) => ({
			item,
			number: index + 1,
		}));
	}

	get batchBusy() {
		return this.batchGenerating || this.batchItems.length === 0;
	}

	/* ── generation ────────────────────────────────────────────────── */

	#styleOptions(data: string): StylingOptions {
		const options: StylingOptions = {
			width: this.size,
			height: this.size,
			type: 'svg',
			data,
			margin: this.padding * 4,
			qrOptions: {
				errorCorrectionLevel: this.errorCorrection,
			},
			dotsOptions: {
				type: this.dotType,
				color: this.safeForeground,
			},
			cornersSquareOptions: {
				type: this.cornerSquareType,
				color: this.safeForeground,
			},
			cornersDotOptions: {
				type: this.cornerDotType,
				color: this.safeForeground,
			},
			backgroundOptions: {
				color: this.transparent
					? 'transparent'
					: this.safeBackground,
			},
		};

		if (this.logo) {
			options.image = this.logo;
			options.imageOptions = {
				crossOrigin: 'anonymous',
				margin: this.logoMargin,
				imageSize: this.logoSize,
				hideBackgroundDots: true,
			};
		}

		return options;
	}

	queueGenerate = () => {
		if (this.#generateTimer) clearTimeout(this.#generateTimer);
		this.#generateTimer = setTimeout(
			() => void this.#generate(),
			GENERATE_DEBOUNCE_MS,
		);
	};

	async #generate() {
		const data = this.qrContent;
		if (!data.trim()) {
			this.qrDataUrl = null;
			this.#qr = null;
			return;
		}

		const run = ++this.#runId;
		this.generating = true;

		try {
			const { default: Styling } =
				await import('qr-code-styling');
			const qr = new Styling(this.#styleOptions(data));
			const blob = await qr.getRawData('png');
			if (this.#destroyed || run !== this.#runId) return;
			this.#qr = qr;
			this.qrDataUrl =
				blob instanceof Blob
					? await blobToDataUrl(blob)
					: null;
		} catch {
			// An unencodable payload (over capacity for the chosen level)
			// falls back to the empty state, as it does in the Next app.
			if (run === this.#runId) this.qrDataUrl = null;
		} finally {
			if (run === this.#runId) this.generating = false;
		}
	}

	#infoLayout(scale: number) {
		const ctx = document.createElement('canvas').getContext('2d');
		if (!ctx) return null;

		const fontSize =
			Math.max(13, Math.round(this.size * 0.055)) * scale;
		const lineHeight = Math.round(fontSize * 1.5);
		const maxWidth = this.size * 0.88 * scale;
		ctx.font = `500 ${fontSize}px ${INFO_FONT}`;
		const lines = this.infoTexts.flatMap((text) =>
			wrapText(ctx, text, maxWidth),
		);

		return {
			fontSize,
			lineHeight,
			lines,
			blockHeight: lines.length * lineHeight + fontSize,
		};
	}

	async #composeInfoPng(): Promise<Blob | null> {
		const qr = this.#qr;
		if (!qr) return null;
		const raw = await qr.getRawData('png');
		if (!(raw instanceof Blob)) return null;

		const bitmap = await createImageBitmap(raw);
		const layout = this.#infoLayout(bitmap.width / this.size);
		if (!layout) return null;

		const canvas = document.createElement('canvas');
		canvas.width = bitmap.width;
		canvas.height = bitmap.height + layout.blockHeight;
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;

		if (!this.transparent) {
			ctx.fillStyle = this.safeBackground;
			ctx.fillRect(0, 0, canvas.width, canvas.height);
		}
		ctx.drawImage(bitmap, 0, 0);
		ctx.fillStyle = this.safeForeground;
		ctx.font = `500 ${layout.fontSize}px ${INFO_FONT}`;
		ctx.textAlign = 'center';
		layout.lines.forEach((line, i) => {
			ctx.fillText(
				line,
				canvas.width / 2,
				bitmap.height + (i + 0.75) * layout.lineHeight,
			);
		});

		return new Promise((resolve) =>
			canvas.toBlob(resolve, 'image/png'),
		);
	}

	async #composeInfoSvg(): Promise<Blob | null> {
		const qr = this.#qr;
		if (!qr) return null;
		const raw = await qr.getRawData('svg');
		if (!(raw instanceof Blob)) return null;

		const qrSvg = sealSvgSeams(
			(await raw.text()).replace(/<\?xml[^?]*\?>/, ''),
		);
		const layout = this.#infoLayout(1);
		if (!layout) return null;

		const totalHeight = this.size + layout.blockHeight;
		const background = this.transparent
			? ''
			: `<rect width="100%" height="100%" fill="${this.safeBackground}"/>`;
		const text = layout.lines
			.map(
				(line, i) =>
					`<text x="${this.size / 2}" y="${this.size + (i + 0.75) * layout.lineHeight}" text-anchor="middle" fill="${this.safeForeground}" font-family='${INFO_FONT}' font-size="${layout.fontSize}" font-weight="500">${escapeXml(line)}</text>`,
			)
			.join('');

		return new Blob(
			[
				`<svg xmlns="http://www.w3.org/2000/svg" width="${this.size}" height="${totalHeight}" viewBox="0 0 ${this.size} ${totalHeight}">${background}${qrSvg}${text}</svg>`,
			],
			{ type: 'image/svg+xml' },
		);
	}

	/* ── actions ───────────────────────────────────────────────────── */

	setMode = (mode: string) => {
		this.mode = mode as Mode;
		this.queueGenerate();
	};

	setContent = (event: Event) => {
		this.content = inputValue(event);
		this.queueGenerate();
		this.#queueUrlCheck();
	};

	usePreset = (preset: { value: string }) => {
		this.content = preset.value;
		this.queueGenerate();
		this.#queueUrlCheck();
	};

	setVcard = (field: keyof VCardData, event: Event) => {
		this.vcard[field] = inputValue(event);
		this.queueGenerate();
	};

	setWifiText = (field: 'ssid' | 'password', event: Event) => {
		this.wifi[field] = inputValue(event);
		this.queueGenerate();
	};

	setSecurityType = (value: string) => {
		this.wifi.securityType = value as SecurityType;
		this.queueGenerate();
	};

	toggleHidden = (event: Event) => {
		this.wifi.isHidden = (event.target as HTMLInputElement).checked;
		this.queueGenerate();
	};

	togglePassword = () => {
		this.showPassword = !this.showPassword;
	};

	setSize = (event: Event) => {
		this.size = Number(inputValue(event));
		this.queueGenerate();
	};

	setPadding = (event: Event) => {
		this.padding = Number(inputValue(event));
		this.queueGenerate();
	};

	setErrorCorrection = (level: ErrorLevel) => {
		this.errorCorrection = level;
		this.queueGenerate();
	};

	setForeground = (event: Event) => {
		this.foreground = inputValue(event);
		this.queueGenerate();
	};

	setBackground = (event: Event) => {
		this.background = inputValue(event);
		this.queueGenerate();
	};

	toggleTransparent = (event: Event) => {
		this.transparent = (event.target as HTMLInputElement).checked;
		this.queueGenerate();
	};

	setDotType = (value: DotType) => {
		this.dotType = value;
		this.queueGenerate();
	};

	setCornerSquareType = (value: CornerSquareType) => {
		this.cornerSquareType = value;
		this.queueGenerate();
	};

	setCornerDotType = (value: CornerDotType) => {
		this.cornerDotType = value;
		this.queueGenerate();
	};

	applyQuickStyle = (style: QuickStyle) => {
		this.dotType = style.dotType;
		this.cornerSquareType = style.cornerSquareType;
		this.cornerDotType = style.cornerDotType;
		this.foreground = style.foreground;
		this.background = style.background;
		this.queueGenerate();
	};

	toggleShowInfo = (event: Event) => {
		this.showInfo = (event.target as HTMLInputElement).checked;
	};

	#queueUrlCheck() {
		if (this.#urlTimer) clearTimeout(this.#urlTimer);

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

		this.#urlTimer = setTimeout(() => {
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

	/* ── logo ──────────────────────────────────────────────────────── */

	readLogo = (file: File) => {
		if (!file.type.startsWith('image/')) return;
		const reader = new FileReader();
		reader.onload = () => {
			if (this.#destroyed) return;
			this.logo = reader.result as string;
			this.queueGenerate();
		};
		reader.readAsDataURL(file);
	};

	selectLogo = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) this.readLogo(file);
		// Choosing the same file twice must still fire a change event.
		input.value = '';
	};

	dropLogo = (event: DragEvent) => {
		event.preventDefault();
		this.logoDragging = false;
		const file = event.dataTransfer?.files[0];
		if (file) this.readLogo(file);
	};

	// Without this the browser navigates to the dropped file instead.
	// dragover fires continuously, and a tracked write dirties its tag even when
	// the value is unchanged, so the flag is only set on the first one.
	allowDrop = (event: DragEvent) => {
		event.preventDefault();
		if (!this.logoDragging) this.logoDragging = true;
	};

	endDrag = (event: DragEvent) => {
		event.preventDefault();
		this.logoDragging = false;
	};

	removeLogo = () => {
		this.logo = null;
		this.queueGenerate();
	};

	setLogoSize = (event: Event) => {
		this.logoSize = Number(inputValue(event));
		this.queueGenerate();
	};

	setLogoMargin = (event: Event) => {
		this.logoMargin = Number(inputValue(event));
		this.queueGenerate();
	};

	/* ── export ────────────────────────────────────────────────────── */

	download = (format: 'png' | 'svg') => {
		void this.#download(format);
	};

	async #download(format: 'png' | 'svg') {
		const qr = this.#qr;
		if (!qr) return;

		const filename = `qr-code-${Date.now()}`;
		if (!this.includeInfo) {
			const raw = await qr.getRawData(format);
			if (raw === null) return;
			if (format === 'svg') {
				// qr-code-styling resolves a string in some versions
				const svg =
					raw instanceof Blob
						? await raw.text()
						: String(raw);
				downloadBlob(
					new Blob([sealSvgSeams(svg)], {
						type: 'image/svg+xml',
					}),
					`${filename}.svg`,
				);
				return;
			}
			const file =
				raw instanceof Blob
					? raw
					: new Blob(
							[
								raw as unknown as BlobPart,
							],
							{
								type: 'image/png',
							},
						);
			downloadBlob(file, `${filename}.png`);
			return;
		}

		const blob =
			format === 'png'
				? await this.#composeInfoPng()
				: await this.#composeInfoSvg();
		if (blob) downloadBlob(blob, `${filename}.${format}`);
	}

	copy = () => {
		void this.#copy();
	};

	async #copy() {
		if (!this.qrDataUrl) return;
		try {
			const blob = this.includeInfo
				? await this.#composeInfoPng()
				: await (await fetch(this.qrDataUrl)).blob();
			if (!blob) return;
			await navigator.clipboard.write([
				new ClipboardItem({ 'image/png': blob }),
			]);
			if (this.#destroyed) return;
			this.copied = true;
			this.#copyTimer = setTimeout(() => {
				this.copied = false;
			}, COPY_RESET_MS);
		} catch {
			// A denied clipboard permission leaves the button as it was.
		}
	}

	/* ── batch ─────────────────────────────────────────────────────── */

	addBatchItem = () => {
		this.batchItems = [...this.batchItems, new BatchItem('')];
	};

	removeBatchItem = (item: BatchItem) => {
		this.batchItems = this.batchItems.filter(
			(other) => other !== item,
		);
	};

	updateBatchItem = (item: BatchItem, event: Event) => {
		item.content = inputValue(event);
	};

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

	generateBatch = () => {
		void this.#generateBatch();
	};

	async #generateBatch() {
		if (this.batchItems.length === 0) return;
		this.batchGenerating = true;

		const [{ default: Styling }, { default: JSZip }] =
			await Promise.all([
				import('qr-code-styling'),
				import('jszip'),
			]);
		if (this.#destroyed) return;

		const zip = new JSZip();

		for (const item of this.batchItems) {
			if (this.#destroyed) return;
			if (!item.content.trim()) continue;

			item.status = 'generating';
			try {
				const qr = new Styling(
					this.#styleOptions(item.content),
				);
				const blob = await qr.getRawData('png');
				if (this.#destroyed) return;
				if (!(blob instanceof Blob)) continue;

				const safeName = item.content
					.slice(0, 30)
					.replace(/[^a-zA-Z0-9]/g, '_');
				zip.file(`qr-${safeName}.png`, blob);
				item.dataUrl = await blobToDataUrl(blob);
				item.status = 'done';
			} catch {
				// One unencodable payload must not abort the rest.
				item.status = 'error';
			}
		}

		const archive = await zip.generateAsync({ type: 'blob' });
		if (this.#destroyed) return;
		downloadBlob(archive, `qr-codes-batch-${Date.now()}.zip`);
		this.batchGenerating = false;
	}

	<template>
		<div class="dt-qr" {{filePaste this.readLogo accept="image/*"}}>
			<Tabs
				@value={{this.mode}}
				@onValueChange={{this.setMode}}
			>
				<TabsList class="dt-qr-tabs">
					<TabsTrigger
						class="dt-qr-tab"
						@value="single"
					>Single</TabsTrigger>
					<TabsTrigger
						class="dt-qr-tab"
						@value="wifi"
					>WiFi QR</TabsTrigger>
					<TabsTrigger
						class="dt-qr-tab"
						@value="vcard"
					>vCard Builder</TabsTrigger>
					<TabsTrigger
						class="dt-qr-tab"
						@value="batch"
					>Batch Mode</TabsTrigger>
				</TabsList>

				<div class="dt-qr-frame">
					<TabsContent
						class="dt-qr-panel"
						@value="single"
					>
						<div class="dt-qr-field">
							<div
								class="dt-qr-field-head"
							>
								<span
									class="dt-qr-label"
								>Content</span>
								{{#if
									this.urlMessage
								}}
									<span
										class="dt-qr-url
											{{this.urlClass}}"
									>
										{{#if
											this.urlChecking
										}}
											<NdsLoader
											/>
										{{else if
											this.urlValid
										}}
											<Icon
												@name="circle-check-big"
											/>
										{{else}}
											<Icon
												@name="circle-alert"
											/>
										{{/if}}
										{{this.urlMessage}}
									</span>
								{{/if}}
							</div>
							{{! wording carried over from the Next app }}
							<textarea
								class="dt-qr-textarea"
								placeholder="Enter URL, text, or data..."
								aria-label="Content"
								value={{this.content}}
								{{on
									"input"
									this.setContent
								}}
							></textarea>
						</div>
						<div
							class="segmented dt-qr-presets"
						>
							{{#each
								this.presets
								key="label"
								as |preset|
							}}
								<button
									type="button"
									class="dt-qr-chip"
									{{on
										"click"
										(fn
											this.usePreset
											preset
										)
									}}
								>{{preset.label}}</button>
							{{/each}}
						</div>
					</TabsContent>

					<TabsContent
						class="dt-qr-panel"
						@value="wifi"
					>
						<div class="dt-qr-field">
							{{! wording carried over from the Next app }}
							<label
								class="dt-qr-label"
								for="dt-qr-ssid"
							>Network Name (SSID)</label>
							{{! wording carried over from the Next app }}
							<input
								id="dt-qr-ssid"
								class="dt-qr-input"
								type="text"
								placeholder="My WiFi Network"
								value={{this.wifi.ssid}}
								{{on
									"input"
									(fn
										this.setWifiText
										"ssid"
									)
								}}
							/>
						</div>

						<div class="dt-qr-pair">
							<div
								class="dt-qr-field"
							>
								<span
									class="dt-qr-label"
								>Security Type</span>
								<Select
									@value={{this.wifi.securityType}}
									@onValueChange={{this.setSecurityType}}
								>
									<SelectTrigger
										aria-label="Security Type"
									>
										<SelectValue
										>{{this.securityLabel}}</SelectValue>
									</SelectTrigger>
									<SelectContent
									>
										{{#each
											this.securityTypes
											key="value"
											as |type|
										}}
											<SelectItem
												@value={{type.value}}
											>{{type.label}}</SelectItem>
										{{/each}}
									</SelectContent>
								</Select>
							</div>

							<div
								class="dt-qr-field"
							>
								<label
									class="dt-qr-label"
									for="dt-qr-password"
								>Password</label>
								<div
									class="dt-qr-password"
								>
									{{! wording carried over from the Next app }}
									<input
										id="dt-qr-password"
										class="dt-qr-input"
										type={{this.passwordType}}
										autocomplete="off"
										disabled={{this.isOpenNetwork}}
										placeholder={{if
											this.isSecured
											"Enter WiFi password"
											"Open network"
										}}
										value={{if
											this.isSecured
											this.wifi.password
											""
										}}
										{{on
											"input"
											(fn
												this.setWifiText
												"password"
											)
										}}
									/>
									{{#if
										this.isSecured
									}}
										<button
											type="button"
											class="dt-qr-peek"
											aria-label={{if
												this.showPassword
												"Hide password"
												"Show password"
											}}
											{{on
												"click"
												this.togglePassword
											}}
										>
											<Icon
												@name={{if
													this.showPassword
													"eye-off"
													"eye"
												}}
											/>
										</button>
									{{/if}}
								</div>
								{{#if
									this.wifiNeedsPassword
								}}
									{{! wording carried over from the Next app }}
									<p
										class="dt-qr-hint"
									>Enter
										the
										password
										to
										generate
										the
										QR
										code.</p>
								{{/if}}
							</div>
						</div>

						<label class="dt-qr-switch-row">
							<span>
								<span
									class="dt-qr-label"
								>Hidden network</span>
								{{! wording carried over from the Next app }}
								<span
									class="dt-qr-hint"
								>For networks
									that
									don't
									broadcast
									their
									SSID.</span>
							</span>
							<input
								class="dt-qr-switch"
								type="checkbox"
								checked={{this.wifi.isHidden}}
								{{on
									"change"
									this.toggleHidden
								}}
							/>
						</label>
					</TabsContent>

					<TabsContent
						class="dt-qr-panel"
						@value="vcard"
					>
						<div class="dt-qr-pair">
							<div
								class="dt-qr-field"
							>
								<label
									class="dt-qr-label"
									for="dt-qr-first"
								>First Name</label>
								<input
									id="dt-qr-first"
									class="dt-qr-input"
									type="text"
									placeholder="John"
									value={{this.vcard.firstName}}
									{{on
										"input"
										(fn
											this.setVcard
											"firstName"
										)
									}}
								/>
							</div>
							<div
								class="dt-qr-field"
							>
								<label
									class="dt-qr-label"
									for="dt-qr-last"
								>Last Name</label>
								<input
									id="dt-qr-last"
									class="dt-qr-input"
									type="text"
									placeholder="Doe"
									value={{this.vcard.lastName}}
									{{on
										"input"
										(fn
											this.setVcard
											"lastName"
										)
									}}
								/>
							</div>
							<div
								class="dt-qr-field"
							>
								<label
									class="dt-qr-label"
									for="dt-qr-org"
								>Organization</label>
								<input
									id="dt-qr-org"
									class="dt-qr-input"
									type="text"
									placeholder="Acme Inc."
									value={{this.vcard.organization}}
									{{on
										"input"
										(fn
											this.setVcard
											"organization"
										)
									}}
								/>
							</div>
							<div
								class="dt-qr-field"
							>
								<label
									class="dt-qr-label"
									for="dt-qr-title"
								>Job Title</label>
								{{! wording carried over from the Next app }}
								<input
									id="dt-qr-title"
									class="dt-qr-input"
									type="text"
									placeholder="Software Engineer"
									value={{this.vcard.title}}
									{{on
										"input"
										(fn
											this.setVcard
											"title"
										)
									}}
								/>
							</div>
							<div
								class="dt-qr-field"
							>
								<label
									class="dt-qr-label"
									for="dt-qr-email"
								>Email</label>
								<input
									id="dt-qr-email"
									class="dt-qr-input"
									type="email"
									placeholder="john@example.com"
									value={{this.vcard.email}}
									{{on
										"input"
										(fn
											this.setVcard
											"email"
										)
									}}
								/>
							</div>
							<div
								class="dt-qr-field"
							>
								<label
									class="dt-qr-label"
									for="dt-qr-phone"
								>Phone</label>
								<input
									id="dt-qr-phone"
									class="dt-qr-input"
									type="tel"
									placeholder="+1 234 567 8900"
									value={{this.vcard.phone}}
									{{on
										"input"
										(fn
											this.setVcard
											"phone"
										)
									}}
								/>
							</div>
							<div
								class="dt-qr-field"
							>
								<label
									class="dt-qr-label"
									for="dt-qr-website"
								>Website</label>
								<input
									id="dt-qr-website"
									class="dt-qr-input"
									type="url"
									placeholder="https://example.com"
									value={{this.vcard.website}}
									{{on
										"input"
										(fn
											this.setVcard
											"website"
										)
									}}
								/>
							</div>
							<div
								class="dt-qr-field"
							>
								<label
									class="dt-qr-label"
									for="dt-qr-address"
								>Address</label>
								{{! wording carried over from the Next app }}
								<input
									id="dt-qr-address"
									class="dt-qr-input"
									type="text"
									placeholder="123 Main St, City"
									value={{this.vcard.address}}
									{{on
										"input"
										(fn
											this.setVcard
											"address"
										)
									}}
								/>
							</div>
						</div>
						{{#if this.hasName}}
							<pre
								class="dt-qr-vcard"
							>{{this.vcardPreview}}</pre>
						{{/if}}
					</TabsContent>

					<TabsContent
						class="dt-qr-panel"
						@value="batch"
					>
						{{#each
							this.batchRows
							key="item.id"
							as |row|
						}}
							<div
								class="dt-qr-batch-row"
							>
								<span
									class="dt-qr-batch-index"
								>{{row.number}}.</span>
								{{! wording carried over from the Next app }}
								<input
									class="dt-qr-input"
									type="text"
									placeholder="Enter content..."
									aria-label="Batch content"
									value={{row.item.content}}
									{{on
										"input"
										(fn
											this.updateBatchItem
											row.item
										)
									}}
								/>
								{{#if
									row.item.isDone
								}}
									<img
										class="dt-qr-batch-thumb"
										src={{row.item.dataUrl}}
										alt=""
									/>
								{{else if
									row.item.isGenerating
								}}
									<NdsLoader
									/>
								{{else if
									row.item.isError
								}}
									<Icon
										class="dt-qr-batch-error"
										@name="circle-alert"
									/>
								{{/if}}
								<button
									type="button"
									class="dt-qr-icon-btn"
									aria-label="Remove item"
									{{on
										"click"
										(fn
											this.removeBatchItem
											row.item
										)
									}}
								>
									<Icon
										@name="trash-2"
									/>
								</button>
							</div>
						{{/each}}

						<div
							class="dt-qr-batch-actions"
						>
							<button
								type="button"
								class="dt-qr-btn"
								{{on
									"click"
									this.addBatchItem
								}}
							>
								<Icon
									@name="plus"
								/>
								Add Item
							</button>
							<label
								class="dt-qr-btn"
							>
								<input
									type="file"
									class="dt-sr-only"
									accept=".txt,text/plain"
									{{on
										"change"
										this.uploadBatchList
									}}
								/>
								<Icon
									@name="upload"
								/>
								Upload List
							</label>
						</div>

						{{! wording carried over from the Next app }}
						<p class="dt-qr-hint">Insert
							your data manually or
							upload a text file with
							one QR code content per
							line</p>

						<button
							type="button"
							class="dt-qr-btn is-primary is-block"
							disabled={{this.batchBusy}}
							{{on
								"click"
								this.generateBatch
							}}
						>
							<DownloadLabel
								@label="Generate & Download ZIP"
								@busy={{this.batchGenerating}}
							/>
						</button>
					</TabsContent>

					{{#unless this.isBatch}}
						<div class="dt-qr-main">
							<div class="dt-qr-side">
								<div
									class="dt-qr-side-head"
								>
									<span
										class="dt-qr-heading"
									>Preview</span>
									<label
										class="dt-qr-toggle"
									>
										<input
											class="dt-qr-switch"
											type="checkbox"
											checked={{this.showInfo}}
											{{on
												"change"
												this.toggleShowInfo
											}}
										/>
										Add
										information
									</label>
								</div>

								<div
									class="dt-qr-preview
										{{if
											this.transparent
											'is-checkered'
										}}"
									style={{this.previewStyle}}
								>
									{{#if
										this.generating
									}}
										<NdsLoader
											class="dt-qr-spinner is-large is-stage"
										/>
									{{else if
										this.qrDataUrl
									}}
										<div
											class="dt-qr-stack"
										>
											<img
												class="dt-qr-image"
												src={{this.qrDataUrl}}
												alt="QR Code"
												width={{this.size}}
												height={{this.size}}
											/>
											{{#if
												this.includeInfo
											}}
												<div
													class="dt-qr-info"
													style={{this.infoStyle}}
												>
													{{#each
														this.infoTexts
														key="@index"
														as |text|
													}}
														<p
														>{{text}}</p>
													{{/each}}
												</div>
											{{/if}}
										</div>
									{{else}}
										<p
											class="dt-qr-empty"
										>{{this.emptyMessage}}</p>
									{{/if}}
								</div>

								<div
									class="dt-qr-section"
								>
									<span
										class="dt-qr-label is-muted"
									>Quick
										Styles</span>
									<div
										class="segmented dt-qr-quick"
									>
										{{#each
											this.quickStyles
											key="label"
											as |style|
										}}
											<button
												type="button"
												class="dt-qr-chip"
												{{on
													"click"
													(fn
														this.applyQuickStyle
														style
													)
												}}
											>{{style.label}}</button>
										{{/each}}
									</div>
								</div>

								<div
									class="segmented dt-qr-exports"
								>
									<button
										type="button"
										class="dt-qr-export is-primary"
										disabled={{this.noQr}}
										{{on
											"click"
											(fn
												this.download
												"png"
											)
										}}
									>
										<DownloadLabel
											@label="PNG"
										/>
									</button>
									<button
										type="button"
										class="dt-qr-export"
										disabled={{this.noQr}}
										{{on
											"click"
											(fn
												this.download
												"svg"
											)
										}}
									>
										<DownloadLabel
											@label="SVG"
										/>
									</button>
									<button
										type="button"
										class="dt-qr-export"
										disabled={{this.noQr}}
										{{on
											"click"
											this.copy
										}}
									>
										{{#if
											this.copied
										}}
											<Icon
												@name="check"
											/>
											Copied!
										{{else}}
											<Icon
												@name="copy"
											/>
											Copy
										{{/if}}
									</button>
								</div>
							</div>

							<div class="dt-qr-side">
								{{! no-nested-interactive counts <details> itself as
										interactive, so every control in the options
										accordion trips it. Only <summary> is
										interactive; the rest of the subtree is a plain
										container. }}
								{{! template-lint-disable no-nested-interactive }}
								<span
									class="dt-qr-heading"
								>Options</span>

								<details
									class="dt-qr-group"
									open
								>
									<summary
									>Basics</summary>
									<div
										class="dt-qr-group-body"
									>
										<div
											class="dt-qr-slider"
										>
											<label
												for="dt-qr-size"
											>Size</label>
											<span
												class="dt-qr-readout"
											>{{this.size}}px</span>
											<input
												id="dt-qr-size"
												type="range"
												min="100"
												max="600"
												step="10"
												value={{this.size}}
												{{on
													"input"
													this.setSize
												}}
											/>
										</div>

										<div
											class="dt-qr-slider"
										>
											<label
												for="dt-qr-padding"
											>Padding</label>
											<span
												class="dt-qr-readout"
											>{{this.padding}}</span>
											<input
												id="dt-qr-padding"
												type="range"
												min="0"
												max="10"
												step="1"
												value={{this.padding}}
												{{on
													"input"
													this.setPadding
												}}
											/>
										</div>

										<div
											class="dt-qr-section"
										>
											<span
												class="dt-qr-label-row"
											>
												<span
													class="dt-qr-label"
												>Error
													Correction</span>
												<Tooltip
												>
													<TooltipTrigger
													>
														<Icon
															class="dt-qr-info-icon"
															@name="info"
														/>
													</TooltipTrigger>
													{{! wording carried over from the Next app }}
													<TooltipContent
														@class="dt-qr-tip"
													>Higher
														error
														correction
														allows
														the
														QR
														code
														to
														be
														readable
														even
														if
														partially
														damaged
														or
														obscured
														(e.g.,
														by
														a
														logo).</TooltipContent>
												</Tooltip>
											</span>
											<div
												class="segmented dt-qr-levels"
											>
												{{#each
													this.errorLevels
													key="level"
													as |entry|
												}}
													<button
														type="button"
														class="dt-qr-chip
															{{if
																entry.isActive
																'is-active'
															}}"
														{{on
															"click"
															(fn
																this.setErrorCorrection
																entry.level
															)
														}}
													>{{entry.level}}</button>
												{{/each}}
											</div>
										</div>
									</div>
								</details>

								<details
									class="dt-qr-group"
								>
									<summary
									>Colours</summary>
									<div
										class="dt-qr-group-body is-flush"
									>
										<div
											class="dt-qr-colour"
										>
											<span
												class="dt-qr-colour-name"
											>Foreground</span>
											<span
												class="dt-qr-swatch"
											>
												<span
													class="dt-qr-swatch-face"
													style={{this.foregroundSwatchStyle}}
													aria-hidden="true"
												></span>
												<input
													type="color"
													aria-label="Foreground colour"
													value={{this.safeForeground}}
													{{on
														"input"
														this.setForeground
													}}
												/>
											</span>
											<input
												class="dt-qr-colour-field"
												type="text"
												aria-label="Foreground colour value"
												value={{this.foreground}}
												{{on
													"input"
													this.setForeground
												}}
											/>
										</div>

										<div
											class="dt-qr-colour"
										>
											<span
												class="dt-qr-colour-name"
											>Background</span>
											<span
												class="dt-qr-swatch
													{{if
														this.transparent
														'is-checkered'
													}}"
											>
												<span
													class="dt-qr-swatch-face"
													style={{this.backgroundSwatchStyle}}
													aria-hidden="true"
												></span>
												<input
													type="color"
													aria-label="Background colour"
													disabled={{this.transparent}}
													value={{this.safeBackground}}
													{{on
														"input"
														this.setBackground
													}}
												/>
											</span>
											<input
												class="dt-qr-colour-field"
												type="text"
												aria-label="Background colour value"
												disabled={{this.transparent}}
												value={{this.backgroundField}}
												{{on
													"input"
													this.setBackground
												}}
											/>
											<label
												class="dt-qr-toggle"
											>
												<input
													class="dt-qr-switch"
													type="checkbox"
													checked={{this.transparent}}
													{{on
														"change"
														this.toggleTransparent
													}}
												/>
												Transparent
											</label>
										</div>
									</div>
								</details>

								<details
									class="dt-qr-group"
									open
								>
									<summary
									>Shapes</summary>
									<div
										class="dt-qr-group-body"
									>
										<div
											class="dt-qr-section"
										>
											<span
												class="dt-qr-label"
											>Bit
												Style</span>
											<div
												class="segmented dt-qr-shapes"
											>
												{{#each
													this.dotStyles
													key="value"
													as |style|
												}}
													<button
														type="button"
														class="dt-qr-chip
															{{if
																style.isActive
																'is-active'
															}}"
														{{on
															"click"
															(fn
																this.setDotType
																style.value
															)
														}}
													>{{style.label}}</button>
												{{/each}}
											</div>
										</div>

										<div
											class="dt-qr-section"
										>
											<span
												class="dt-qr-label"
											>Eyes</span>
											<div
												class="segmented dt-qr-shapes"
											>
												{{#each
													this.cornerSquareStyles
													key="value"
													as |style|
												}}
													<button
														type="button"
														class="dt-qr-chip
															{{if
																style.isActive
																'is-active'
															}}"
														{{on
															"click"
															(fn
																this.setCornerSquareType
																style.value
															)
														}}
													>{{style.label}}</button>
												{{/each}}
											</div>
										</div>

										<div
											class="dt-qr-section"
										>
											<span
												class="dt-qr-label"
											>Pupils</span>
											<div
												class="segmented dt-qr-pupils"
											>
												{{#each
													this.cornerDotStyles
													key="value"
													as |style|
												}}
													<button
														type="button"
														class="dt-qr-chip
															{{if
																style.isActive
																'is-active'
															}}"
														{{on
															"click"
															(fn
																this.setCornerDotType
																style.value
															)
														}}
													>{{style.label}}</button>
												{{/each}}
											</div>
										</div>
									</div>
								</details>

								<details
									class="dt-qr-group"
								>
									<summary
									>Logo /
										Image</summary>
									<div
										class="dt-qr-group-body"
									>
										{{#if
											this.logo
										}}
											<div
												class="dt-qr-logo-row"
											>
												<img
													class="dt-qr-logo"
													src={{this.logo}}
													alt=""
												/>
												<button
													type="button"
													class="dt-qr-btn"
													{{on
														"click"
														this.removeLogo
													}}
												>
													<Icon
														@name="x"
													/>
													Remove
												</button>
											</div>

											<div
												class="dt-qr-slider"
											>
												<label
													for="dt-qr-logo-size"
												>Logo
													Size</label>
												<span
													class="dt-qr-readout"
												>{{this.logoPercent}}%</span>
												<input
													id="dt-qr-logo-size"
													type="range"
													min="0.1"
													max="0.5"
													step="0.05"
													value={{this.logoSize}}
													{{on
														"input"
														this.setLogoSize
													}}
												/>
											</div>

											<div
												class="dt-qr-slider"
											>
												<label
													for="dt-qr-logo-margin"
												>Logo
													Margin</label>
												<span
													class="dt-qr-readout"
												>{{this.logoMargin}}px</span>
												<input
													id="dt-qr-logo-margin"
													type="range"
													min="0"
													max="20"
													step="1"
													value={{this.logoMargin}}
													{{on
														"input"
														this.setLogoMargin
													}}
												/>
											</div>

											{{! wording carried over from the Next app }}
											<p
												class="dt-qr-hint"
											>Tip:
												Use
												High
												(H)
												error
												correction
												when
												adding
												a
												logo
												to
												ensure
												the
												QR
												code
												remains
												scannable.</p>
										{{else}}
											<label
												class="dt-qr-drop
													{{if
														this.logoDragging
														'is-dragging'
													}}"
												{{on
													"drop"
													this.dropLogo
												}}
												{{on
													"dragover"
													this.allowDrop
												}}
												{{on
													"dragleave"
													this.endDrag
												}}
											>
												<input
													type="file"
													class="dt-sr-only"
													accept="image/*"
													{{on
														"change"
														this.selectLogo
													}}
												/>
												<Icon
													@name="upload"
												/>
												{{! wording carried over from the Next app }}
												<span
												>{{if
														this.logoDragging
														"Drop image here"
														"Drop, click, or paste"
													}}</span>
											</label>
										{{/if}}
									</div>
								</details>
							</div>
						</div>
					{{/unless}}
				</div>
			</Tabs>

			<div class="dt-qr-about">
				<div class="dt-qr-about-head">
					<Icon @name="info" />
					<h3>About {{this.qrInfo.name}}</h3>
				</div>
				<p><span class="dt-qr-about-key">Invented by:</span>
					{{this.qrInfo.inventor}}</p>
				<p><span class="dt-qr-about-key">Year:</span>
					{{this.qrInfo.year}}</p>
				{{! wording carried over from the Next app }}
				<p
					class="dt-qr-about-note"
				>{{this.qrInfo.description}}</p>
			</div>
		</div>
	</template>
}
