import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { modifier } from 'ember-modifier';
import Icon from 'delphitools-v2/components/icon';
import NdsLoader from 'delphitools-v2/components/ui/nds-loader';
import { getPdfJs, loadPdfDocument } from 'delphitools-v2/lib/pdfjs';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import { downloadBlob } from 'delphitools-v2/lib/download';
import { downloadIcon, passAlong } from 'delphitools-v2/lib/flow-hooks';
import type {
	PDFArray,
	PDFContext,
	PDFDict,
	PDFDocument,
	PDFObject,
} from 'pdf-lib';
import type { PDFDocumentProxy } from 'pdfjs-dist';

type PdfLib = typeof import('pdf-lib');

const ACCEPT = '.pdf,application/pdf';

/** in css px */
const PREVIEW_WIDTH = 600;

const IMAGE_OBJECT_TIMEOUT_MS = 500;

/** 3mm bleed, in points */
const MIN_BLEED_PT = 8.5;

type Severity = 'error' | 'warning' | 'info';

type CheckCategory =
	| 'document'
	| 'geometry'
	| 'fonts'
	| 'colour'
	| 'images'
	| 'transparency';

interface PreflightIssue {
	severity: Severity;
	category: CheckCategory;
	message: string;
	page?: number;
	details?: string;
}

interface PageBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

interface PageInfo {
	number: number;
	width: number;
	height: number;
	mediaBox: PageBox;
	trimBox?: PageBox;
	bleedBox?: PageBox;
	cropBox?: PageBox;
}

interface FontInfo {
	name: string;
	embedded: boolean;
	type?: string;
	/** font bytes; embedded only */
	data?: Uint8Array;
	/** download extension: .ttf/.otf/.pfb */
	extension?: string;
}

interface PreflightReport {
	fileName: string;
	fileSize: number;
	pdfVersion: string;
	pageCount: number;
	encrypted: boolean;
	pages: PageInfo[];
	fonts: FontInfo[];
	issues: PreflightIssue[];
}

interface PdfFile {
	name: string;
	size: number;
	buffer: ArrayBuffer;
}

interface DisplayIssue extends PreflightIssue {
	key: string;
	icon: string;
}

const SEVERITY_ICON: Record<Severity, string> = {
	error: 'circle-x',
	warning: 'triangle-alert',
	info: 'info',
};

const CATEGORIES: { id: CheckCategory; label: string }[] = [
	{ id: 'document', label: 'Document' },
	{ id: 'geometry', label: 'Geometry' },
	{ id: 'fonts', label: 'Fonts' },
	{ id: 'colour', label: 'Colour' },
	{ id: 'images', label: 'Images' },
	{ id: 'transparency', label: 'Transparency' },
];

const STANDARD_14_FONTS = new Set([
	'Courier',
	'Courier-Bold',
	'Courier-BoldOblique',
	'Courier-Oblique',
	'Helvetica',
	'Helvetica-Bold',
	'Helvetica-BoldOblique',
	'Helvetica-Oblique',
	'Symbol',
	'Times-Bold',
	'Times-BoldItalic',
	'Times-Italic',
	'Times-Roman',
	'ZapfDingbats',
]);

export function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ptsToMm(pts: number): number {
	return pts * 0.352778;
}

function plural(count: number): string {
	return count === 1 ? '' : 's';
}

// pdf.js: name or array
function colourSpaceName(value: unknown): string {
	return typeof value === 'string' ? value : JSON.stringify(value);
}

function asDict(
	lib: PdfLib,
	value: PDFObject | undefined,
	context: PDFContext,
): PDFDict | undefined {
	const resolved =
		value instanceof lib.PDFRef ? context.lookup(value) : value;
	return resolved instanceof lib.PDFDict ? resolved : undefined;
}

function dictAt(
	lib: PdfLib,
	dict: PDFDict,
	key: string,
	context: PDFContext,
): PDFDict | undefined {
	return asDict(lib, dict.get(lib.PDFName.of(key)), context);
}

// pdf box: [llx lly urx ury]
function arrayToBox(lib: PdfLib, arr: PDFArray): PageBox {
	const nums: number[] = [];
	for (let i = 0; i < arr.size(); i++) {
		const val = arr.get(i);
		if (val instanceof lib.PDFNumber) nums.push(val.asNumber());
		else if (val instanceof lib.PDFRef) nums.push(0);
	}
	const [llx, lly, urx, ury] = nums;
	if (
		llx === undefined ||
		lly === undefined ||
		urx === undefined ||
		ury === undefined
	) {
		return { x: 0, y: 0, width: 612, height: 792 };
	}
	return {
		x: Math.min(llx, urx),
		y: Math.min(lly, ury),
		width: Math.abs(urx - llx),
		height: Math.abs(ury - lly),
	};
}

function boxAt(lib: PdfLib, dict: PDFDict, key: string): PageBox | undefined {
	const raw = dict.get(lib.PDFName.of(key));
	return raw instanceof lib.PDFArray ? arrayToBox(lib, raw) : undefined;
}

