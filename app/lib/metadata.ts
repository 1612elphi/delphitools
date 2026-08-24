// structural metadata stripping

export type ImageContainer = 'jpeg' | 'png' | 'webp' | 'gif';

export interface MetadataEntry {
	label: string;
	detail: string;
}

export interface GpsFix {
	lat: number;
	lon: number;
	alt?: number;
}

export interface MetadataReport {
	format: ImageContainer | null;
	entries: MetadataEntry[];
	gps: GpsFix | null;
	// c2pa manifest found
	c2pa: boolean;
}

export interface StripResult {
	format: ImageContainer;
	data: Uint8Array;
	removed: string[];
}

export interface StripOptions {
	// defaults to true
	keepColourProfile?: boolean;
}

const XMP_HEADER = 'http://ns.adobe.com/xap/1.0/';

function concat(parts: Uint8Array[]): Uint8Array {
	const total = parts.reduce((sum, p) => sum + p.length, 0);
	const out = new Uint8Array(total);
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
}

function ascii(bytes: Uint8Array): string {
	return String.fromCharCode(...bytes);
}

function bytesIndexOf(data: Uint8Array, needle: string): number {
	const last = data.length - needle.length;
	outer: for (let i = 0; i <= last; i++) {
		for (let j = 0; j < needle.length; j++)
			if (data[i + j] !== needle.charCodeAt(j))
				continue outer;
		return i;
	}
	return -1;
}

function latin1(view: DataView, start: number, length: number): string {
	let out = '';
	for (let i = 0; i < length; i++)
		out += String.fromCharCode(view.getUint8(start + i));
	return out;
}

function detectFormat(data: Uint8Array): ImageContainer | null {
	if (data.length < 12) return null;
	if (data[0] === 0xff && data[1] === 0xd8) return 'jpeg';
	if (
		data[0] === 0x89 &&
		data[1] === 0x50 &&
		data[2] === 0x4e &&
		data[3] === 0x47
	)
		return 'png';
	if (
		ascii(data.subarray(0, 4)) === 'RIFF' &&
		ascii(data.subarray(8, 12)) === 'WEBP'
	)
		return 'webp';
	if (ascii(data.subarray(0, 4)) === 'GIF8') return 'gif';
	return null;
}

const TIFF_TYPE_SIZE: Record<number, number> = {
	1: 1,
	2: 1,
	3: 2,
	4: 4,
	5: 8,
	7: 1,
	9: 4,
	10: 8,
};

interface TiffFields {
	values: Map<number, string | number | number[]>;
	exifOffset?: number;
	gpsOffset?: number;
	nextIfdOffset?: number;
}

function readTiffValue(
	view: DataView,
	base: number,
	little: boolean,
	type: number,
	count: number,
	entryValueOffset: number,
): string | number | number[] | undefined {
	const unit = TIFF_TYPE_SIZE[type];
	if (!unit) return undefined;
	const byteLength = unit * count;
	// values <=4 bytes inline
	const at =
		byteLength <= 4
			? entryValueOffset
			: base + view.getUint32(entryValueOffset, little);
	if (at + byteLength > view.byteLength) return undefined;

	if (type === 2) {
		let end = at;
		while (end < at + byteLength && view.getUint8(end) !== 0) end++;
		return latin1(view, at, end - at);
	}
	if (type === 1 || type === 3 || type === 4 || type === 9) {
		const values: number[] = [];
		for (let i = 0; i < count; i++) {
			const o = at + i * unit;
			values.push(
				type === 1
					? view.getUint8(o)
					: type === 3
						? view.getUint16(o, little)
						: type === 4
							? view.getUint32(
									o,
									little,
								)
							: view.getInt32(
									o,
									little,
								),
			);
		}
		return count === 1 ? values[0]! : values;
	}
	if (type === 5 || type === 10) {
		const values: number[] = [];
		for (let i = 0; i < count; i++) {
			const o = at + i * 8;
			const num =
				type === 5
					? view.getUint32(o, little)
					: view.getInt32(o, little);
			const den =
				type === 5
					? view.getUint32(o + 4, little)
					: view.getInt32(o + 4, little);
			values.push(den === 0 ? 0 : num / den);
		}
		return count === 1 ? values[0]! : values;
	}
	if (type === 7 && count <= 64) {
		return latin1(view, at, count);
	}
	return undefined;
}

