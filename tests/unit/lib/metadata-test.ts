import { module, test } from 'qunit';
import {
	parseMetadata,
	stripMetadata,
	type MetadataReport,
} from 'delphitools-v2/lib/metadata';

/*
 * Fixtures are built in code: each container wraps the same hand-laid-out
 * TIFF block (TestCam / Model X, taken 2024:04:30, GPS 51.5° N 0.126667° E
 * at 100 m). Byte offsets in buildTiff are precomputed from the layout notes
 * above each constant.
 */

function asciiBytes(text: string): number[] {
	return [...text].map((c) => c.charCodeAt(0));
}

/** A 12-byte IFD entry; `value` is the 4-byte value/offset field. */
function ifdEntry(
	tag: number,
	type: number,
	count: number,
	value: number | number[],
): number[] {
	const valueBytes =
		typeof value === 'number'
			? [
					value & 0xff,
					(value >> 8) & 0xff,
					(value >> 16) & 0xff,
					(value >> 24) & 0xff,
				]
			: value;
	return [
		tag & 0xff,
		tag >> 8,
		type,
		0,
		count & 0xff,
		(count >> 8) & 0xff,
		(count >> 16) & 0xff,
		(count >> 24) & 0xff,
		...valueBytes,
	];
}

const u16 = (n: number) => [n & 0xff, n >> 8];
const u32le = (n: number) => [
	n & 0xff,
	(n >> 8) & 0xff,
	(n >> 16) & 0xff,
	(n >> 24) & 0xff,
];
const u32be = (n: number) => [
	(n >> 24) & 0xff,
	(n >> 16) & 0xff,
	(n >> 8) & 0xff,
	n & 0xff,
];
const rational = (num: number, den: number) => [...u32le(num), ...u32le(den)];

const MAKE = 'TestCam\0'; // 8 bytes @ 206
const MODEL = 'Model X\0'; // 8 @ 214
const MODIFIED = '2024:05:01 12:00:00\0'; // 20 @ 222
const TAKEN = '2024:04:30 09:15:22\0'; // 20 @ 242
const SERIAL = 'SN-0042\0'; // 8 @ 262
// lat rationals @ 270 (24), lon @ 294 (24), alt @ 318 (8), datestamp @ 326 (11)

function buildTiff(): Uint8Array {
	const ifd0 = [
		...u16(5),
		...ifdEntry(0x010f, 2, 8, 206), // Make
		...ifdEntry(0x0110, 2, 8, 214), // Model
		...ifdEntry(0x0132, 2, 20, 222), // DateTime
		...ifdEntry(0x8769, 4, 1, 74), // ExifIFD pointer
		...ifdEntry(0x8825, 4, 1, 116), // GPS IFD pointer
		...u32le(0), // no IFD1
	];
	const exifIfd = [
		...u16(3),
		...ifdEntry(0x9003, 2, 20, 242), // DateTimeOriginal
		...ifdEntry(0x927c, 7, 4, [1, 2, 3, 4]), // MakerNote, inline
		...ifdEntry(0xa431, 2, 8, 262), // BodySerialNumber
		...u32le(0),
	];
	const gpsIfd = [
		...u16(7),
		...ifdEntry(0x0000, 2, 2, [0x4e, 0, 0, 0]), // latRef 'N'
		...ifdEntry(0x0001, 5, 3, 270), // lat
		...ifdEntry(0x0002, 2, 2, [0x45, 0, 0, 0]), // lonRef 'E'
		...ifdEntry(0x0003, 5, 3, 294), // lon
		...ifdEntry(0x0004, 1, 1, [0, 0, 0, 0]), // altRef: above sea
		...ifdEntry(0x0005, 5, 1, 318), // alt
		...ifdEntry(0x001d, 2, 11, 326), // datestamp
		...u32le(0),
	];
	return new Uint8Array([
		0x49,
		0x49,
		42,
		0,
		8,
		0,
		0,
		0, // II header, IFD0 at 8
		...ifd0, // 8..74
		...exifIfd, // 74..116
		...gpsIfd, // 116..194
		...asciiBytes(MAKE),
		...asciiBytes(MODEL),
		...asciiBytes(MODIFIED),
		...asciiBytes(TAKEN),
		...asciiBytes(SERIAL),
		...rational(51, 1),
		...rational(30, 1),
		...rational(0, 1),
		...rational(0, 1),
		...rational(7, 1),
		...rational(36, 1),
		...rational(100, 1),
		...asciiBytes('2024:05:01\0'),
	]);
}