function extractFontData(
	lib: PdfLib,
	descriptor: PDFDict,
	context: PDFContext,
): { data: Uint8Array; extension: string } | null {
	const entries: [string, string][] = [
		['FontFile', '.pfb'], // type 1
		['FontFile2', '.ttf'], // truetype
		['FontFile3', '.otf'], // cff / opentype
	];

	for (const [key, ext] of entries) {
		const raw = descriptor.get(lib.PDFName.of(key));
		const streamObj =
			raw instanceof lib.PDFRef ? context.lookup(raw) : raw;

		if (streamObj instanceof lib.PDFRawStream) {
			try {
				return {
					data: lib
						.decodePDFRawStream(streamObj)
						.decode(),
					extension: ext,
				};
			} catch {
				try {
					return {
						data: streamObj.getContents(),
						extension: ext,
					};
				} catch {
					return null;
				}
			}
		}
		if (streamObj instanceof lib.PDFStream) {
			try {
				return {
					data: streamObj.getContents(),
					extension: ext,
				};
			} catch {
				return null;
			}
		}
	}
	return null;
}

function hasFontFile(lib: PdfLib, descriptor: PDFDict): boolean {
	return ['FontFile', 'FontFile2', 'FontFile3'].some(
		(key) => descriptor.get(lib.PDFName.of(key)) !== undefined,
	);
}

