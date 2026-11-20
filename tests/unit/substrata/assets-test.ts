import { module, test } from 'qunit';
import {
	creditLines,
	licenceLabel,
	photoAsset,
	rankPhotos,
	thumbFor,
	type PhotoRow,
} from 'delphitools-v2/lib/substrata/assets';
import {
	createEmptyDoc,
	createRasterLayer,
	identityTransform,
} from 'delphitools-v2/lib/substrata/doc-model';
import { photoWords } from 'delphitools-v2/lib/substrata/photo-words';

const row: PhotoRow = [
	'https://live.staticflickr.com/1591/24300500596_f855c0a858_b.jpg',
	'Mountain',
	'Kiwi Tom',
	'https://flickr.com/p/1',
	'cc0',
];

module('Unit | Substrata | assets', function () {
	test('licence labels', function (assert) {
		assert.strictEqual(licenceLabel('cc0'), 'CC0');
		assert.strictEqual(licenceLabel('pdm'), 'Public domain');
	});

	test('thumbnails use the hosts own small sizes', function (assert) {
		assert.strictEqual(
			thumbFor(row[0]),
			'https://live.staticflickr.com/1591/24300500596_f855c0a858_n.jpg',
		);
		assert.strictEqual(
			thumbFor(
				'https://upload.wikimedia.org/wikipedia/commons/f/f5/Fort_mountain_lake_02.JPG',
			),
			'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Fort_mountain_lake_02.JPG/250px-Fort_mountain_lake_02.JPG',
		);
		const other =
			'https://cdn.stocksnap.io/img-thumbs/960w/WPOWZBGDTU.jpg';
		assert.strictEqual(thumbFor(other), other);
	});

	test('maps an index row to an asset', function (assert) {
		const a = photoAsset(7, row);
		assert.strictEqual(a.id, 'photo-7');
		assert.strictEqual(a.full, row[0]);
		assert.deepEqual(a.source, {
			provider: 'openverse',
			title: 'Mountain',
			creator: 'Kiwi Tom',
			url: 'https://flickr.com/p/1',
			licence: 'CC0',
			licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
		});
		const bare = photoAsset(8, [row[0], '', '', '', 'pdm']);
		assert.strictEqual(bare.source.title, 'Untitled');
		assert.strictEqual(
			bare.source.url,
			row[0],
			'no landing page links the image',
		);
	});

	test('words fold plurals and drop short words', function (assert) {
		assert.deepEqual(photoWords('Mountains & a Lake, 2019'), [
			'mountain',
			'lake',
		]);
	});

	test('ranking puts rows matching every word first', function (assert) {
		const index = {
			shard: 1000,
			count: 4,
			words: { mountain: [0, 1, 3], lake: [1, 2, 3] },
		};
		assert.deepEqual(
			rankPhotos(index, 'mountain lakes'),
			[1, 3, 0, 2],
		);
		assert.deepEqual(rankPhotos(index, 'volcano'), []);
	});

	test('credits list visible sourced layers once', function (assert) {
		const raster = (visible: boolean) => ({
			...createRasterLayer({
				name: 'p',
				blobHash: 'h',
				naturalWidth: 1,
				naturalHeight: 1,
				transform: identityTransform(),
			}),
			visible,
			source: photoAsset(1, row).source,
		});
		const plain = createRasterLayer({
			name: 'mine',
			blobHash: 'h2',
			naturalWidth: 1,
			naturalHeight: 1,
			transform: identityTransform(),
		});
		const doc = {
			...createEmptyDoc(),
			layers: [
				raster(true),
				raster(true),
				raster(false),
				plain,
			],
		};
		assert.deepEqual(creditLines(doc), [
			'"Mountain" by Kiwi Tom, CC0 (https://creativecommons.org/publicdomain/zero/1.0/), https://flickr.com/p/1',
		]);
	});
});