function jpegSegment(marker: number, payload: number[]): number[] {
	const length = payload.length + 2;
	return [0xff, marker, length >> 8, length & 0xff, ...payload];
}

const SCAN_BYTES = [0x11, 0x22, 0x33, 0x44];

function buildJpeg(withMetadata = true): Uint8Array {
	const tiff = buildTiff();
	const parts: number[][] = [[0xff, 0xd8]];
	if (withMetadata) {
		parts.push(
			jpegSegment(0xe1, [...asciiBytes('Exif\0\0'), ...tiff]),
			jpegSegment(0xe1, [
				...asciiBytes('http://ns.adobe.com/xap/1.0/\0'),
				...asciiBytes('<x:xmpmeta/>'),
			]),
			jpegSegment(0xed, [
				...asciiBytes('Photoshop 3.0\0'),
				0,
				1,
				2,
			]),
			jpegSegment(0xe2, [
				...asciiBytes('ICC_PROFILE\0'),
				1,
				1,
				9,
				9,
			]),
			jpegSegment(0xfe, asciiBytes('hello comment')),
		);
	}
	parts.push(
		jpegSegment(0xdb, [0, 1, 2, 3]), // DQT stub
		jpegSegment(0xc0, [8, 0, 4, 0, 4, 1, 1, 0x11, 0]), // SOF0 stub
		jpegSegment(0xc4, [0, 1]), // DHT stub
		jpegSegment(0xda, [1, 1, 0, 0, 63, 0]), // SOS
		SCAN_BYTES,
		[0xff, 0xd9],
	);
	return new Uint8Array(parts.flat());
}

function pngChunk(type: string, payload: number[]): number[] {
	return [
		...u32be(payload.length),
		...asciiBytes(type),
		...payload,
		0,
		0,
		0,
		0, // CRC never validated by the parser
	];
}