async function analyseWithPdfLib(
	buffer: ArrayBuffer,
	fileName: string,
	fileSize: number,
): Promise<PreflightReport> {
	const lib = await import('pdf-lib');
	const issues: PreflightIssue[] = [];
	const pages: PageInfo[] = [];
	const fontsMap = new Map<string, FontInfo>();

	let doc: PDFDocument;
	try {
		doc = await lib.PDFDocument.load(buffer, {
			ignoreEncryption: true,
		});
	} catch {
		throw new Error('PARSE_ERROR');
	}

	const context = doc.context;
	const headerBytes = new Uint8Array(buffer.slice(0, 20));
	const headerStr = String.fromCharCode(...headerBytes);
	const pdfVersion = /%PDF-(\d+\.\d+)/.exec(headerStr)?.[1] ?? 'unknown';
	const preTransparency = parseFloat(pdfVersion) < 1.4;

	const encrypted = !!context.trailerInfo.Encrypt;
	if (encrypted) {
		issues.push({
			severity: 'error',
			category: 'document',
			message: 'PDF is encrypted or has security restrictions',
			details: 'Encrypted PDFs cannot be reliably processed by most print workflows. Remove encryption before sending to print.',
		});
	}

	const pdfPages = doc.getPages();
	const pageCount = pdfPages.length;

	if (pageCount === 0) {
		issues.push({
			severity: 'error',
			category: 'document',
			message: 'PDF contains no pages',
		});
	}

	let firstWidth = 0;
	let firstHeight = 0;

	for (const [i, page] of pdfPages.entries()) {
		const pageNum = i + 1;
		const node = page.node;

		const mediaBox = boxAt(lib, node, 'MediaBox') ?? {
			x: 0,
			y: 0,
			width: page.getWidth(),
			height: page.getHeight(),
		};
		const trimBox = boxAt(lib, node, 'TrimBox');
		const bleedBox = boxAt(lib, node, 'BleedBox');
		const cropBox = boxAt(lib, node, 'CropBox');

		pages.push({
			number: pageNum,
			width: mediaBox.width,
			height: mediaBox.height,
			mediaBox,
			trimBox,
			bleedBox,
			cropBox,
		});

		if (!bleedBox) {
			issues.push({
				severity: 'warning',
				category: 'geometry',
				message: 'No BleedBox defined',
				page: pageNum,
				details: 'Without a bleed area, content may be cut off at the page edge. Most printers require at least 3mm bleed.',
			});
		} else if (trimBox) {
			const minBleed = Math.min(
				trimBox.x - bleedBox.x,
				trimBox.y - bleedBox.y,
				bleedBox.x +
					bleedBox.width -
					(trimBox.x + trimBox.width),
				bleedBox.y +
					bleedBox.height -
					(trimBox.y + trimBox.height),
			);
			if (minBleed < MIN_BLEED_PT) {
				issues.push({
					severity: 'warning',
					category: 'geometry',
					message: `Bleed margin is only ${ptsToMm(minBleed).toFixed(1)}mm (minimum 3mm recommended)`,
					page: pageNum,
					details: `Smallest bleed margin found: ${minBleed.toFixed(1)}pt (${ptsToMm(minBleed).toFixed(1)}mm). Printers typically require at least 3mm.`,
				});
			}
		}

		if (!trimBox) {
			issues.push({
				severity: 'info',
				category: 'geometry',
				message: 'No TrimBox defined',
				page: pageNum,
				details: 'The TrimBox defines the finished page size after cutting. Without it, the MediaBox is used as the trim size.',
			});
		}

		if (i === 0) {
			firstWidth = mediaBox.width;
			firstHeight = mediaBox.height;
		} else if (
			Math.abs(mediaBox.width - firstWidth) > 1 ||
			Math.abs(mediaBox.height - firstHeight) > 1
		) {
			issues.push({
				severity: 'warning',
				category: 'geometry',
				message: 'Page size differs from page 1',
				page: pageNum,
				details: `Page ${pageNum}: ${mediaBox.width.toFixed(0)} x ${mediaBox.height.toFixed(0)}pt vs page 1: ${firstWidth.toFixed(0)} x ${firstHeight.toFixed(0)}pt`,
			});
		}

		const resources = dictAt(lib, node, 'Resources', context);
		if (!resources) continue;

		const fontsDict = dictAt(lib, resources, 'Font', context);
		for (const [, fontValue] of fontsDict?.entries() ?? []) {
			const fontDict = asDict(lib, fontValue, context);
			if (!fontDict) continue;

			const baseFont = fontDict.get(
				lib.PDFName.of('BaseFont'),
			);
			let fontName =
				baseFont instanceof lib.PDFName ||
				baseFont instanceof lib.PDFHexString ||
				baseFont instanceof lib.PDFString
					? baseFont.decodeText()
					: 'Unknown';
			// strip 6-letter subset prefix (ABCDEF+…)
			fontName = fontName.replace(/^[A-Z]{6}\+/, '');

			const subtype = fontDict.get(lib.PDFName.of('Subtype'));
			const fontType =
				subtype instanceof lib.PDFName
					? subtype.decodeText()
					: undefined;

			let embedded = false;
			let fontData: {
				data: Uint8Array;
				extension: string;
			} | null = null;

			const descriptor = dictAt(
				lib,
				fontDict,
				'FontDescriptor',
				context,
			);
			if (descriptor && hasFontFile(lib, descriptor)) {
				embedded = true;
				fontData = extractFontData(
					lib,
					descriptor,
					context,
				);
			}

			// base-14 ship with viewers
			if (!embedded && STANDARD_14_FONTS.has(fontName))
				embedded = true;

			// type0 embeds at descendant cidfont
			if (!embedded && fontType === 'Type0') {
				const descendants = fontDict.get(
					lib.PDFName.of('DescendantFonts'),
				);
				if (descendants instanceof lib.PDFArray) {
					for (
						let d = 0;
						d < descendants.size();
						d++
					) {
						const cidFont = asDict(
							lib,
							descendants.get(d),
							context,
						);
						const cidDescriptor =
							cidFont &&
							dictAt(
								lib,
								cidFont,
								'FontDescriptor',
								context,
							);
						if (
							cidDescriptor &&
							hasFontFile(
								lib,
								cidDescriptor,
							)
						) {
							embedded = true;
							fontData ??=
								extractFontData(
									lib,
									cidDescriptor,
									context,
								);
						}
					}
				}
			}

			const key = `${fontName}:${fontType ?? ''}`;
			if (!fontsMap.has(key)) {
				fontsMap.set(key, {
					name: fontName,
					embedded,
					type: fontType,
					data: fontData?.data,
					extension: fontData?.extension,
				});
			}
		}

		const group = dictAt(lib, node, 'Group', context);
		const groupType = group?.get(lib.PDFName.of('S'));
		if (
			groupType instanceof lib.PDFName &&
			groupType.decodeText() === 'Transparency'
		) {
			issues.push(
				preTransparency
					? {
							severity: 'error',
							category: 'transparency',
							message: 'Transparency used in a PDF older than 1.4',
							page: pageNum,
							details: 'PDF versions before 1.4 do not support transparency. This may cause rendering issues.',
						}
					: {
							severity: 'info',
							category: 'transparency',
							message: 'Page uses transparency group',
							page: pageNum,
							details: 'This page has a transparency group. Ensure your printer/RIP supports transparency or flatten before printing.',
						},
			);
		}

		const extGState = dictAt(lib, resources, 'ExtGState', context);
		let hasTransparency = false;
		for (const [, gsValue] of extGState?.entries() ?? []) {
			const gsDict = asDict(lib, gsValue, context);
			if (!gsDict) continue;

			for (const key of ['ca', 'CA']) {
				const alpha = gsDict.get(lib.PDFName.of(key));
				if (
					alpha instanceof lib.PDFNumber &&
					alpha.asNumber() < 1
				) {
					hasTransparency = true;
				}
			}

			const smask = gsDict.get(lib.PDFName.of('SMask'));
			if (
				smask &&
				!(
					smask instanceof lib.PDFName &&
					smask.decodeText() === 'None'
				)
			) {
				hasTransparency = true;
			}
		}

		if (hasTransparency) {
			issues.push(
				preTransparency
					? {
							severity: 'error',
							category: 'transparency',
							message: 'Transparency effects used in a PDF older than 1.4',
							page: pageNum,
							details: 'Opacity or soft mask settings require PDF 1.4+. This may not render correctly.',
						}
					: {
							severity: 'info',
							category: 'transparency',
							message: 'Page uses transparency effects (opacity or soft mask)',
							page: pageNum,
							details: 'Elements with reduced opacity or soft masks were detected. Consider flattening transparency for older RIPs.',
						},
			);
		}
	}

	const fonts = Array.from(fontsMap.values());
	for (const font of fonts) {
		if (!font.embedded) {
			issues.push({
				severity: 'error',
				category: 'fonts',
				message: `Font "${font.name}" is not embedded`,
				details: 'Non-embedded fonts may render incorrectly or cause missing text at the printer. Embed all fonts before sending to print.',
			});
		}
		if (font.type === 'Type3') {
			issues.push({
				severity: 'warning',
				category: 'fonts',
				message: `Font "${font.name}" is a Type 3 font`,
				details: 'Type 3 fonts are bitmap-based and may not scale well. Consider replacing with an outline font.',
			});
		}
	}

	if (preTransparency) {
		issues.push({
			severity: 'warning',
			category: 'document',
			message: `PDF version ${pdfVersion} is below 1.4`,
			details: 'PDF 1.4+ is recommended for modern print workflows. Older versions lack support for transparency and other features.',
		});
	}

	for (const pageInfo of pages) {
		const orientation =
			pageInfo.width > pageInfo.height
				? 'Landscape'
				: 'Portrait';
		issues.push({
			severity: 'info',
			category: 'geometry',
			message: `${orientation} orientation`,
			page: pageInfo.number,
			details: `${pageInfo.width.toFixed(0)} x ${pageInfo.height.toFixed(0)}pt (${ptsToMm(pageInfo.width).toFixed(0)} x ${ptsToMm(pageInfo.height).toFixed(0)}mm)`,
		});
	}

	const mixedOrientation =
		new Set(pages.map((p) => p.width > p.height)).size > 1;
	if (mixedOrientation) {
		issues.push({
			severity: 'warning',
			category: 'geometry',
			message: 'Mixed page orientations detected',
			details: 'Some pages are portrait and others are landscape. This may cause issues with imposition and binding.',
		});
	}

	return {
		fileName,
		fileSize,
		pdfVersion,
		pageCount,
		encrypted,
		pages,
		fonts,
		issues,
	};
}