function readIfd(
	view: DataView,
	base: number,
	offset: number,
	little: boolean,
): TiffFields | null {
	if (offset <= 0 || base + offset + 2 > view.byteLength) return null;
	const fields: TiffFields = { values: new Map() };
	const count = view.getUint16(base + offset, little);
	if (count > 512) return null;
	for (let i = 0; i < count; i++) {
		const entry = base + offset + 2 + i * 12;
		if (entry + 12 > view.byteLength) break;
		const tag = view.getUint16(entry, little);
		const type = view.getUint16(entry + 2, little);
		const num = view.getUint32(entry + 4, little);
		if (num > 1_000_000) continue;
		const value = readTiffValue(
			view,
			base,
			little,
			type,
			num,
			entry + 8,
		);
		if (value !== undefined) fields.values.set(tag, value);
		if (tag === 0x8769 && typeof value === 'number')
			fields.exifOffset = value;
		if (tag === 0x8825 && typeof value === 'number')
			fields.gpsOffset = value;
	}
	const nextAt = base + offset + 2 + count * 12;
	if (nextAt + 4 <= view.byteLength) {
		fields.nextIfdOffset = view.getUint32(nextAt, little);
	}
	return fields;
}

interface ParsedExif {
	fields: Partial<Record<string, string>>;
	gps: GpsFix | null;
	gpsTimestamp?: string;
	hasMakerNote: boolean;
	hasThumbnail: boolean;
}

function parseTiff(view: DataView, base: number): ParsedExif | null {
	if (base + 8 > view.byteLength) return null;
	const order = latin1(view, base, 2);
	const little = order === 'II';
	if (!little && order !== 'MM') return null;
	if (view.getUint16(base + 2, little) !== 42) return null;

	const out: ParsedExif = {
		fields: {},
		gps: null,
		hasMakerNote: false,
		hasThumbnail: false,
	};

	const str = (
		v: string | number | number[] | undefined,
	): string | undefined => (typeof v === 'string' ? v : undefined);

	const ifd0 = readIfd(
		view,
		base,
		view.getUint32(base + 4, little),
		little,
	);
	if (!ifd0) return null;
	out.fields.make = str(ifd0.values.get(0x010f));
	out.fields.model = str(ifd0.values.get(0x0110));
	out.fields.software = str(ifd0.values.get(0x0131));
	out.fields.modified = str(ifd0.values.get(0x0132));
	out.fields.artist = str(ifd0.values.get(0x013b));
	out.fields.description = str(ifd0.values.get(0x010e));
	out.fields.copyright = str(ifd0.values.get(0x8298));
	out.hasThumbnail = (ifd0.nextIfdOffset ?? 0) > 0;

	if (ifd0.exifOffset) {
		const exif = readIfd(view, base, ifd0.exifOffset, little);
		if (exif) {
			out.fields.taken = str(exif.values.get(0x9003));
			out.fields.digitised = str(exif.values.get(0x9004));
			out.fields.lens = str(exif.values.get(0xa434));
			out.fields.bodySerial = str(exif.values.get(0xa431));
			out.fields.lensSerial = str(exif.values.get(0xa435));
			out.fields.owner = str(exif.values.get(0xa430));
			out.hasMakerNote = exif.values.has(0x927c);
			const comment = exif.values.get(0x9286);
			if (typeof comment === 'string') {
				// usercomment has charset prefix
				const trimmed = comment
					.replace(/^ASCII\0{3}/, '')
					.replace(/\0+$/, '');
				if (trimmed) out.fields.userComment = trimmed;
			}
		}
	}

	if (ifd0.gpsOffset) {
		const gps = readIfd(view, base, ifd0.gpsOffset, little);
		if (gps) {
			const ref = (tag: number) =>
				str(gps.values.get(tag)) ?? '';
			const dms = (tag: number): number[] | undefined => {
				const v = gps.values.get(tag);
				return Array.isArray(v) ? v : undefined;
			};
			const toDecimal = (
				parts: number[] | undefined,
				sign: string,
			) => {
				if (!parts || parts.length < 3) return null;
				const dec =
					parts[0]! +
					parts[1]! / 60 +
					parts[2]! / 3600;
				return sign === 'S' || sign === 'W'
					? -dec
					: dec;
			};
			const lat = toDecimal(dms(1), ref(0));
			const lon = toDecimal(dms(3), ref(2));
			if (lat !== null && lon !== null) {
				out.gps = { lat, lon };
				const alt = gps.values.get(5);
				if (typeof alt === 'number') {
					const belowSea =
						gps.values.get(4) === 1;
					out.gps.alt = belowSea ? -alt : alt;
				}
			}
			const date = str(gps.values.get(29));
			const time = gps.values.get(7);
			if (date) {
				const hms = Array.isArray(time)
					? ` ${String(time[0]).padStart(2, '0')}:${String(time[1]).padStart(2, '0')}:${String(Math.floor(time[2] ?? 0)).padStart(2, '0')} UTC`
					: '';
				out.gpsTimestamp = date + hms;
			}
		}
	}

	return out;
}

