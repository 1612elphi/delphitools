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

function joinValue(value: unknown): string | null {
	if (typeof value === 'string') return cleanString(value);
	if (Array.isArray(value)) {
		const parts = value
			.map((item) =>
				typeof item === 'string' ? item.trim() : null,
			)
			.filter((item): item is string => !!item);
		if (parts.length === 0) return null;
		return parts.join(', ');
	}
	return null;
}

function xmpGet(
	metadata: { get(name: string): unknown } | null | undefined,
	...names: string[]
): string | null {
	if (!metadata || typeof metadata.get !== 'function') return null;
	for (const name of names) {
		for (const candidate of [name, name.toLowerCase()]) {
			let value: unknown = null;
			try {
				value = metadata.get(candidate);
			} catch {
				continue;
			}
			const joined = joinValue(value);
			if (joined) return joined;
		}
	}
	return null;
}

function pad2(n: number): string {
	return String(n).padStart(2, '0');
}

// Human display: DD.MM.YYYY HH:mm (time omitted when absent).
// Parses PDF date strings (D:YYYYMMDDHHmmSSOHH'mm) and XMP/ISO dates
// by wall-clock components, so the shown time matches the stored time
// regardless of the viewer's timezone.
export function formatPdfDate(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	const text = raw.trim();
	if (!text) return null;

	const pdf = text.match(
		/^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/,
	);
	if (pdf) {
		const [, year, month, day, hour, minute] = pdf;
		if (!year || !month || !day) return null;
		const date = `${day}.${month}.${year}`;
		if (hour !== undefined && minute !== undefined) {
			return `${date} ${pad2(Number(hour))}:${pad2(Number(minute))}`;
		}
		return date;
	}

	const iso = text.match(
		/(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/,
	);
	if (iso) {
		const [, year, month, day, hour, minute] = iso;
		const date = `${day}.${month}.${year}`;
		if (hour !== undefined && minute !== undefined) {
			return `${date} ${hour}:${minute}`;
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

interface PdfDocLike {
	getMetadata(): Promise<{
		info?: Record<string, unknown>;
		metadata?: { get(name: string): unknown } | null;
	}>;
	cleanup(): Promise<unknown>;
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

	// Lazy: pdfjs (and its worker) loads only on the PDF path, so the
	// image-only bundle is untouched. Verified by the absence of a static
	// pdfjs-dist import in this module.
	const { loadPdfDocument } = await import('./pdfjs');

	let doc: PdfDocLike | null = null;
	try {
		doc = (await loadPdfDocument(
			data.slice(),
		)) as unknown as PdfDocLike;
		const meta = await doc.getMetadata();
		const info = meta?.info ?? {};
		const xmp = meta?.metadata ?? null;

		const title =
			cleanString(info['Title']) ?? xmpGet(xmp, 'dc:title');
		const author =
			cleanString(info['Author']) ??
			xmpGet(xmp, 'dc:creator');
		const subject =
			cleanString(info['Subject']) ??
			xmpGet(xmp, 'dc:description', 'dc:subject');
		const keywords =
			joinValue(info['Keywords']) ??
			xmpGet(xmp, 'pdf:keywords', 'dc:subject');
		const creator =
			cleanString(info['Creator']) ??
			xmpGet(xmp, 'xmp:creatortool');
		const producer =
			cleanString(info['Producer']) ??
			xmpGet(xmp, 'pdf:producer');
		const language =
			joinValue(info['Language']) ??
			xmpGet(xmp, 'dc:language');
		const version =
			cleanString(info['PDFFormatVersion']) ??
			xmpGet(xmp, 'pdf:pdfversion');

		const createdRaw =
			cleanString(info['CreationDate']) ??
			xmpGet(xmp, 'xmp:createdate');
		const modifiedRaw =
			cleanString(info['ModDate']) ??
			xmpGet(xmp, 'xmp:modifydate');
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
			entries.push({ label: 'PDF Version', detail: version });
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
		if (doc) {
			try {
				await doc.cleanup();
			} catch {
				// ignore cleanup failures
			}
		}
	}
}
