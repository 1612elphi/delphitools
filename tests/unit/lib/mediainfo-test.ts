import { module, test } from 'qunit';
import {
	formatBitrate,
	formatRatio,
	reportText,
	sections,
	trackRows,
	type Track,
} from 'delphitools-v2/lib/mediainfo';
import { formatFps } from 'delphitools-v2/lib/media-probe';

const general: Track = {
	'@type': 'General',
	Format: 'MPEG-4',
	Format_Profile: 'Base Media',
	FileSize: 1048576,
	Duration: 61500,
	OverallBitRate: 1536000,
	OverallBitRate_Mode: 'VBR',
	VideoCount: 1,
	AudioCount: 2,
	Encoded_Application: 'Lavf60.3.100',
};

const video: Track = {
	'@type': 'Video',
	Format: 'AVC',
	Format_Profile: 'High',
	Format_Level: '4.1',
	CodecID: 'avc1',
	Width: 1920,
	Height: 1080,
	DisplayAspectRatio: 1.778,
	FrameRate: 29.97,
	FrameRate_Mode: 'CFR',
	BitDepth: 8,
	ColorSpace: 'YUV',
	ChromaSubsampling: '4:2:0',
	colour_primaries: 'BT.709',
	transfer_characteristics: 'BT.709',
	Default: 'Yes',
};

module('Unit | Lib | mediainfo', function () {
	test('formatters', function (assert) {
		assert.strictEqual(formatBitrate(1536000), '1.54 Mb/s');
		assert.strictEqual(formatBitrate(128000), '128 kb/s');
		assert.strictEqual(formatFps(29.97), '29.97 fps');
		assert.strictEqual(formatFps(25), '25 fps');
		assert.strictEqual(formatFps(23.976), '23.976 fps');
		assert.strictEqual(formatRatio(1.778), '16:9');
		assert.strictEqual(formatRatio(0.5625), '9:16');
		assert.strictEqual(formatRatio(2.2), '2.20:1');
	});

	test('trackRows renders only the fields present', function (assert) {
		const rows = Object.fromEntries(
			trackRows(general).map((r) => [r.label, r.value]),
		);
		assert.deepEqual(rows, {
			Container: 'MPEG-4 Base Media',
			Size: '1.0 MB',
			Duration: '00:01:01.500',
			'Overall bitrate': '1.54 Mb/s VBR',
			Streams: '1 video · 2 audio',
			'Encoded with': 'Lavf60.3.100',
		});

		const v = Object.fromEntries(
			trackRows(video).map((r) => [r.label, r.value]),
		);
		assert.strictEqual(v['Codec'], 'AVC High@L4.1');
		assert.strictEqual(v['Frame size'], '1920 × 1080 (16:9)');
		assert.strictEqual(v['Frame rate'], '29.97 fps CFR');
		assert.strictEqual(v['Pixels'], 'YUV 4:2:0');
		assert.strictEqual(v['Colour'], 'BT.709 · BT.709');
		assert.strictEqual(v['Flags'], 'default');
		assert.notOk('Rotation' in v);
	});

	test('sections number streams per kind and skip unknown types', function (assert) {
		const audio: Track = {
			'@type': 'Audio',
			Format: 'AAC',
			Channels: 2,
		};
		const menu: Track = { '@type': 'Menu' };
		const titles = sections([
			general,
			video,
			audio,
			audio,
			menu,
		]).map((s) => s.title);
		assert.deepEqual(titles, [
			'General',
			'Video #1',
			'Audio #1',
			'Audio #2',
		]);
	});

	test('reportText is the sections as indented plain text', function (assert) {
		const text = reportText([video]);
		assert.ok(
			text.startsWith('Video #1\n  Codec: AVC High@L4.1\n'),
		);
	});
});