function formatCoord(decimal: number, pos: string, neg: string): string {
	const hemi = decimal < 0 ? neg : pos;
	return `${Math.abs(decimal).toFixed(6)}° ${hemi}`;
}

function gpsDetail(gps: GpsFix): string {
	let out = `${formatCoord(gps.lat, 'N', 'S')}, ${formatCoord(gps.lon, 'E', 'W')}`;
	if (gps.alt !== undefined) out += ` · alt ${Math.round(gps.alt)} m`;
	return out;
}

function exifEntries(exif: ParsedExif, gps: GpsFix | null): MetadataEntry[] {
	const entries: MetadataEntry[] = [];
	const f = exif.fields;
	if (gps)
		entries.push({
			label: 'GPS coordinates',
			detail: gpsDetail(gps),
		});
	if (exif.gpsTimestamp)
		entries.push({
			label: 'GPS timestamp',
			detail: exif.gpsTimestamp,
		});
	const camera = [f.make, f.model].filter(Boolean).join(' ');
	if (camera) entries.push({ label: 'Camera', detail: camera });
	if (f.lens) entries.push({ label: 'Lens', detail: f.lens });
	if (f.bodySerial)
		entries.push({ label: 'Camera serial', detail: f.bodySerial });
	if (f.lensSerial)
		entries.push({ label: 'Lens serial', detail: f.lensSerial });
	if (f.owner) entries.push({ label: 'Owner name', detail: f.owner });
	if (f.taken) entries.push({ label: 'Taken', detail: f.taken });
	if (f.digitised)
		entries.push({ label: 'Digitised', detail: f.digitised });
	if (f.modified) entries.push({ label: 'Modified', detail: f.modified });
	if (f.software) entries.push({ label: 'Software', detail: f.software });
	if (f.artist) entries.push({ label: 'Artist', detail: f.artist });
	if (f.copyright)
		entries.push({ label: 'Copyright', detail: f.copyright });
	if (f.description)
		entries.push({ label: 'Description', detail: f.description });
	if (f.userComment)
		entries.push({ label: 'Comment', detail: f.userComment });
	if (exif.hasMakerNote)
		entries.push({
			label: 'MakerNote',
			detail: 'vendor data present',
		});
	if (exif.hasThumbnail)
		entries.push({
			label: 'Thumbnail',
			detail: 'embedded preview',
		});
	return entries;
}

interface JpegSegment {
	marker: number;
	start: number;
	end: number;
	payloadStart: number;
}