function buildPng(): Uint8Array {
	return new Uint8Array(
		[
			[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
			pngChunk('IHDR', [
				...u32be(4),
				...u32be(4),
				8,
				2,
				0,
				0,
				0,
			]),
			pngChunk('eXIf', [...buildTiff()]),
			pngChunk('tEXt', asciiBytes('Author\0Ruby')),
			pngChunk('tIME', [0x07, 0xe8, 5, 1, 12, 0, 0]),
			pngChunk('IDAT', [1, 2, 3]),
			pngChunk('IEND', []),
		].flat(),
	);
}

function riffChunk(fourcc: string, payload: number[]): number[] {
	const pad = payload.length % 2 ? [0] : [];
	return [
		...asciiBytes(fourcc),
		...u32le(payload.length),
		...payload,
		...pad,
	];
}

function buildWebp(): Uint8Array {
	const body = [
		...asciiBytes('WEBP'),
		...riffChunk('VP8X', [0x0c, 0, 0, 0, 3, 0, 0, 3, 0, 0]), // EXIF + XMP flags
		...riffChunk('EXIF', [...buildTiff()]),
		...riffChunk('XMP ', asciiBytes('<x:xmpmeta/>')),
		...riffChunk('VP8 ', [1, 2, 3, 4]),
	];
	return new Uint8Array([
		...asciiBytes('RIFF'),
		...u32le(body.length),
		...body,
	]);
}

function buildGif(): Uint8Array {
	return new Uint8Array([
		...asciiBytes('GIF89a'),
		4,
		0,
		4,
		0,
		0x70,
		0,
		0, // LSD, no global colour table
		0x21,
		0xfe,
		5,
		...asciiBytes('hello'),
		0, // comment extension
		0x2c,
		0,
		0,
		0,
		0,
		4,
		0,
		4,
		0,
		0, // image descriptor
		2,
		2,
		0x44,
		1,
		0, // LZW min + sub-blocks
		0x3b,
	]);
}

function entry(report: MetadataReport, label: string) {
	return report.entries.find((e) => e.label === label);
}

module('Unit | Lib | metadata', function () {
	test('detects container formats', function (assert) {
		assert.strictEqual(parseMetadata(buildJpeg()).format, 'jpeg');
		assert.strictEqual(parseMetadata(buildPng()).format, 'png');
		assert.strictEqual(parseMetadata(buildWebp()).format, 'webp');
		assert.strictEqual(parseMetadata(buildGif()).format, 'gif');
		assert.strictEqual(
			parseMetadata(
				new Uint8Array([
					1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
				]),
			).format,
			null,
		);
	});

	test('flags a C2PA manifest by its JUMBF markers', function (assert) {
		assert.false(
			parseMetadata(buildJpeg()).c2pa,
			'plain JPEG carries no manifest',
		);
		const withManifest = new Uint8Array([
			...buildJpeg(),
			...asciiBytes('jumb'),
			...asciiBytes('c2pa'),
		]);
		assert.true(
			parseMetadata(withManifest).c2pa,
			'jumb + c2pa byte strings detected',
		);
	});

	test('reads EXIF fields and GPS from a JPEG', function (assert) {
		const report = parseMetadata(buildJpeg());
		assert.deepEqual(report.gps, {
			lat: 51.5,
			lon: 0.12666666666666668,
			alt: 100,
		});
		assert.strictEqual(
			entry(report, 'GPS coordinates')?.detail,
			'51.500000° N, 0.126667° E · alt 100 m',
		);
		assert.strictEqual(
			entry(report, 'GPS timestamp')?.detail,
			'2024:05:01',
		);
		assert.strictEqual(
			entry(report, 'Camera')?.detail,
			'TestCam Model X',
		);
		assert.strictEqual(
			entry(report, 'Camera serial')?.detail,
			'SN-0042',
		);
		assert.strictEqual(
			entry(report, 'Taken')?.detail,
			'2024:04:30 09:15:22',
		);
		assert.strictEqual(
			entry(report, 'Modified')?.detail,
			'2024:05:01 12:00:00',
		);
		assert.ok(
			entry(report, 'MakerNote'),
			'MakerNote presence reported',
		);
		assert.strictEqual(
			entry(report, 'Comment')?.detail,
			'hello comment',
		);
		assert.ok(entry(report, 'XMP packet'), 'XMP segment reported');
		assert.ok(entry(report, 'IPTC'), 'IPTC segment reported');
		assert.strictEqual(
			entry(report, 'Colour profile')?.detail,
			'ICC (kept)',
		);
	});

	test('strips JPEG metadata segments and keeps the scan byte-for-byte', function (assert) {
		const original = buildJpeg();
		const result = stripMetadata(original)!;
		assert.deepEqual(result.removed.sort(), [
			'Comment (COM)',
			'EXIF (APP1)',
			'IPTC (APP13)',
			'XMP (APP1)',
		]);
		const tail = result.data.slice(-(SCAN_BYTES.length + 2));
		assert.deepEqual(
			[...tail],
			[...SCAN_BYTES, 0xff, 0xd9],
			'scan data + EOI preserved',
		);

		const reparsed = parseMetadata(result.data);
		assert.deepEqual(
			reparsed.entries.map((e) => e.label),
			['Colour profile'],
			'only the kept ICC remains',
		);
		assert.strictEqual(reparsed.gps, null);

		const asText = [...result.data]
			.map((b) => String.fromCharCode(b))
			.join('');
		assert.notOk(asText.includes('TestCam'), 'camera string gone');
		assert.notOk(asText.includes('hello comment'), 'comment gone');
		assert.ok(
			asText.includes('ICC_PROFILE'),
			'ICC kept by default',
		);
	});

	test('drops the ICC profile only when asked', function (assert) {
		const result = stripMetadata(buildJpeg(), {
			keepColourProfile: false,
		})!;
		assert.ok(result.removed.includes('ICC profile (APP2)'));
		const asText = [...result.data]
			.map((b) => String.fromCharCode(b))
			.join('');
		assert.notOk(asText.includes('ICC_PROFILE'));
	});

	test('a clean JPEG round-trips with nothing removed', function (assert) {
		const clean = buildJpeg(false);
		const result = stripMetadata(clean)!;
		assert.deepEqual(result.removed, []);
		assert.deepEqual(
			[...result.data],
			[...clean],
			'output identical to input',
		);
	});

	test('reads and strips PNG text, eXIf and tIME chunks', function (assert) {
		const report = parseMetadata(buildPng());
		assert.strictEqual(
			entry(report, 'Camera')?.detail,
			'TestCam Model X',
		);
		assert.deepEqual(report.gps?.lat, 51.5);
		assert.strictEqual(
			entry(report, 'Text: Author')?.detail,
			'Ruby',
		);
		assert.ok(entry(report, 'Modification time'), 'tIME reported');

		const result = stripMetadata(buildPng())!;
		assert.deepEqual(result.removed.sort(), [
			'EXIF (eXIf)',
			'Text (tEXt)',
			'Timestamp (tIME)',
		]);
		const reparsed = parseMetadata(result.data);
		assert.deepEqual(reparsed.entries, []);
		// IHDR..IEND survive as the only chunks.
		const asText = [...result.data]
			.map((b) => String.fromCharCode(b))
			.join('');
		assert.ok(asText.includes('IHDR'), 'IHDR kept');
		assert.ok(asText.includes('IDAT'), 'IDAT kept');
		assert.ok(asText.includes('IEND'), 'IEND kept');
		assert.notOk(asText.includes('eXIf'));
		assert.notOk(asText.includes('Ruby'));
	});

	test('reads and strips WebP EXIF/XMP, fixing VP8X flags and RIFF size', function (assert) {
		const report = parseMetadata(buildWebp());
		assert.deepEqual(report.gps?.lat, 51.5);
		assert.ok(entry(report, 'XMP packet'), 'XMP chunk reported');

		const original = buildWebp();
		const result = stripMetadata(original)!;
		assert.deepEqual(result.removed.sort(), ['EXIF', 'XMP']);
		const reparsed = parseMetadata(result.data);
		assert.deepEqual(reparsed.entries, []);

		const view = new DataView(result.data.buffer);
		assert.strictEqual(
			view.getUint32(4, true),
			result.data.length - 8,
			'RIFF size recomputed',
		);
		// The VP8X flags byte (chunk payload start = 12 + 8) no longer
		// advertises EXIF (0x08) or XMP (0x04).
		assert.strictEqual(
			view.getUint8(20) & 0x0c,
			0,
			'VP8X flags cleared',
		);
		const asText = [...result.data]
			.map((b) => String.fromCharCode(b))
			.join('');
		assert.ok(asText.includes('VP8 '), 'pixel chunk kept');
	});

	test('reads and strips GIF comment extensions', function (assert) {
		const report = parseMetadata(buildGif());
		assert.strictEqual(entry(report, 'Comment')?.detail, 'hello');

		const result = stripMetadata(buildGif())!;
		assert.deepEqual(result.removed, ['Comment']);
		const asText = [...result.data]
			.map((b) => String.fromCharCode(b))
			.join('');
		assert.notOk(asText.includes('hello'), 'comment block gone');
		assert.strictEqual(
			result.data[result.data.length - 1],
			0x3b,
			'trailer kept',
		);
		// Image descriptor + LZW data survive.
		assert.ok(asText.includes('GIF89a'));
	});

	test('returns null for containers it cannot edit', function (assert) {
		assert.strictEqual(stripMetadata(new Uint8Array(20)), null);
	});
});
