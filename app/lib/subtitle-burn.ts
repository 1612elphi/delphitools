import type { BurnCodec } from 'delphitools-v2/lib/media-convert';
import type { Cue } from 'delphitools-v2/lib/subtitles';

export type FontChoice = 'sans' | 'serif' | 'mono' | 'quattro';
export type TextStyle = 'outline' | 'box' | 'plain';

export interface BurnStyle {
	font: FontChoice;
	size: number;
	colour: string;
	text: TextStyle;
	x: number;
	y: number;
}

export const DEFAULT_STYLE: BurnStyle = {
	font: 'sans',
	size: 0.05,
	colour: '#ffffff',
	text: 'outline',
	x: 0,
	y: 0,
};

// quattro loads from app.scss
export const FONT_STACKS: Record<FontChoice, string> = {
	sans: '"Helvetica Neue", Helvetica, Arial, sans-serif',
	serif: 'Georgia, "Times New Roman", serif',
	mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
	quattro: '"iA Writer Quattro", sans-serif',
};

const MAX_WIDTH = 0.9;
const LINE_HEIGHT = 1.25;
const BOTTOM_MARGIN = 0.06;
const BOX_FILL = 'rgb(0 0 0 / 65%)';

export function stripTags(text: string): string {
	return text.replace(/<[^>]+>/g, '');
}

export function activeCue(cues: Cue[], ms: number): Cue | undefined {
	return cues.find((cue) => ms >= cue.start && ms < cue.end);
}

interface Measurer {
	measureText(text: string): { width: number };
}

export function wrapLines(
	ctx: Measurer,
	text: string,
	maxWidth: number,
): string[] {
	const out: string[] = [];
	for (const raw of text.split('\n')) {
		let line = '';
		for (const word of raw.split(/\s+/).filter(Boolean)) {
			const next = line ? `${line} ${word}` : word;
			if (line && ctx.measureText(next).width > maxWidth) {
				out.push(line);
				line = word;
			} else {
				line = next;
			}
		}
		if (line) out.push(line);
	}
	return out;
}

export function drawSubtitle(
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
	text: string,
	width: number,
	height: number,
	style: BurnStyle,
): void {
	const px = Math.max(8, Math.round(style.size * height));
	ctx.font = `${px}px ${FONT_STACKS[style.font]}`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'alphabetic';
	ctx.lineJoin = 'round';

	const lines = wrapLines(ctx, stripTags(text), width * MAX_WIDTH);
	const lineH = px * LINE_HEIGHT;
	const cx = width / 2 + style.x * width;
	const bottom = height * (1 - BOTTOM_MARGIN) + style.y * height;

	lines.forEach((line, i) => {
		const y = bottom - (lines.length - 1 - i) * lineH;
		if (style.text === 'box') {
			const w = ctx.measureText(line).width;
			const padX = px * 0.3;
			const padY = px * 0.15;
			ctx.fillStyle = BOX_FILL;
			ctx.fillRect(
				cx - w / 2 - padX,
				y - px * 0.85 - padY,
				w + padX * 2,
				px * 1.1 + padY * 2,
			);
		} else if (style.text === 'outline') {
			ctx.lineWidth = Math.max(2, px / 8);
			ctx.strokeStyle = '#000';
			ctx.strokeText(line, cx, y);
		}
		ctx.fillStyle = style.colour;
		ctx.fillText(line, cx, y);
	});
}

export interface ExportFormat {
	id: string;
	label: string;
	mime: string;
	codec: BurnCodec;
	ext: 'mp4' | 'webm';
}

// first supported format wins
export const EXPORT_FORMATS: ExportFormat[] = [
	{
		id: 'h264',
		label: 'MP4 · H.264',
		mime: 'video/mp4;codecs=avc1,mp4a.40.2',
		codec: 'avc',
		ext: 'mp4',
	},
	{
		id: 'hevc',
		label: 'MP4 · HEVC',
		mime: 'video/mp4;codecs=hvc1.1.6.L93.B0,mp4a.40.2',
		codec: 'hevc',
		ext: 'mp4',
	},
	{
		id: 'av1-mp4',
		label: 'MP4 · AV1',
		mime: 'video/mp4;codecs=av01.0.08M.08,mp4a.40.2',
		codec: 'av1',
		ext: 'mp4',
	},
	{
		id: 'vp9',
		label: 'WebM · VP9',
		mime: 'video/webm;codecs=vp9,opus',
		codec: 'vp9',
		ext: 'webm',
	},
	{
		id: 'vp8',
		label: 'WebM · VP8',
		mime: 'video/webm;codecs=vp8,opus',
		codec: 'vp8',
		ext: 'webm',
	},
	{
		id: 'av1',
		label: 'WebM · AV1',
		mime: 'video/webm;codecs=av1,opus',
		codec: 'av1',
		ext: 'webm',
	},
];

export function supportedFormats(
	encoders?: Set<BurnCodec> | null,
): (ExportFormat & { supported: boolean })[] {
	const can = encoders
		? (format: ExportFormat) => encoders.has(format.codec)
		: typeof MediaRecorder !== 'undefined'
			? (format: ExportFormat) =>
					MediaRecorder.isTypeSupported(
						format.mime,
					)
			: () => false;
	return EXPORT_FORMATS.map((format) => ({
		...format,
		supported: can(format),
	}));
}

// bitrate target: 0.12 bpppf
const BITS_PER_PIXEL_FRAME = 0.12;

export function bitrateFor(width: number, height: number, fps = 30): number {
	const bps = Math.round(width * height * fps * BITS_PER_PIXEL_FRAME);
	return Math.min(40e6, Math.max(1e6, bps));
}