function jpegSegments(data: Uint8Array): JpegSegment[] {
	const view = new DataView(
		data.buffer,
		data.byteOffset,
		data.byteLength,
	);
	const segments: JpegSegment[] = [];
	let i = 2;
	while (i + 1 < data.length) {
		if (data[i] !== 0xff) break;
		let marker = data[i + 1]!;
		// skip marker fill bytes
		while (marker === 0xff && i + 2 < data.length) {
			i++;
			marker = data[i + 1]!;
		}
		// standalone markers lack length
		if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
			segments.push({
				marker,
				start: i,
				end: i + 2,
				payloadStart: -1,
			});
			i += 2;
			continue;
		}
		if (i + 4 > data.length) break;
		const length = view.getUint16(i + 2);
		if (length < 2) break;
		const end = i + 2 + length;
		if (end > data.length) break;
		segments.push({ marker, start: i, end, payloadStart: i + 4 });
		i = end;
		// sos begins entropy data
		if (marker === 0xda) break;
	}
	return segments;
}

function isXmpSegment(data: Uint8Array, seg: JpegSegment): boolean {
	if (seg.payloadStart < 0) return false;
	const head = ascii(
		data.subarray(
			seg.payloadStart,
			seg.payloadStart + XMP_HEADER.length,
		),
	);
	return head === XMP_HEADER;
}

function isExifSegment(data: Uint8Array, seg: JpegSegment): boolean {
	return (
		seg.payloadStart >= 0 &&
		ascii(data.subarray(seg.payloadStart, seg.payloadStart + 6)) ===
			'Exif\0\0'
	);
}

function parseJpeg(data: Uint8Array, report: MetadataReport): void {
	let icc = false;
	for (const seg of jpegSegments(data)) {
		const app =
			seg.marker >= 0xe0 && seg.marker <= 0xef
				? seg.marker - 0xe0
				: -1;
		if (app === 1 && isExifSegment(data, seg)) {
			const view = new DataView(
				data.buffer,
				data.byteOffset,
				data.byteLength,
			);
			const exif = parseTiff(view, seg.payloadStart + 6);
			if (exif) {
				report.entries.push(
					...exifEntries(exif, exif.gps),
				);
				if (exif.gps) report.gps = exif.gps;
			}
		} else if (app === 1 && isXmpSegment(data, seg)) {
			report.entries.push({
				label: 'XMP packet',
				detail: `${seg.end - seg.payloadStart} bytes`,
			});
		} else if (app === 13) {
			report.entries.push({
				label: 'IPTC',
				detail: 'Photoshop resource block',
			});
		} else if (app === 2) {
			icc = true;
		} else if (seg.marker === 0xfe && seg.payloadStart >= 0) {
			const view = new DataView(
				data.buffer,
				data.byteOffset,
				data.byteLength,
			);
			const text = latin1(
				view,
				seg.payloadStart,
				seg.end - seg.payloadStart,
			);
			report.entries.push({
				label: 'Comment',
				detail: text || 'present',
			});
		}
	}
	if (icc)
		report.entries.push({
			label: 'Colour profile',
			detail: 'ICC (kept)',
		});
}

function stripJpeg(data: Uint8Array, keepColour: boolean): StripResult {
	const parts: Uint8Array[] = [data.slice(0, 2)];
	const removed = new Set<string>();
	const segments = jpegSegments(data);
	let copiedThrough = 2;
	for (const seg of segments) {
		const app =
			seg.marker >= 0xe0 && seg.marker <= 0xef
				? seg.marker - 0xe0
				: -1;
		let drop: string | null = null;
		if (app === 1) {
			drop = isXmpSegment(data, seg)
				? 'XMP (APP1)'
				: 'EXIF (APP1)';
		} else if (app === 2 && !keepColour) {
			drop = 'ICC profile (APP2)';
		} else if (app === 13) {
			drop = 'IPTC (APP13)';
		} else if (seg.marker === 0xfe) {
			drop = 'Comment (COM)';
		} else if (app >= 3 && app <= 15 && app !== 14) {
			// app0/app14 affect decoding
			drop = `Application data (APP${app})`;
		}
		if (drop) {
			removed.add(drop);
		} else {
			parts.push(data.slice(seg.start, seg.end));
		}
		copiedThrough = seg.end;
	}
	// preserve scan data
	parts.push(data.slice(copiedThrough));
	return { format: 'jpeg', data: concat(parts), removed: [...removed] };
}

