import type { MetadataEntry } from './metadata';

export interface PdfMetadataReport {
	entries: MetadataEntry[];
	unreadable: boolean;
}

function cleanString(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed ? trimmed : null;
}

function pad2(n: number): string {
	return String(n).padStart(2, '0');
}

// Human display: DD.MM.YYYY HH:mm (UTC offset appended when stored,
// e.g. "20.02.2026 13:05 (UTC+1)"). Time omitted when absent.
// Parses PDF date strings (D:YYYYMMDDHHmmSSOHH'mm) and XMP/ISO dates
// by wall-clock components, so the shown time matches the stored time
// regardless of the viewer's timezone.
function utcLabel(totalMinutes: number): string {
	if (totalMinutes === 0) return 'UTC±0';
	const sign = totalMinutes > 0 ? '+' : '-';
	const abs = Math.abs(totalMinutes);
	const hours = Math.floor(abs / 60);
	const minutes = abs % 60;
	if (minutes === 0) return `UTC${sign}${hours}`;
	return `UTC${sign}${hours}:${pad2(minutes)}`;
}

function parsePdfOffset(suffix: string): number | null {
	const text = suffix.trim();
	if (!text) return null;
	if (/^[Zz]$/.test(text)) return 0;
	const m = text.match(/^([+-])(\d{1,2})(?:'?(\d{2})'?|(?::?(\d{2})))?/);
	if (!m) return null;
	const sign = m[1] === '+' ? 1 : -1;
	const hours = Number(m[2]);
	const minutes = Number(m[3] ?? m[4] ?? '0');
	if (
		Number.isNaN(hours) ||
		Number.isNaN(minutes) ||
		hours > 14 ||
		minutes >= 60
	) {
		return null;
	}
	return sign * (hours * 60 + minutes);
}

function parseIsoOffset(suffix: string | undefined): number | null {
	if (!suffix) return null;
	const text = suffix.trim();
	if (!text) return null;
	if (/^[Zz]$/.test(text)) return 0;
	const m = text.match(/^([+-])(\d{2}):?(\d{2})?$/);
	if (!m) return null;
	const sign = m[1] === '+' ? 1 : -1;
	const hours = Number(m[2]);
	const minutes = Number(m[3] ?? '0');
	if (
		Number.isNaN(hours) ||
		Number.isNaN(minutes) ||
		hours > 14 ||
		minutes >= 60
	) {
		return null;
	}
	return sign * (hours * 60 + minutes);
}

export function formatPdfDate(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	const text = raw.trim();
	if (!text) return null;

	const pdf = text.match(
		/^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([Zz]|[+-].*)?$/,
	);
	if (pdf) {
		const [, year, month, day, hour, minute, , offsetRaw] = pdf;
		if (!year || !month || !day) return null;
		const date = `${day}.${month}.${year}`;
		if (hour !== undefined && minute !== undefined) {
			const base = `${date} ${pad2(Number(hour))}:${pad2(Number(minute))}`;
			const offset =
				offsetRaw != null
					? parsePdfOffset(offsetRaw)
					: null;
			return offset === null
				? base
				: `${base} (${utcLabel(offset)})`;
		}
		return date;
	}

	const iso = text.match(
		/(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?\s*(Z|[+-]\d{2}(?::?\d{2})?)?)?/,
	);
	if (iso) {
		const [, year, month, day, hour, minute, , offsetRaw] = iso;
		const date = `${day}.${month}.${year}`;
		if (hour !== undefined && minute !== undefined) {
			const base = `${date} ${hour}:${minute}`;
			const offset = parseIsoOffset(offsetRaw);
			return offset === null
				? base
				: `${base} (${utcLabel(offset)})`;
		}
		return date;
	}

	return null;
}

function isPdfHeader(data: Uint8Array): boolean {
	const sample = data.subarray(0, 1024);
	let text = '';
	for (let i = 0; i < sample.length; i++) {
		text += String.fromCharCode(sample[i]!);
		if (text.length > 8 && text.includes('%PDF-')) return true;
	}
	return text.includes('%PDF-');
}

const UNREADABLE: PdfMetadataReport = { entries: [], unreadable: true };