// pdf.js image may never resolve
function imageSize(
	objs: {
		get(objId: string, callback?: (obj: unknown) => void): unknown;
	},
	name: string,
): Promise<{ width: number; height: number } | null> {
	return new Promise((resolve) => {
		let settled = false;
		const finish = (
			value: { width: number; height: number } | null,
		) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve(value);
		};
		const timer = setTimeout(
			() => finish(null),
			IMAGE_OBJECT_TIMEOUT_MS,
		);
		try {
			objs.get(name, (obj: unknown) => {
				const size =
					obj &&
					typeof obj === 'object' &&
					'width' in obj &&
					'height' in obj
						? (obj as {
								width: number;
								height: number;
							})
						: null;
				finish(size);
			});
		} catch {
			finish(null);
		}
	});
}

async function analyseWithPdfJs(
	buffer: ArrayBuffer,
): Promise<{ pdfDoc: PDFDocumentProxy; issues: PreflightIssue[] }> {
	const pdfjsLib = await getPdfJs();
	const OPS = pdfjsLib.OPS;
	const issues: PreflightIssue[] = [];

	const pdfDoc = await loadPdfDocument(buffer.slice(0));

	for (let i = 1; i <= pdfDoc.numPages; i++) {
		const page = await pdfDoc.getPage(i);
		const opList = await page.getOperatorList();
		const argsArray = opList.argsArray as unknown[][];

		let imageCount = 0;
		const imageNames = new Set<string>();
		const colourSpaces = new Set<string>();

		for (const [j, fn] of opList.fnArray.entries()) {
			const first = argsArray[j]?.[0];

			if (
				fn === OPS.paintImageXObject ||
				fn === OPS.paintXObject ||
				fn === OPS.paintImageXObjectRepeat
			) {
				imageCount++;
			}

			if (
				(fn === OPS.paintImageXObject ||
					fn === OPS.paintXObject) &&
				typeof first === 'string'
			) {
				imageNames.add(first);
			}

			if (
				(fn === OPS.setFillColorSpace ||
					fn === OPS.setStrokeColorSpace) &&
				first
			) {
				colourSpaces.add(colourSpaceName(first));
			}
		}

		const csArray = Array.from(colourSpaces);
		const hasRGB = csArray.some(
			(cs) => cs.includes('RGB') || cs === 'rgb',
		);
		const hasCMYK = csArray.some(
			(cs) => cs.includes('CMYK') || cs === 'cmyk',
		);
		const hasGray = csArray.some(
			(cs) => cs.includes('Gray') || cs === 'gray',
		);
		const hasSpot = csArray.some(
			(cs) =>
				cs.includes('Separation') ||
				cs.includes('DeviceN') ||
				cs === 'spot',
		);

		if (hasRGB) {
			issues.push({
				severity: 'warning',
				category: 'colour',
				message: 'RGB colour space detected',
				page: i,
				details: 'RGB colours may shift when converted to CMYK for print. Consider converting to CMYK before sending to a commercial printer.',
			});
		}

		if (hasGray) {
			issues.push({
				severity: 'info',
				category: 'colour',
				message: 'Grayscale colour space detected',
				page: i,
				details: 'Grayscale content found. This is generally fine for print but ensure it meets your colour requirements.',
			});
		}

		if (hasSpot) {
			issues.push({
				severity: 'info',
				category: 'colour',
				message: 'Spot colour or DeviceN colour space detected',
				page: i,
				details: 'Spot colours were found. Verify your printer supports the spot colour inks used, or convert to CMYK process colours.',
			});
		}

		const activeSpaces = [
			hasRGB && 'RGB',
			hasCMYK && 'CMYK',
			hasGray && 'Gray',
			hasSpot && 'Spot',
		].filter((name): name is string => typeof name === 'string');
		if (activeSpaces.length > 1) {
			issues.push({
				severity: 'warning',
				category: 'colour',
				message: `Mixed colour spaces (${activeSpaces.join(', ')})`,
				page: i,
				details: 'Multiple colour spaces on this page can cause inconsistent colour output. Consider converting to a single colour space.',
			});
		}

		if (imageCount > 0) {
			issues.push({
				severity: 'info',
				category: 'images',
				message: `${imageCount} image${plural(imageCount)} found`,
				page: i,
				details: 'Ensure images are at least 300 DPI for print. Low-resolution images may appear pixelated.',
			});
		}

		// no ctm; assume full-page
		const viewport = page.getViewport({ scale: 1 });
		const pageWidthInches = viewport.width / 72;
		const pageHeightInches = viewport.height / 72;

		for (const imgName of imageNames) {
			const img = await imageSize(page.objs, imgName);
			if (!img || img.width <= 0 || img.height <= 0) continue;

			const effectiveDpi = Math.min(
				img.width / pageWidthInches,
				img.height / pageHeightInches,
			);
			const rounded = Math.round(effectiveDpi);

			if (effectiveDpi < 72) {
				issues.push({
					severity: 'error',
					category: 'images',
					message: `Very low resolution image (~${rounded} DPI at full page)`,
					page: i,
					details: `Image "${imgName}" is ${img.width}x${img.height}px (~${rounded} DPI if filling the page). This will appear pixelated in print.`,
				});
			} else if (effectiveDpi < 150) {
				issues.push({
					severity: 'warning',
					category: 'images',
					message: `Low resolution image (~${rounded} DPI at full page)`,
					page: i,
					details: `Image "${imgName}" is ${img.width}x${img.height}px (~${rounded} DPI if filling the page). For best quality, use 300 DPI or higher.`,
				});
			}
		}

		page.cleanup();
	}

	return { pdfDoc, issues };
}