const PNG_METADATA_CHUNKS: Record<string, string> = {
	tEXt: 'Text (tEXt)',
	zTXt: 'Compressed text (zTXt)',
	iTXt: 'International text (iTXt)',
	eXIf: 'EXIF (eXIf)',
	tIME: 'Timestamp (tIME)',
};

interface PngChunk {
	type: string;
	start: number;
	end: number;
	dataStart: number;
	dataLength: number;
}

function pngChunks(data: Uint8Array): PngChunk[] {
	const view = new DataView(
		data.buffer,
		data.byteOffset,
		data.byteLength,
	);
	const chunks: PngChunk[] = [];
	let i = 8;
	while (i + 12 <= data.length) {
		const length = view.getUint32(i);
		const type = latin1(view, i + 4, 4);
		const end = i + 12 + length;
		if (end > data.length) break;
		chunks.push({
			type,
			start: i,
			end,
			dataStart: i + 8,
			dataLength: length,
		});
		i = end;
		if (type === 'IEND') break;
	}
	return chunks;
}

function parsePng(data: Uint8Array, report: MetadataReport): void {
	const view = new DataView(
		data.buffer,
		data.byteOffset,
		data.byteLength,
	);
	let icc = false;
	for (const chunk of pngChunks(data)) {
		if (chunk.type === 'eXIf') {
			const exif = parseTiff(view, chunk.dataStart);
			if (exif) {
				report.entries.push(
					...exifEntries(exif, exif.gps),
				);
				if (exif.gps) report.gps = exif.gps;
			}
		} else if (chunk.type === 'tEXt') {
			const raw = latin1(
				view,
				chunk.dataStart,
				chunk.dataLength,
			);
			const nul = raw.indexOf('\0');
			const keyword = nul < 0 ? raw : raw.slice(0, nul);
			const text = nul < 0 ? '' : raw.slice(nul + 1);
			report.entries.push({
				label: keyword ? `Text: ${keyword}` : 'Text',
				detail: text || 'present',
			});
		} else if (chunk.type === 'zTXt' || chunk.type === 'iTXt') {
			const raw = latin1(
				view,
				chunk.dataStart,
				Math.min(chunk.dataLength, 80),
			);
			const keyword = raw.split('\0')[0];
			report.entries.push({
				label: keyword ? `Text: ${keyword}` : 'Text',
				detail: 'compressed',
			});
		} else if (chunk.type === 'tIME') {
			report.entries.push({
				label: 'Modification time',
				detail: 'present',
			});
		} else if (chunk.type === 'iCCP') {
			icc = true;
		}
	}
	if (icc)
		report.entries.push({
			label: 'Colour profile',
			detail: 'ICC (kept)',
		});
}

function stripPng(data: Uint8Array, keepColour: boolean): StripResult {
	const parts: Uint8Array[] = [data.slice(0, 8)];
	const removed = new Set<string>();
	let copiedThrough = 8;
	for (const chunk of pngChunks(data)) {
		let drop = PNG_METADATA_CHUNKS[chunk.type] ?? null;
		if (chunk.type === 'iCCP' && !keepColour)
			drop = 'Colour profile (iCCP)';
		if (drop) {
			removed.add(drop);
		} else {
			parts.push(data.slice(chunk.start, chunk.end));
		}
		copiedThrough = chunk.end;
	}
	parts.push(data.slice(copiedThrough));
	return { format: 'png', data: concat(parts), removed: [...removed] };
}

interface RiffChunk {
	fourcc: string;
	start: number;
	// riff chunks include padding
	end: number;
	dataStart: number;
	dataLength: number;
}

function riffChunks(data: Uint8Array): RiffChunk[] {
	const view = new DataView(
		data.buffer,
		data.byteOffset,
		data.byteLength,
	);
	const chunks: RiffChunk[] = [];
	let i = 12;
	while (i + 8 <= data.length) {
		const fourcc = latin1(view, i, 4);
		const length = view.getUint32(i + 4, true);
		const end = i + 8 + length + (length % 2);
		if (end > data.length) break;
		chunks.push({
			fourcc,
			start: i,
			end,
			dataStart: i + 8,
			dataLength: length,
		});
		i = end;
	}
	return chunks;
}

