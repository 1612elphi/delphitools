import { module, test } from 'qunit';
import {
	createCompressor,
	formatBytes,
	savingsPercent,
	COMPRESS_EXTENSIONS,
	QUALITY_FORMATS,
	OPAQUE_FORMATS,
	type CompressFormat,
} from 'delphitools-v2/lib/image-compress';

module('Unit | Lib | image-compress', function () {
	test('formatBytes picks the unit by magnitude', function (assert) {
		assert.strictEqual(formatBytes(0), '0 B');
		assert.strictEqual(formatBytes(512), '512 B');
		assert.strictEqual(formatBytes(1023), '1023 B');
		assert.strictEqual(formatBytes(1024), '1.0 KB');
		assert.strictEqual(formatBytes(1536), '1.5 KB');
		assert.strictEqual(formatBytes(1024 * 1024 - 1), '1024.0 KB');
		assert.strictEqual(formatBytes(1024 * 1024), '1.0 MB');
		assert.strictEqual(formatBytes(3.24 * 1024 * 1024), '3.2 MB');
	});

	test('savingsPercent is negative when the output shrinks', function (assert) {
		assert.strictEqual(savingsPercent(1000, 550), -45);
		assert.strictEqual(savingsPercent(1000, 1120), 12);
		assert.strictEqual(savingsPercent(1000, 1000), 0);
	});

	test('savingsPercent guards a zero-length input', function (assert) {
		assert.strictEqual(savingsPercent(0, 100), 0);
	});

	test('every format has a download extension', function (assert) {
		const formats: CompressFormat[] = [
			'mozjpeg',
			'webp',
			'oxipng',
			'avif',
		];
		for (const format of formats) {
			assert.ok(
				COMPRESS_EXTENSIONS[format],
				`${format} has an extension`,
			);
		}
		assert.strictEqual(COMPRESS_EXTENSIONS.mozjpeg, 'jpg');
		assert.strictEqual(COMPRESS_EXTENSIONS.oxipng, 'png');
	});

	test('lossless OxiPNG takes no quality slider; opaque MozJPEG takes no alpha', function (assert) {
		assert.false(QUALITY_FORMATS.includes('oxipng'));
		assert.true(QUALITY_FORMATS.includes('mozjpeg'));
		assert.true(QUALITY_FORMATS.includes('webp'));
		assert.true(QUALITY_FORMATS.includes('avif'));
		assert.deepEqual(OPAQUE_FORMATS, ['mozjpeg']);
	});
});

interface FakeWorker {
	onmessage: ((event: { data: unknown }) => void) | null;
	onerror: ((event: { message?: string }) => void) | null;
	sent: Array<{ id: number }>;
	terminated: boolean;
	postMessage(message: unknown): void;
	terminate(): void;
}

function fakeWorker(): FakeWorker {
	const worker: FakeWorker = {
		onmessage: null,
		onerror: null,
		sent: [],
		terminated: false,
		postMessage(message) {
			worker.sent.push(message as { id: number });
		},
		terminate() {
			worker.terminated = true;
		},
	};
	return worker;
}

function fakeImageData(): ImageData {
	return new ImageData(new Uint8ClampedArray([1, 2, 3, 4]), 1, 1);
}

/** a machine over workers it spawns itself, so no global state is touched */
function harness(requestTimeoutMs = 30_000) {
	const workers: FakeWorker[] = [];
	const { compressImageData } = createCompressor({
		requestTimeoutMs,
		spawnWorker: () => {
			const worker = fakeWorker();
			workers.push(worker);
			return worker as unknown as Worker;
		},
	});
	return { compressImageData, workers };
}

module('Unit | Lib | image-compress worker machine', function () {
	test('a successful response resolves into a mime-tagged Blob', async function (assert) {
		const { compressImageData, workers } = harness();
		const promise = compressImageData(fakeImageData(), 'webp');
		const request = workers[0]!.sent[0]!;
		workers[0]!.onmessage?.({
			data: {
				id: request.id,
				ok: true,
				bytes: new Uint8Array([9, 9, 9]),
				mime: 'image/webp',
			},
		});
		const blob = await promise;
		assert.strictEqual(blob.type, 'image/webp');
		assert.strictEqual(blob.size, 3);
		assert.false(workers[0]!.terminated, 'worker stays in service');
	});

	test('an error payload rejects the request', async function (assert) {
		const { compressImageData, workers } = harness();
		const promise = compressImageData(fakeImageData(), 'mozjpeg');
		const request = workers[0]!.sent[0]!;
		workers[0]!.onmessage?.({
			data: {
				id: request.id,
				ok: false,
				error: 'MozJPEG encoding failed',
			},
		});
		await assert.rejects(promise, /MozJPEG encoding failed/);
	});

	test('a worker that dies mid-encode rejects pending, and the next request spawns a fresh worker', async function (assert) {
		const { compressImageData, workers } = harness();
		const promise = compressImageData(fakeImageData(), 'webp');
		workers[0]!.onerror?.({ message: 'wasm trap' });
		await assert.rejects(promise, /wasm trap/);
		assert.true(workers[0]!.terminated);

		const next = compressImageData(fakeImageData(), 'webp');
		assert.strictEqual(workers.length, 2, 'fresh worker spawned');
		workers[1]!.onmessage?.({
			data: {
				id: workers[1]!.sent[0]!.id,
				ok: true,
				bytes: new Uint8Array([1]),
				mime: 'image/webp',
			},
		});
		await next;
	});

	test('a silently killed worker (no response, no error) trips the watchdog instead of hanging forever', async function (assert) {
		const { compressImageData, workers } = harness(25);
		const promise = compressImageData(fakeImageData(), 'mozjpeg');
		await assert.rejects(promise, /timed out/);
		assert.true(workers[0]!.terminated, 'wedged worker recycled');

		const next = compressImageData(fakeImageData(), 'webp');
		assert.strictEqual(
			workers.length,
			2,
			'fresh worker for the retry',
		);
		workers[1]!.onmessage?.({
			data: {
				id: workers[1]!.sent[0]!.id,
				ok: true,
				bytes: new Uint8Array([1]),
				mime: 'image/webp',
			},
		});
		await next;
	});

	test('a late response for an already-failed request is ignored', async function (assert) {
		const { compressImageData, workers } = harness(25);
		const stale = compressImageData(fakeImageData(), 'webp');
		await assert.rejects(stale, /timed out/);

		const live = compressImageData(fakeImageData(), 'webp');
		// late traffic from the recycled worker's request lands on the new one
		workers[1]!.onmessage?.({
			data: {
				id: workers[0]!.sent[0]!.id,
				ok: true,
				bytes: new Uint8Array([1]),
				mime: 'image/webp',
			},
		});
		workers[1]!.onmessage?.({
			data: {
				id: workers[1]!.sent[0]!.id,
				ok: true,
				bytes: new Uint8Array([2]),
				mime: 'image/webp',
			},
		});
		const blob = await live;
		assert.strictEqual(
			blob.size,
			1,
			'only the live request resolved',
		);
	});
});