export async function parsePdfMetadata(
	data: Uint8Array,
): Promise<PdfMetadataReport> {
	if (!(data instanceof Uint8Array) || data.length < 5) {
		return { ...UNREADABLE, entries: [] };
	}
	if (!isPdfHeader(data)) {
		return { ...UNREADABLE, entries: [] };
	}

	let doc: import('mupdf').Document | null = null;
	try {
		const mupdf = await import('mupdf');
		doc = mupdf.Document.openDocument(data.slice(), 'application/pdf');
		const pdf = doc.asPDF();
		if (!pdf) return { ...UNREADABLE, entries: [] };

		const getInfo = (key: string) => cleanString(doc!.getMetaData(key));
		const title = getInfo(mupdf.Document.META_INFO_TITLE);
		const author = getInfo(mupdf.Document.META_INFO_AUTHOR);
		const subject = getInfo(mupdf.Document.META_INFO_SUBJECT);
		const keywords = getInfo(mupdf.Document.META_INFO_KEYWORDS);
		const creator = getInfo(mupdf.Document.META_INFO_CREATOR);
		const producer = getInfo(mupdf.Document.META_INFO_PRODUCER);
		const language = cleanString(pdf.getLanguage());
		const version = cleanString(String(pdf.getVersion()));
		const createdRaw = getInfo(mupdf.Document.META_INFO_CREATIONDATE);
		const modifiedRaw = getInfo(mupdf.Document.META_INFO_MODIFICATIONDATE);
		const created = createdRaw
			? (formatPdfDate(createdRaw) ?? createdRaw)
			: null;
		const modified = modifiedRaw
			? (formatPdfDate(modifiedRaw) ?? modifiedRaw)
			: null;

		const entries: MetadataEntry[] = [];
		if (title) entries.push({ label: 'Title', detail: title });
		if (author) entries.push({ label: 'Author', detail: author });
		if (subject)
			entries.push({ label: 'Subject', detail: subject });
		if (keywords)
			entries.push({ label: 'Keywords', detail: keywords });
		if (creator)
			entries.push({ label: 'Creator', detail: creator });
		if (producer)
			entries.push({ label: 'Producer', detail: producer });
		if (language)
			entries.push({ label: 'Language', detail: language });
		if (version)
			entries.push({
				label: 'PDF Version',
				detail: `${Math.floor(Number(version) / 10)}.${Number(version) % 10}`,
			});
		if (created)
			entries.push({
				label: 'Creation Date',
				detail: created,
			});
		if (modified)
			entries.push({
				label: 'Modification Date',
				detail: modified,
			});

		return { entries, unreadable: false };
	} catch {
		return { ...UNREADABLE, entries: [] };
	} finally {
		doc?.destroy();
	}
}

export interface PdfStripResult {
	data: Uint8Array;
	removed: string[];
}

const INFO_LABELS: Record<string, string> = {
	Title: 'Title',
	Author: 'Author',
	Subject: 'Subject',
	Keywords: 'Keywords',
	Creator: 'Creator',
	Producer: 'Producer',
	CreationDate: 'Creation date',
	ModDate: 'Modification date',
};

// Deep module: one function hides pdf-lib Info-dict + XMP plumbing.
// Returns null for non-PDF/corrupt input instead of throwing.
export async function stripPdfMetadata(
	data: Uint8Array,
): Promise<PdfStripResult | null> {
	if (!(data instanceof Uint8Array) || data.length < 5) return null;
	if (!isPdfHeader(data)) return null;

	try {
		const { PDFDocument, PDFName, PDFDict } =
			await import('pdf-lib');
		const doc = await PDFDocument.load(data.slice(), {
			updateMetadata: false,
		});

		const removed: string[] = [];
		// getInfoDict() is private: reach the Info dict through the
		// public context + trailerInfo instead.
		const infoNode = doc.context.lookup(
			doc.context.trailerInfo.Info,
		);
		if (infoNode instanceof PDFDict) {
			for (const [key, label] of Object.entries(
				INFO_LABELS,
			)) {
				const name = PDFName.of(key);
				if (infoNode.get(name) !== undefined) {
					removed.push(label);
					infoNode.delete(name);
				}
			}
		}
		if (doc.catalog.get(PDFName.of('Metadata')) !== undefined) {
			removed.push('XMP');
			doc.catalog.delete(PDFName.of('Metadata'));
		}
		if (doc.catalog.get(PDFName.of('Lang')) !== undefined) {
			removed.push('Language');
			doc.catalog.delete(PDFName.of('Lang'));
		}

		// save() has no updateMetadata option; plain save() does not
		// touch the Info dict, and load() above already disabled the
		// pdf-lib Producer/ModDate stamp.
		const saved = await doc.save();
		return { data: new Uint8Array(saved), removed };
	} catch {
		return null;
	}
}