function parseWebp(data: Uint8Array, report: MetadataReport): void {
	const view = new DataView(
		data.buffer,
		data.byteOffset,
		data.byteLength,
	);
	let icc = false;
	for (const chunk of riffChunks(data)) {
		if (chunk.fourcc === 'EXIF') {
			// webp exif header optional
			const skip =
				ascii(
					data.subarray(
						chunk.dataStart,
						chunk.dataStart + 6,
					),
				) === 'Exif\0\0'
					? 6
					: 0;
			const exif = parseTiff(view, chunk.dataStart + skip);
			if (exif) {
				report.entries.push(
					...exifEntries(exif, exif.gps),
				);
				if (exif.gps) report.gps = exif.gps;
			}
		} else if (chunk.fourcc === 'XMP ') {
			report.entries.push({
				label: 'XMP packet',
				detail: `${chunk.dataLength} bytes`,
			});
		} else if (chunk.fourcc === 'ICCP') {
			icc = true;
		}
	}
	if (icc)
		report.entries.push({
			label: 'Colour profile',
			detail: 'ICC (kept)',
		});
}

function stripWebp(data: Uint8Array, keepColour: boolean): StripResult {
	const parts: Uint8Array[] = [];
	const removed = new Set<string>();
	for (const chunk of riffChunks(data)) {
		let drop: string | null = null;
		if (chunk.fourcc === 'EXIF') drop = 'EXIF';
		else if (chunk.fourcc === 'XMP ') drop = 'XMP';
		else if (chunk.fourcc === 'ICCP' && !keepColour)
			drop = 'Colour profile (ICCP)';
		if (drop) {
			removed.add(drop);
			continue;
		}
		if (chunk.fourcc === 'VP8X') {
			// clear dropped-chunk flags
			const fixed = data.slice(chunk.start, chunk.end);
			if (!keepColour) fixed[8]! &= ~0x20;
			fixed[8]! &= ~0x08; // exif flag
			fixed[8]! &= ~0x04; // xmp flag
			parts.push(fixed);
		} else {
			parts.push(data.slice(chunk.start, chunk.end));
		}
	}
	const body = concat(parts);
	const header = new Uint8Array(12);
	header.set(data.subarray(0, 12));
	new DataView(header.buffer).setUint32(4, body.length + 4, true);
	return {
		format: 'webp',
		data: concat([header, body]),
		removed: [...removed],
	};
}

// gif length-prefixed blocks
function subBlocksEnd(data: Uint8Array, at: number): number {
	let i = at;
	while (i < data.length) {
		const size = data[i]!;
		i += 1 + size;
		if (size === 0) break;
	}
	return Math.min(i, data.length);
}

function parseGif(data: Uint8Array, report: MetadataReport): void {
	forGifBlocks(data, (kind, start, end) => {
		if (kind === 'comment') {
			// skip block size bytes
			let text = '';
			let j = start;
			while (j < end) {
				const size = data[j]!;
				if (size === 0) break;
				for (let k = 0; k < size; k++)
					text += String.fromCharCode(
						data[j + 1 + k]!,
					);
				j += 1 + size;
			}
			report.entries.push({
				label: 'Comment',
				detail: text.trim() || 'present',
			});
		} else if (kind === 'xmp') {
			report.entries.push({
				label: 'XMP packet',
				detail: 'present',
			});
		}
	});
}

