// keep mediainfo outside vite
import { formatBytes } from 'delphitools-v2/lib/image-compress';
import { formatFps } from 'delphitools-v2/lib/media-probe';
import { rawImport } from 'delphitools-v2/lib/raw-import';
import { formatTimestamp } from 'delphitools-v2/lib/subtitles';

const MODULE_URL = '/mediainfo/mediainfo.min.js';

export type TrackType =
	'General' | 'Video' | 'Audio' | 'Text' | 'Image' | 'Menu' | 'Other';

export type Track = { '@type': TrackType } & Record<
	string,
	string | number | undefined
>;

interface MediaInfoLike {
	analyzeData(
		size: () => number,
		read: (chunk: number, offset: number) => Promise<Uint8Array>,
	): Promise<{ media?: { track: Track[] } }>;
}

type Factory = (options: {
	format: 'object';
	locateFile: (path: string) => string;
}) => Promise<MediaInfoLike>;

let instance: Promise<MediaInfoLike> | null = null;

function getMediaInfo(): Promise<MediaInfoLike> {
	instance ??= (async () => {
		const { default: factory } = await rawImport<{
			default: Factory;
		}>(MODULE_URL);
		return factory({
			format: 'object',
			locateFile: (path) => `/mediainfo/${path}`,
		});
	})();
	return instance;
}

// mediainfo serializes analysis
let queue: Promise<unknown> = Promise.resolve();

export function analyzeMedia(file: File): Promise<Track[]> {
	const run = queue.then(() => analyze(file));
	queue = run.catch(() => {});
	return run;
}

async function analyze(file: File): Promise<Track[]> {
	const mi = await getMediaInfo();
	const result = await mi.analyzeData(
		() => file.size,
		async (chunk, offset) =>
			new Uint8Array(
				await file
					.slice(offset, offset + chunk)
					.arrayBuffer(),
			),
	);
	return result.media?.track ?? [];
}

export interface Row {
	label: string;
	value: string;
}

const str = (track: Track, key: string): string | undefined => {
	const value = track[key];
	if (value === undefined || value === '') return undefined;
	return String(value);
};

const num = (track: Track, key: string): number | undefined => {
	const value = Number(track[key]);
	return Number.isFinite(value) ? value : undefined;
};

const mapNum = (
	track: Track,
	key: string,
	render: (value: number) => string,
): string | undefined => {
	const value = num(track, key);
	return value === undefined ? undefined : render(value);
};

export function formatBitrate(bps: number): string {
	return bps >= 1e6
		? `${(bps / 1e6).toFixed(2)} Mb/s`
		: `${Math.round(bps / 1e3)} kb/s`;
}

const RATIOS: [number, string][] = [
	[16 / 9, '16:9'],
	[4 / 3, '4:3'],
	[9 / 16, '9:16'],
	[1, '1:1'],
	[21 / 9, '21:9'],
	[2.39, '2.39:1'],
	[2.35, '2.35:1'],
	[1.85, '1.85:1'],
	[3 / 2, '3:2'],
	[5 / 4, '5:4'],
];

export function formatRatio(ratio: number): string {
	const hit = RATIOS.find(([value]) => Math.abs(value - ratio) < 0.01);
	return hit ? hit[1] : `${ratio.toFixed(2)}:1`;
}

const ms = (track: Track, key = 'Duration') => {
	const value = num(track, key);
	return value === undefined ? undefined : formatTimestamp(value, '.');
};

const bitrate = (track: Track, key: string, modeKey: string) => {
	const value = num(track, key);
	if (value === undefined) return undefined;
	const mode = str(track, modeKey);
	return mode ? `${formatBitrate(value)} ${mode}` : formatBitrate(value);
};

const codec = (track: Track) => {
	const format = str(track, 'Format');
	if (!format) return undefined;
	const profile = str(track, 'Format_Profile');
	const level = str(track, 'Format_Level');
	const extra = str(track, 'Format_AdditionalFeatures');
	let out = format;
	if (profile) out += ` ${profile}`;
	if (level) out += `@L${level}`;
	if (extra) out += ` ${extra}`;
	return out;
};

const fps = (track: Track) => {
	const rate = num(track, 'FrameRate');
	if (rate === undefined) return undefined;
	const mode = str(track, 'FrameRate_Mode');
	const min = num(track, 'FrameRate_Minimum');
	const max = num(track, 'FrameRate_Maximum');
	let out = formatFps(rate);
	if (mode) out += ` ${mode}`;
	if (mode === 'VFR' && min !== undefined && max !== undefined)
		out += ` (${min.toFixed(3)}–${max.toFixed(3)})`;
	return out;
};

const colour = (track: Track) => {
	const parts = [
		str(track, 'colour_primaries'),
		str(track, 'transfer_characteristics'),
		str(track, 'matrix_coefficients'),
	].filter(Boolean);
	return parts.length ? parts.join(' · ') : undefined;
};

const flags = (track: Track) => {
	const parts = [];
	if (str(track, 'Default') === 'Yes') parts.push('default');
	if (str(track, 'Forced') === 'Yes') parts.push('forced');
	return parts.length ? parts.join(', ') : undefined;
};

type Spec = [label: string, render: (track: Track) => string | undefined];

