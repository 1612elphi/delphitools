import { module, test } from 'qunit';
import { AnimatedGifEncoder } from 'delphitools-v2/lib/gif';

interface GifStructure {
	extensions: number[];
	frames: number;
	trailed: boolean;
}

/**
 * Walks the block stream after the 13-byte header + logical screen
 * descriptor, so counts cannot be faked by 0x2c bytes inside LZW data.
 */
function walk(bytes: Uint8Array): GifStructure {
	const out: GifStructure = { extensions: [], frames: 0, trailed: false };
	let i = 13;

	const skipSubBlocks = () => {
		while (bytes[i] !== 0) i += bytes[i]! + 1;
		i++;
	};

	while (i < bytes.length) {
		const block = bytes[i]!;
		if (block === 0x3b) {
			out.trailed = true;
			break;
		}
		if (block === 0x21) {
			out.extensions.push(bytes[i + 1]!);
			i += 2;
			skipSubBlocks();
			continue;
		}
		if (block === 0x2c) {
			out.frames++;
			const flags = bytes[i + 9]!;
			i += 10;
			if (flags & 0x80) i += 3 * (2 << (flags & 0x07));
			i++; // LZW minimum code size
			skipSubBlocks();
			continue;
		}
		throw new Error(`unknown block 0x${block.toString(16)}`);
	}
	return out;
}

module('Unit | Lib | gif (animated)', function () {
	test('writes a walkable two-frame looping stream', function (assert) {
		const encoder = new AnimatedGifEncoder(2, 2);
		const red = new Uint8ClampedArray([
			255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0,
			0, 255,
		]);
		const blue = new Uint8ClampedArray([
			0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0,
			255, 255,
		]);
		encoder.addFrame(red, 100);
		encoder.addFrame(blue, 100);
		const bytes = encoder.finish();

		assert.strictEqual(
			String.fromCharCode(...bytes.subarray(0, 6)),
			'GIF89a',
		);
		// Logical screen: 2 × 2, no global colour table.
		assert.deepEqual(
			[...bytes.subarray(6, 11)],
			[2, 0, 2, 0, 7 << 4],
		);
		assert.strictEqual(
			String.fromCharCode(...bytes.subarray(16, 27)),
			'NETSCAPE2.0',
		);

		const structure = walk(bytes);
		assert.strictEqual(structure.frames, 2);
		assert.true(structure.trailed, 'ends with the trailer');
		// One application extension, one graphic control per frame.
		assert.deepEqual(structure.extensions, [0xff, 0xf9, 0xf9]);
	});

	test('clamps the frame delay to 2cs', function (assert) {
		const encoder = new AnimatedGifEncoder(1, 1);
		encoder.addFrame(new Uint8ClampedArray([0, 0, 0, 255]), 5);
		const bytes = encoder.finish();
		// GCE after the 19-byte netscape block: 0x21 0xf9 0x04 flags lo hi.
		const gce = bytes.subarray(32, 40);
		assert.strictEqual(gce[0], 0x21);
		assert.strictEqual(gce[1], 0xf9);
		assert.strictEqual(gce[4], 2, 'delay low byte');
		assert.strictEqual(gce[5], 0, 'delay high byte');
	});
});