const BOX_COLOURS = {
	trim: '#3b82f6',
	bleed: '#ef4444',
	crop: '#22c55e',
};

async function drawPage(
	canvas: HTMLCanvasElement,
	doc: PDFDocumentProxy,
	info: PageInfo,
	pageNumber: number,
	cancelled: () => boolean,
): Promise<void> {
	const page = await doc.getPage(pageNumber);
	try {
		const scale =
			PREVIEW_WIDTH / page.getViewport({ scale: 1 }).width;
		const viewport = page.getViewport({ scale });

		canvas.width = viewport.width;
		canvas.height = viewport.height;

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		await page.render({ canvas, viewport }).promise;
		if (cancelled()) return;

		ctx.save();
		ctx.lineWidth = 1.5;
		ctx.setLineDash([6, 4]);
		for (const [box, colour] of [
			[info.trimBox, BOX_COLOURS.trim],
			[info.bleedBox, BOX_COLOURS.bleed],
			[info.cropBox, BOX_COLOURS.crop],
		] as const) {
			if (!box) continue;
			ctx.strokeStyle = colour;
			// pdf y-up, canvas y-down
			ctx.strokeRect(
				(box.x - info.mediaBox.x) * scale,
				canvas.height -
					(box.y + box.height - info.mediaBox.y) *
						scale,
				box.width * scale,
				box.height * scale,
			);
		}
		ctx.restore();
	} finally {
		page.cleanup();
	}
}

export default class PdfPreflightTool extends Component {
	@tracked file: PdfFile | null = null;
	@tracked error: string | null = null;
	@tracked dragActive = false;
	@tracked analysing = false;
	@tracked report: PreflightReport | null = null;
	@tracked pdfDoc: PDFDocumentProxy | null = null;
	@tracked currentPage = 1;

	/** latest-wins analysis runs */
	#runId = 0;

	willDestroy() {
		super.willDestroy();
		this.#destroyDoc();
	}

