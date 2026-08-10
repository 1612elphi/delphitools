// SubRip (.srt) and WebVTT (.vtt) cues, one model for both. WebVTT is
// W3C "WebVTT: The Web Video Text Tracks Format"; SubRip has no spec, the
// de-facto shape is index / timing / text blocks separated by blank lines.
//
// ponytail: cue text passes through verbatim — no translation between VTT
// voice/class tags and SRT font tags, no STYLE/REGION support. A tag-mapping
// table in writeSrt/writeVtt is where that would go.

export interface Cue {
	/** milliseconds */
	start: number;
	/** milliseconds */
	end: number;
	/** payload lines joined with \n */
	text: string;
}

export type SubtitleFormat = 'srt' | 'vtt';

// Lenient superset of both formats: hours optional (VTT), comma or dot
// before the milliseconds (SRT uses the comma).
const TIMESTAMP = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})$/;

export function parseTimestamp(value: string): number | null {
	const m = TIMESTAMP.exec(value.trim());
	if (!m) return null;
	const [, h, min, s, ms] = m;
	return (
		Number(h ?? 0) * 3_600_000 +
		Number(min) * 60_000 +
		Number(s) * 1000 +
		Number(ms!.padEnd(3, '0'))
	);
}

function pad(n: number, width: number): string {
	return String(n).padStart(width, '0');
}

export function formatTimestamp(ms: number, separator: ',' | '.'): string {
	const t = Math.max(0, Math.round(ms));
	const h = Math.floor(t / 3_600_000);
	const min = Math.floor(t / 60_000) % 60;
	const s = Math.floor(t / 1000) % 60;
	return `${pad(h, 2)}:${pad(min, 2)}:${pad(s, 2)}${separator}${pad(t % 1000, 3)}`;
}

/**
 * Labels the input so the converter can pick a default target; parseSubtitles
 * itself reads both formats without being told which one it has.
 */
export function detectFormat(text: string): SubtitleFormat | null {
	const t = text.trimStart();
	if (t.startsWith('WEBVTT')) return 'vtt';
	return t.includes('-->') ? 'srt' : null;
}

/**
 * Cues from either format, in file order. Blocks with no timing line (the
 * WEBVTT header, NOTE and STYLE blocks) are skipped; lines before the timing
 * line (SRT index, VTT cue identifier) are dropped; VTT cue settings after
 * the end timestamp are dropped.
 */
export function parseSubtitles(text: string): Cue[] {
	const blocks = text.replace(/\r\n?/g, '\n').split(/\n{2,}/);
	const cues: Cue[] = [];

	for (const block of blocks) {
		const lines = block.split('\n');
		const timingIndex = lines.findIndex((line) =>
			line.includes('-->'),
		);
		if (timingIndex < 0) continue;

		const [startRaw, rest] = lines[timingIndex]!.split('-->');
		const endRaw = rest?.trim().split(/\s+/)[0];
		const start = parseTimestamp(startRaw ?? '');
		const end = parseTimestamp(endRaw ?? '');
		if (start === null || end === null) continue;

		const body = lines
			.slice(timingIndex + 1)
			.join('\n')
			.trim();
		cues.push({ start, end, text: body });
	}

	return cues;
}

export function writeSrt(cues: Cue[]): string {
	return (
		cues
			.map(
				(cue, i) =>
					`${i + 1}\n${formatTimestamp(cue.start, ',')} --> ${formatTimestamp(cue.end, ',')}\n${cue.text}`,
			)
			.join('\n\n') + '\n'
	);
}

export function writeVtt(cues: Cue[]): string {
	return (
		'WEBVTT\n\n' +
		cues
			.map(
				(cue) =>
					`${formatTimestamp(cue.start, '.')} --> ${formatTimestamp(cue.end, '.')}\n${cue.text}`,
			)
			.join('\n\n') +
		'\n'
	);
}

/** Shifted by `deltaMs`, clamped so no cue starts before zero or ends before it starts. */
export function shiftCues(cues: Cue[], deltaMs: number): Cue[] {
	return cues.map((cue) => {
		const start = Math.max(0, cue.start + deltaMs);
		return {
			...cue,
			start,
			end: Math.max(start, cue.end + deltaMs),
		};
	});
}

/** Timestamps multiplied by `factor` — 25/23.976 stretches film-rate subs to PAL. */
export function scaleCues(cues: Cue[], factor: number): Cue[] {
	return cues.map((cue) => ({
		...cue,
		start: Math.round(cue.start * factor),
		end: Math.round(cue.end * factor),
	}));
}
