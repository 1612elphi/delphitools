import { module, test } from 'qunit';
import { buildIco, dataUrlToBytes } from 'delphitools-v2/lib/ico';

const DIR_SIZE = 6;
const ENTRY_SIZE = 16;

/** Distinguishable filler, so a misplaced offset shows up as the wrong byte. */
function frame(size: number, length: number, fill: number) {
	return { size, data: new Uint8Array(length).fill(fill) };
}

module('Unit | Lib | ico', function () {
	test('writes an ICONDIR naming the frame count', function (assert) {
		const view = new DataView(
			buildIco([frame(16, 4, 0xaa), frame(32, 6, 0xbb)]),
		);
		assert.strictEqual(view.getUint16(0, true), 0, 'reserved');
		assert.strictEqual(view.getUint16(2, true), 1, 'type is icon');
		assert.strictEqual(view.getUint16(4, true), 2, 'two frames');
	});

	test('sizes the buffer to header plus every frame', function (assert) {
		const buffer = buildIco([
			frame(16, 4, 0xaa),
			frame(32, 6, 0xbb),
		]);
		assert.strictEqual(
			buffer.byteLength,
			DIR_SIZE + 2 * ENTRY_SIZE + 4 + 6,
		);
	});

	test('orders frames smallest first regardless of input order', function (assert) {
		const view = new DataView(
			buildIco([
				frame(48, 2, 0xcc),
				frame(16, 2, 0xaa),
				frame(32, 2, 0xbb),
			]),
		);
		const widths = [0, 1, 2].map((i) =>
			view.getUint8(DIR_SIZE + i * ENTRY_SIZE),
		);
		assert.deepEqual(widths, [16, 32, 48]);
	});

	test('points each entry at its own bytes', function (assert) {
		const buffer = buildIco([
			frame(16, 4, 0xaa),
			frame(32, 6, 0xbb),
		]);
		const view = new DataView(buffer);
		const bytes = new Uint8Array(buffer);

		for (const [i, [length, fill]] of [
			[4, 0xaa],
			[6, 0xbb],
		].entries()) {
			const entry = DIR_SIZE + i * ENTRY_SIZE;
			assert.strictEqual(
				view.getUint32(entry + 8, true),
				length,
				`frame ${i} length`,
			);
			const offset = view.getUint32(entry + 12, true);
			assert.deepEqual(
				Array.from(
					bytes.slice(offset, offset + length!),
				),
				Array(length).fill(fill),
				`frame ${i} data`,
			);
		}
	});

	// The width and height fields are a single byte each, so the format spells
	// 256 as 0. Not reachable from the tool, which caps the .ico at 64.
	test('encodes 256 as zero', function (assert) {
		const view = new DataView(buildIco([frame(256, 2, 0xaa)]));
		assert.strictEqual(view.getUint8(DIR_SIZE), 0);
		assert.strictEqual(view.getUint8(DIR_SIZE + 1), 0);
	});

	test('decodes the base64 payload of a data URL', function (assert) {
		assert.deepEqual(
			Array.from(
				dataUrlToBytes(
					'data:image/png;base64,AAECiv8=',
				),
			),
			[0, 1, 2, 0x8a, 0xff],
		);
	});
});