function forGifBlocks(
	data: Uint8Array,
	visit: (kind: 'comment' | 'xmp', start: number, end: number) => void,
): void {
	if (data.length < 13) return;
	const view = new DataView(
		data.buffer,
		data.byteOffset,
		data.byteLength,
	);
	const gctFlag = data[10]! & 0x80;
	const gctSize = gctFlag ? 3 * 2 ** ((data[10]! & 0x07) + 1) : 0;
	let i = 13 + gctSize;
	while (i < data.length) {
		const introducer = data[i]!;
		if (introducer === 0x3b) break;
		if (introducer === 0x21) {
			const label = data[i + 1]!;
			if (label === 0xfe) {
				const end = subBlocksEnd(data, i + 2);
				visit('comment', i + 2, end);
				i = end;
			} else if (label === 0xff) {
				const blockSize = data[i + 2]!;
				const id =
					blockSize === 11
						? latin1(view, i + 3, 8)
						: '';
				const end = subBlocksEnd(
					data,
					i + 3 + blockSize,
				);
				if (id === 'XMP Data') visit('xmp', i, end);
				i = end;
			} else {
				// gce has fixed length
				i =
					label === 0xf9
						? i + 2 + 5
						: subBlocksEnd(data, i + 2);
			}
		} else if (introducer === 0x2c) {
			// skip image data blocks
			const lctFlag = data[i + 9]! & 0x80;
			const lctSize = lctFlag
				? 3 * 2 ** ((data[i + 9]! & 0x07) + 1)
				: 0;
			i = subBlocksEnd(data, i + 10 + lctSize + 1);
		} else {
			break;
		}
	}
}

function stripGif(data: Uint8Array): StripResult {
	if (data.length < 13) return { format: 'gif', data, removed: [] };
	const view = new DataView(
		data.buffer,
		data.byteOffset,
		data.byteLength,
	);
	const gctFlag = data[10]! & 0x80;
	const gctSize = gctFlag ? 3 * 2 ** ((data[10]! & 0x07) + 1) : 0;
	const parts: Uint8Array[] = [data.slice(0, 13 + gctSize)];
	const removed = new Set<string>();
	let i = 13 + gctSize;
	while (i < data.length) {
		const introducer = data[i]!;
		if (introducer === 0x3b) {
			parts.push(data.slice(i));
			i = data.length;
			break;
		}
		if (introducer === 0x21 && data[i + 1] === 0xfe) {
			removed.add('Comment');
			i = subBlocksEnd(data, i + 2);
			continue;
		}
		if (introducer === 0x21 && data[i + 1] === 0xff) {
			const blockSize = data[i + 2]!;
			const id =
				blockSize === 11 ? latin1(view, i + 3, 8) : '';
			const end = subBlocksEnd(data, i + 3 + blockSize);
			if (id === 'XMP Data') {
				removed.add('XMP');
				i = end;
				continue;
			}
			parts.push(data.slice(i, end));
			i = end;
			continue;
		}
		if (introducer === 0x21) {
			const end =
				data[i + 1] === 0xf9
					? i + 2 + 5
					: subBlocksEnd(data, i + 2);
			parts.push(data.slice(i, end));
			i = end;
			continue;
		}
		if (introducer === 0x2c) {
			const lctFlag = data[i + 9]! & 0x80;
			const lctSize = lctFlag
				? 3 * 2 ** ((data[i + 9]! & 0x07) + 1)
				: 0;
			const end = subBlocksEnd(data, i + 10 + lctSize + 1);
			parts.push(data.slice(i, end));
			i = end;
			continue;
		}
		break;
	}
	if (i < data.length) parts.push(data.slice(i));
	return { format: 'gif', data: concat(parts), removed: [...removed] };
}

export function parseMetadata(data: Uint8Array): MetadataReport {
	const format = detectFormat(data);
	// c2pa manifest markers
	const c2pa =
		bytesIndexOf(data, 'jumb') !== -1 &&
		bytesIndexOf(data, 'c2pa') !== -1;
	const report: MetadataReport = { format, entries: [], gps: null, c2pa };
	if (format === 'jpeg') parseJpeg(data, report);
	else if (format === 'png') parsePng(data, report);
	else if (format === 'webp') parseWebp(data, report);
	else if (format === 'gif') parseGif(data, report);
	return report;
}

// null for unknown containers
export function stripMetadata(
	data: Uint8Array,
	options: StripOptions = {},
): StripResult | null {
	const keepColour = options.keepColourProfile ?? true;
	switch (detectFormat(data)) {
		case 'jpeg':
			return stripJpeg(data, keepColour);
		case 'png':
			return stripPng(data, keepColour);
		case 'webp':
			return stripWebp(data, keepColour);
		case 'gif':
			return stripGif(data);
		default:
			return null;
	}
}