	#destroyDoc() {
		if (!this.pdfDoc) return;
		void this.pdfDoc.destroy();
		this.pdfDoc = null;
	}

	get fileSizeLabel() {
		return formatSize(this.file?.size ?? 0);
	}

	get showReport() {
		return this.report !== null && !this.analysing;
	}

	get pageCount() {
		return this.report?.pageCount ?? 0;
	}

	get displayIssues(): DisplayIssue[] {
		return (this.report?.issues ?? []).map((issue, index) => ({
			...issue,
			key: String(index),
			icon: SEVERITY_ICON[issue.severity],
		}));
	}

	get errorCount() {
		return this.displayIssues.filter((i) => i.severity === 'error')
			.length;
	}

	get isReady() {
		return this.errorCount === 0;
	}

	get verdictDetail() {
		return this.isReady
			? 'No critical issues found'
			: `${this.errorCount} error${plural(this.errorCount)} must be resolved before printing`;
	}

	get badges() {
		const counts: [Severity, number][] = [
			['error', this.errorCount],
			[
				'warning',
				this.displayIssues.filter(
					(i) => i.severity === 'warning',
				).length,
			],
			[
				'info',
				this.displayIssues.filter(
					(i) => i.severity === 'info',
				).length,
			],
		];

		if (this.displayIssues.length === 0) {
			return [
				{
					severity: 'pass',
					label: 'All checks passed',
				},
			];
		}

		return counts
			.filter(([, count]) => count > 0)
			.map(([severity, count]) => ({
				severity,
				label:
					severity === 'info'
						? `${count} info`
						: `${count} ${severity}${plural(count)}`,
			}));
	}

	get summaryRows() {
		const report = this.report;
		if (!report) return [];
		const embedded = report.fonts.filter((f) => f.embedded).length;
		return [
			{ label: 'PDF Version', value: report.pdfVersion },
			{ label: 'Pages', value: String(report.pageCount) },
			{
				label: 'File Size',
				value: formatSize(report.fileSize),
			},
			{
				label: 'Encrypted',
				value: report.encrypted ? 'Yes' : 'No',
			},
			{
				label: 'Fonts',
				value: `${report.fonts.length} (${embedded} embedded)`,
			},
		];
	}

	get fontRows() {
		return (this.report?.fonts ?? []).map((font, index) => ({
			font,
			key: String(index),
			state: font.embedded ? 'Embedded' : 'Not embedded',
			downloadTitle: `Download ${font.name}${font.extension ?? ''}`,
		}));
	}

	get issueCategories() {
		const issues = this.displayIssues;
		return CATEGORIES.map((category) => ({
			...category,
			issues: issues.filter(
				(i) => i.category === category.id,
			),
		})).filter((group) => group.issues.length > 0);
	}

	get issuePages() {
		const pageCount = this.report?.pageCount ?? 0;
		const issues = this.displayIssues;
		return Array.from({ length: pageCount }, (_, i) => ({
			page: i + 1,
			issues: issues.filter((issue) => issue.page === i + 1),
		})).filter((entry) => entry.issues.length > 0);
	}

	get currentPageIssues() {
		return this.displayIssues.filter(
			(i) => i.page === this.currentPage,
		);
	}

	get currentPageInfo(): PageInfo | undefined {
		return this.report?.pages[this.currentPage - 1];
	}

	get pageDimensions() {
		const info = this.currentPageInfo;
		if (!info) return null;
		const box = (b: PageBox) =>
			`${b.width.toFixed(0)} x ${b.height.toFixed(0)}pt`;
		return {
			size: `${info.width.toFixed(0)} x ${info.height.toFixed(0)}pt (${ptsToMm(info.width).toFixed(0)} x ${ptsToMm(info.height).toFixed(0)}mm)`,
			trim: info.trimBox ? box(info.trimBox) : null,
			bleed: info.bleedBox ? box(info.bleedBox) : null,
		};
	}

	get atFirstPage() {
		return this.currentPage <= 1;
	}

	get atLastPage() {
		return this.currentPage >= this.pageCount;
	}

	readFile = (candidate: File) => {
		this.error = null;

		if (candidate.type && candidate.type !== 'application/pdf') {
			this.error = 'Please upload a PDF file.';
			return;
		}

		if (!candidate.name.toLowerCase().endsWith('.pdf')) {
			this.error =
				'Please upload a file with a .pdf extension.';
			return;
		}

		const reader = new FileReader();
		reader.onload = () => {
			const buffer = reader.result as ArrayBuffer;
			const magic = String.fromCharCode(
				...new Uint8Array(buffer.slice(0, 5)),
			);
			if (!magic.startsWith('%PDF')) {
				this.error =
					'The file does not appear to be a valid PDF.';
				return;
			}

			const file = {
				name: candidate.name,
				size: candidate.size,
				buffer,
			};
			this.file = file;
			void this.analyse(file);
		};
		reader.onerror = () => {
			this.error =
				'Failed to read the file. Please try again.';
		};
		reader.readAsArrayBuffer(candidate);
	};

	handleFileSelect = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) this.readFile(file);
		// allow re-picking same file
		input.value = '';
	};

	handleDrop = (event: DragEvent) => {
		event.preventDefault();
		this.dragActive = false;
		const file = event.dataTransfer?.files[0];
		if (file) this.readFile(file);
	};

	// default navigates; dragover refires
	allowDrop = (event: DragEvent) => {
		event.preventDefault();
		if (!this.dragActive) this.dragActive = true;
	};

	endDrag = (event: DragEvent) => {
		event.preventDefault();
		this.dragActive = false;
	};

	clear = () => {
		this.#runId++;
		this.#destroyDoc();
		this.file = null;
		this.error = null;
		this.report = null;
		this.analysing = false;
		this.currentPage = 1;
	};

	analyse = async (file: PdfFile) => {
		const runId = ++this.#runId;
		this.analysing = true;
		this.error = null;
		this.report = null;
		this.currentPage = 1;
		this.#destroyDoc();

		try {
			const report = await analyseWithPdfLib(
				file.buffer,
				file.name,
				file.size,
			);
			if (runId !== this.#runId) return;

			try {
				const { pdfDoc, issues } =
					await analyseWithPdfJs(file.buffer);
				if (runId !== this.#runId) {
					void pdfDoc.destroy();
					return;
				}
				report.issues.push(...issues);
				this.pdfDoc = pdfDoc;
			} catch (pdfJsError) {
				console.warn(
					'pdf.js analysis failed:',
					pdfJsError,
				);
				report.issues.push({
					severity: 'warning',
					category: 'document',
					message: 'Could not render page previews',
					details: 'The page preview and image analysis could not be loaded. Structural analysis is still available.',
				});
			}

			if (runId !== this.#runId) return;
			this.report = report;
		} catch (e) {
			if (runId !== this.#runId) return;
			// import failure = parse error
			console.error('pdf-preflight analysis failed:', e);
			const message = e instanceof Error ? e.message : '';
			this.error =
				message.includes('encrypted') ||
				message.includes('password')
					? 'This PDF is encrypted or password-protected and cannot be analysed.'
					: 'Could not parse this PDF file.';
		} finally {
			if (runId === this.#runId) this.analysing = false;
		}
	};

	goToPage = (page: number) => {
		this.currentPage = Math.max(
			1,
			Math.min(this.pageCount || 1, page),
		);
	};

	previousPage = () => this.goToPage(this.currentPage - 1);
	nextPage = () => this.goToPage(this.currentPage + 1);

	/** page-less issues inert */
	goToIssuePage = (issue: PreflightIssue) => {
		if (issue.page) this.goToPage(issue.page);
	};

	// autotracked: no dependency list
	renderPreview = modifier((canvas: HTMLCanvasElement) => {
		const doc = this.pdfDoc;
		const info = this.currentPageInfo;
		const pageNumber = this.currentPage;
		if (!doc || !info) return;

		let cancelled = false;
		void drawPage(canvas, doc, info, pageNumber, () => cancelled);
		return () => {
			cancelled = true;
		};
	});

	downloadFont = (font: FontInfo) => {
		const bytes = font.data;
		if (!bytes) return;
		// BlobPart rejects ArrayBufferLike view
		const buffer = bytes.buffer.slice(
			bytes.byteOffset,
			bytes.byteOffset + bytes.byteLength,
		) as ArrayBuffer;
		downloadBlob(
			new Blob([buffer], {
				type: 'application/octet-stream',
			}),
			`${font.name}${font.extension ?? ''}`,
		);
	};

	<template>
		<div
			class="dt-preflight"
			{{filePaste this.readFile accept=ACCEPT}}
		>
			<div class="dt-preflight-frame">
				{{#if this.file}}
					<div class="dt-preflight-file">
						<Icon
							@name="file-text"
							class="dt-preflight-file-icon"
						/>
						<span
							class="dt-preflight-file-meta"
						>
							<span
								class="dt-preflight-file-name"
							>{{this.file.name}}</span>
							<span
								class="dt-preflight-file-size"
							>{{this.fileSizeLabel}}</span>
						</span>
						<button
							type="button"
							class="dt-preflight-file-clear"
							{{on
								"click"
								this.clear
							}}
						>
							<Icon @name="x" />
							<span
								class="dt-sr-only"
							>Remove file</span>
						</button>
					</div>
				{{else}}
					<label
						class="dt-preflight-drop
							{{if
								this.dragActive
								'is-active'
							}}"
						{{on "drop" this.handleDrop}}
						{{on "dragover" this.allowDrop}}
						{{on "dragleave" this.endDrag}}
					>
						<input
							type="file"
							accept={{ACCEPT}}
							class="dt-sr-only"
							{{on
								"change"
								this.handleFileSelect
							}}
						/>
						<Icon @name="upload" />
						<span
							class="dt-preflight-drop-title"
						>Drop a PDF here</span>
						<span
							class="dt-preflight-drop-hint"
						>or click to select a file, or
							paste</span>
					</label>
				{{/if}}

				{{#if this.analysing}}
					<div class="dt-preflight-busy">
						<NdsLoader class="is-stage" />
						<span>Analysing PDF...</span>
					</div>
				{{/if}}
			</div>

			{{#if this.error}}
				<p class="dt-preflight-error">{{this.error}}</p>
			{{/if}}

			{{#if this.showReport}}
				<div class="dt-preflight-report">
					<div class="dt-preflight-panel">
						<h3
							class="dt-preflight-panel-title"
						>Page Preview</h3>

						{{#if this.pdfDoc}}
							<div
								class="dt-preflight-stage"
							>
								<canvas
									{{this.renderPreview}}
								></canvas>
							</div>

							<div
								class="dt-preflight-nav"
							>
								<button
									type="button"
									class="dt-preflight-nav-btn"
									disabled={{this.atFirstPage}}
									{{on
										"click"
										this.previousPage
									}}
								>
									<Icon
										@name="chevron-left"
									/>
									<span
										class="dt-sr-only"
									>Previous
										page</span>
								</button>
								<span
									class="dt-preflight-nav-label"
								>Page
									{{this.currentPage}}
									of
									{{this.pageCount}}</span>
								<button
									type="button"
									class="dt-preflight-nav-btn"
									disabled={{this.atLastPage}}
									{{on
										"click"
										this.nextPage
									}}
								>
									<Icon
										@name="chevron-right"
									/>
									<span
										class="dt-sr-only"
									>Next
										page</span>
								</button>
							</div>

							<div
								class="dt-preflight-legend"
							>
								<span
									class="dt-preflight-legend-item"
								>
									<span
										class="dt-preflight-rule is-trim"
									></span>
									Trim
								</span>
								<span
									class="dt-preflight-legend-item"
								>
									<span
										class="dt-preflight-rule is-bleed"
									></span>
									Bleed
								</span>
								<span
									class="dt-preflight-legend-item"
								>
									<span
										class="dt-preflight-rule is-crop"
									></span>
									Crop
								</span>
							</div>
						{{else}}
							<p
								class="dt-preflight-empty"
							>Page preview
								unavailable</p>
						{{/if}}

						{{#if this.pageDimensions}}
							<div
								class="dt-preflight-dims"
							>
								<p><span>Page
										size:</span>
									{{this.pageDimensions.size}}</p>
								{{#if
									this.pageDimensions.trim
								}}
									<p><span
										>Trim:</span>
										{{this.pageDimensions.trim}}</p>
								{{/if}}
								{{#if
									this.pageDimensions.bleed
								}}
									<p><span
										>Bleed:</span>
										{{this.pageDimensions.bleed}}</p>
								{{/if}}
							</div>
						{{/if}}

						{{#if
							this.currentPageIssues.length
						}}
							<div
								class="dt-preflight-section"
							>
								<h4
									class="dt-preflight-subhead"
								>Page
									{{this.currentPage}}
									issues</h4>
								<div
									class="dt-preflight-list is-flush"
								>
									{{#each
										this.currentPageIssues
										key="key"
										as |issue|
									}}
										<div
											class="dt-preflight-issue"
										>
											<Icon
												@name={{issue.icon}}
												class="dt-preflight-sev is-{{issue.severity}}"
											/>
											<span
												class="dt-preflight-issue-body"
											>
												<span
													class="dt-preflight-issue-message"
												>{{issue.message}}</span>
												{{#if
													issue.details
												}}
													<span
														class="dt-preflight-issue-details"
													>{{issue.details}}</span>
												{{/if}}
											</span>
										</div>
									{{/each}}
								</div>
							</div>
						{{/if}}
					</div>

					<div class="dt-preflight-panel">
						<div
							class="dt-preflight-verdict
								{{if
									this.isReady
									'is-pass'
									'is-fail'
								}}"
						>
							<Icon
								@name={{if
									this.isReady
									"circle-check"
									"circle-x"
								}}
							/>
							<span
								class="dt-preflight-verdict-body"
							>
								<span
									class="dt-preflight-verdict-title"
								>{{if
										this.isReady
										"Ready for print"
										"Issues found"
									}}</span>
								<span
									class="dt-preflight-verdict-detail"
								>{{this.verdictDetail}}</span>
							</span>
						</div>

						<div
							class="dt-preflight-badges"
						>
							{{#each
								this.badges
								key="severity"
								as |badge|
							}}
								<span
									class="dt-preflight-badge is-{{badge.severity}}"
								>{{badge.label}}</span>
							{{/each}}
						</div>

						<div
							class="dt-preflight-summary"
						>
							{{#each
								this.summaryRows
								key="label"
								as |row|
							}}
								<div
									class="dt-preflight-summary-row"
								>
									<span
										class="dt-preflight-summary-label"
									>{{row.label}}</span>
									<span
										class="dt-preflight-summary-value"
									>{{row.value}}</span>
								</div>
							{{/each}}
						</div>

						{{#if this.fontRows.length}}
							<div
								class="dt-preflight-section"
							>
								<h4
									class="dt-preflight-head"
								>Fonts</h4>
								<div
									class="dt-preflight-list is-flush"
								>
									{{#each
										this.fontRows
										key="key"
										as |row|
									}}
										<div
											class="dt-preflight-font"
										>
											<span
												class="dt-preflight-font-name"
											>
												{{row.font.name}}
												{{#if
													row.font.type
												}}
													<span
														class="dt-preflight-font-type"
													>({{row.font.type}})</span>
												{{/if}}
											</span>
											<span
												class="dt-preflight-font-state
													{{if
														row.font.embedded
														'is-embedded'
														'is-missing'
													}}"
											>{{row.state}}</span>
											{{#if
												row.font.data
											}}
												<button
													type="button"
													class="dt-preflight-font-download"
													title={{row.downloadTitle}}
													aria-label={{passAlong
														row.downloadTitle
													}}
													{{on
														"click"
														(fn
															this.downloadFont
															row.font
														)
													}}
												>
													<Icon
														@name={{(downloadIcon
														)}}
													/>
												</button>
											{{/if}}
										</div>
									{{/each}}
								</div>
							</div>
						{{/if}}

						{{#if
							this.issueCategories.length
						}}
							<div
								class="dt-preflight-section"
							>
								<h4
									class="dt-preflight-head"
								>Issues by
									Category</h4>
								{{#each
									this.issueCategories
									key="id"
									as |group|
								}}
									<div
										class="dt-preflight-group"
									>
										<h5
											class="dt-preflight-subhead"
										>{{group.label}}</h5>
										<div
											class="dt-preflight-list"
										>
											{{#each
												group.issues
												key="key"
												as |issue|
											}}
												<button
													type="button"
													class="dt-preflight-issue is-row
														{{unless
															issue.page
															'is-static'
														}}"
													{{on
														"click"
														(fn
															this.goToIssuePage
															issue
														)
													}}
												>
													<Icon
														@name={{issue.icon}}
														class="dt-preflight-sev is-{{issue.severity}}"
													/>
													<span
														class="dt-preflight-issue-body"
													>
														<span
															class="dt-preflight-issue-message"
														>{{issue.message}}
															{{#if
																issue.page
															}}
																<span
																	class="dt-preflight-issue-page"
																>p.{{issue.page}}</span>
															{{/if}}
														</span>
														{{#if
															issue.details
														}}
															<span
																class="dt-preflight-issue-details"
															>{{issue.details}}</span>
														{{/if}}
													</span>
												</button>
											{{/each}}
										</div>
									</div>
								{{/each}}
							</div>
						{{/if}}

						{{#if this.issuePages.length}}
							<div
								class="dt-preflight-section"
							>
								<h4
									class="dt-preflight-head"
								>Issues by Page</h4>
								{{#each
									this.issuePages
									key="page"
									as |entry|
								}}
									<div
										class="dt-preflight-group"
									>
										<button
											type="button"
											class="dt-preflight-page-btn"
											{{on
												"click"
												(fn
													this.goToPage
													entry.page
												)
											}}
										>Page
											{{entry.page}}</button>
										<div
											class="dt-preflight-list"
										>
											{{#each
												entry.issues
												key="key"
												as |issue|
											}}
												<button
													type="button"
													class="dt-preflight-issue is-row is-compact"
													{{on
														"click"
														(fn
															this.goToPage
															entry.page
														)
													}}
												>
													<Icon
														@name={{issue.icon}}
														class="dt-preflight-sev is-{{issue.severity}}"
													/>
													<span
														class="dt-preflight-issue-message"
													>{{issue.message}}</span>
												</button>
											{{/each}}
										</div>
									</div>
								{{/each}}
							</div>
						{{/if}}
					</div>

					<a
						class="dt-preflight-taxiway"
						href="https://rmv.fyi/projects/taxiway"
						target="_blank"
						rel="noopener noreferrer"
					>
						<span>Need more?
							<strong>Taxiway</strong>
							is a free native macOS
							app with 55 checks,
							automated fixes, and
							full PDF inspection.</span>
						<Icon @name="external-link" />
					</a>
				</div>
			{{/if}}
		</div>
	</template>
}