const GENERAL: Spec[] = [
	['Container', codec],
	['Size', (t) => mapNum(t, 'FileSize', formatBytes)],
	['Duration', ms],
	[
		'Overall bitrate',
		(t) => bitrate(t, 'OverallBitRate', 'OverallBitRate_Mode'),
	],
	['Frame rate', fps],
	[
		'Streams',
		(t) => {
			const counts = [
				[num(t, 'VideoCount'), 'video'],
				[num(t, 'AudioCount'), 'audio'],
				[num(t, 'TextCount'), 'text'],
			].filter(([n]) => n) as [number, string][];
			return counts.length
				? counts
						.map(
							([n, kind]) =>
								`${n} ${kind}`,
						)
						.join(' · ')
				: undefined;
		},
	],
	['Title', (t) => str(t, 'Title') ?? str(t, 'Movie')],
	[
		'Encoded with',
		(t) =>
			str(t, 'Encoded_Application') ??
			str(t, 'Encoded_Library'),
	],
	['Encoded', (t) => str(t, 'Encoded_Date')],
];

const VIDEO: Spec[] = [
	['Codec', codec],
	['Codec ID', (t) => str(t, 'CodecID')],
	[
		'Frame size',
		(t) => {
			const w = num(t, 'Width');
			const h = num(t, 'Height');
			if (w === undefined || h === undefined)
				return undefined;
			const dar = num(t, 'DisplayAspectRatio');
			return dar
				? `${w} × ${h} (${formatRatio(dar)})`
				: `${w} × ${h}`;
		},
	],
	['Rotation', (t) => mapNum(t, 'Rotation', (v) => (v ? `${v}°` : ''))],
	['Frame rate', fps],
	['Frames', (t) => mapNum(t, 'FrameCount', String)],
	['Bitrate', (t) => bitrate(t, 'BitRate', 'BitRate_Mode')],
	['Bit depth', (t) => mapNum(t, 'BitDepth', (v) => `${v} bit`)],
	[
		'Pixels',
		(t) => {
			const parts = [
				str(t, 'ColorSpace'),
				str(t, 'ChromaSubsampling'),
				str(t, 'ScanType'),
			].filter(Boolean);
			return parts.length ? parts.join(' ') : undefined;
		},
	],
	['Colour', colour],
	['HDR', (t) => str(t, 'HDR_Format')],
	['GOP', (t) => str(t, 'Format_Settings_GOP')],
	['Stream size', (t) => mapNum(t, 'StreamSize', formatBytes)],
	['Duration', ms],
	['Language', (t) => str(t, 'Language')],
	['Flags', flags],
	['Encoded with', (t) => str(t, 'Encoded_Library')],
];

const AUDIO: Spec[] = [
	['Codec', (t) => codec(t) ?? str(t, 'Format_Commercial_IfAny')],
	['Codec ID', (t) => str(t, 'CodecID')],
	[
		'Channels',
		(t) => {
			const n = num(t, 'Channels');
			if (n === undefined) return undefined;
			const layout = str(t, 'ChannelLayout');
			return layout ? `${n} (${layout})` : String(n);
		},
	],
	['Sample rate', (t) => mapNum(t, 'SamplingRate', (v) => `${v} Hz`)],
	['Bitrate', (t) => bitrate(t, 'BitRate', 'BitRate_Mode')],
	['Bit depth', (t) => mapNum(t, 'BitDepth', (v) => `${v} bit`)],
	['Compression', (t) => str(t, 'Compression_Mode')],
	['Stream size', (t) => mapNum(t, 'StreamSize', formatBytes)],
	['Duration', ms],
	['Language', (t) => str(t, 'Language')],
	['Title', (t) => str(t, 'Title')],
	['Flags', flags],
];

const TEXT: Spec[] = [
	['Format', codec],
	['Codec ID', (t) => str(t, 'CodecID')],
	['Cues', (t) => mapNum(t, 'ElementCount', String)],
	['Duration', ms],
	['Language', (t) => str(t, 'Language')],
	['Title', (t) => str(t, 'Title')],
	['Flags', flags],
];

const SPECS: Partial<Record<TrackType, Spec[]>> = {
	General: GENERAL,
	Video: VIDEO,
	Audio: AUDIO,
	Text: TEXT,
};

export function trackRows(track: Track): Row[] {
	const specs = SPECS[track['@type']] ?? [];
	const rows: Row[] = [];
	for (const [label, render] of specs) {
		const value = render(track);
		if (value !== undefined) rows.push({ label, value });
	}
	return rows;
}

export interface Section {
	type: TrackType;
	title: string;
	rows: Row[];
}

export function sections(tracks: Track[]): Section[] {
	const counts: Partial<Record<TrackType, number>> = {};
	const out: Section[] = [];
	for (const track of tracks) {
		const type = track['@type'];
		const rows = trackRows(track);
		if (rows.length === 0) continue;
		counts[type] = (counts[type] ?? 0) + 1;
		const title =
			type === 'General'
				? 'General'
				: `${type} #${counts[type]}`;
		out.push({ type, title, rows });
	}
	return out;
}

export function reportText(tracks: Track[]): string {
	return sections(tracks)
		.map(
			(section) =>
				`${section.title}\n${section.rows
					.map(
						(row) =>
							`  ${row.label}: ${row.value}`,
					)
					.join('\n')}`,
		)
		.join('\n\n');
}
