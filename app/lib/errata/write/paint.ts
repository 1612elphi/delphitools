import {
	SOFT_HYPHEN,
	type Borders,
	type FloatBox,
	type ImageAsset,
	type ImageRef,
	type Line,
	type PageBox,
	type ParaBox,
	type Span,
	type WriteDoc,
} from './types';
import { cssFamily } from './fonts';
import { bitmapFor } from './image';
import { charLen, isLowSurrogate } from './model';

export interface PaintOptions {
	/** device pixels per pt */
	scale: number;
	invisibles: boolean;
	/** paragraph length, to find a paragraph's last line */
	paraEnd: (block: number) => number;
	ink: string;
	images?: WriteDoc['images'];
}

/** Drawn under the text. */
export const behind = (f: FloatBox) => f.image.float?.wrap === 'behind';

// grey until decoded
function drawImage(
	ctx: CanvasRenderingContext2D,
	asset: ImageAsset | undefined,
	x: number,
	y: number,
	w: number,
	h: number,
	scale: number,
) {
	const bitmap = asset && bitmapFor(asset, w * scale);
	if (bitmap) ctx.drawImage(bitmap, x, y, w, h);
	else {
		ctx.fillStyle = '#e8e8e8';
		ctx.fillRect(x, y, w, h);
	}
}

const assetOf = (opts: PaintOptions, image: ImageRef) =>
	opts.images?.[image.id];

// em of font size
export const DECO = 0.05;
export const UNDER = 0.12;
export const STRIKE = 0.28;

function setFont(ctx: CanvasRenderingContext2D, span: Span) {
	ctx.font = `${span.size}px "${cssFamily(span.file)}"`;
	ctx.fontKerning = 'none';
}

function drawSpan(ctx: CanvasRenderingContext2D, span: Span) {
	if (span.image || span.anchor) return;
	setFont(ctx, span);
	ctx.fillStyle = span.char.colour;
	const text = span.shown ?? span.text;
	const xs = span.shownXs ?? span.xs;
	for (let i = 0; i < text.length; i++) {
		// drawn with its pair
		if (isLowSurrogate(text.charCodeAt(i))) continue;
		const glyph = text.slice(i, i + charLen(text, i));
		if (glyph !== ' ' && glyph !== SOFT_HYPHEN)
			ctx.fillText(glyph, xs[i]!, -span.rise);
	}
}

function decorations(ctx: CanvasRenderingContext2D, span: Span) {
	if (span.image || span.anchor) return;
	const { xs, size, char } = span;
	const x = xs[0]!;
	const w = xs[xs.length - 1]! - x;
	ctx.fillStyle = char.colour;
	if (char.underline)
		ctx.fillRect(x, size * UNDER - span.rise, w, size * DECO);
	if (char.strike)
		ctx.fillRect(x, -size * STRIKE - span.rise, w, size * DECO);
}

function highlight(ctx: CanvasRenderingContext2D, span: Span, line: Line) {
	if (!span.char.highlight) return;
	const x = span.xs[0]!;
	const w = span.xs[span.xs.length - 1]! - x;
	ctx.fillStyle = span.char.highlight;
	ctx.fillRect(x, line.top, w, line.height);
}

function invisibleMarks(
	ctx: CanvasRenderingContext2D,
	line: Line,
	opts: PaintOptions,
) {
	ctx.fillStyle = opts.ink;
	for (const span of line.spans) {
		for (let i = 0; i < span.text.length; i++) {
			if (span.text[i] !== ' ') continue;
			const mid = (span.xs[i]! + span.xs[i + 1]!) / 2;
			const r = Math.max(span.size * 0.06, 0.6);
			ctx.beginPath();
			ctx.arc(mid, -span.size * 0.25, r, 0, Math.PI * 2);
			ctx.fill();
		}
	}
	if (line.end !== opts.paraEnd(line.block)) return;
	const { size, xs } = line.spans.at(-1)!;
	ctx.font = `${size}px "${cssFamily('cmu-serif-400-normal.otf')}", serif`;
	ctx.fillText('¶', xs.at(-1)! + size * 0.1, 0);
}

function breakMark(
	ctx: CanvasRenderingContext2D,
	line: Line,
	opts: PaintOptions,
) {
	const y = line.top + line.height / 2;
	ctx.strokeStyle = opts.ink;
	ctx.lineWidth = 0.5;
	ctx.setLineDash([1.5, 2]);
	ctx.beginPath();
	ctx.moveTo(line.left, y);
	ctx.lineTo(line.left + line.width, y);
	ctx.stroke();
	ctx.setLineDash([]);
}

/** Paints one page in pt units over the current transform, which maps pt to device px at opts.scale; the caller sizes the canvas. */
export function paintPage(
	ctx: CanvasRenderingContext2D,
	page: PageBox,
	opts: PaintOptions,
): void {
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(0, 0, page.width, page.height);
	ctx.textBaseline = 'alphabetic';
	for (const box of page.boxes) paintBox(ctx, box);
	const float = (f: FloatBox) =>
		drawImage(
			ctx,
			assetOf(opts, f.image),
			f.x,
			f.y,
			f.w,
			f.h,
			opts.scale,
		);
	for (const f of page.floats) if (behind(f)) float(f);
	for (const line of page.lines) paintLine(ctx, line, opts);
	const story = { ...opts, invisibles: false };
	for (const line of page.header) paintLine(ctx, line, story);
	for (const line of page.footer) paintLine(ctx, line, story);
	for (const line of page.notes) paintLine(ctx, line, story);
	for (const line of page.toc) paintLine(ctx, line, story);
	for (const cell of page.cells)
		for (const line of cell.lines) paintLine(ctx, line, story);
	for (const f of page.floats) if (!behind(f)) float(f);
}

function paintLine(
	ctx: CanvasRenderingContext2D,
	line: Line,
	opts: PaintOptions,
) {
	if (line.kind) {
		if (line.kind === 'break' && opts.invisibles)
			breakMark(ctx, line, opts);
		return;
	}
	for (const span of line.spans) highlight(ctx, span, line);
	ctx.save();
	ctx.translate(0, line.baseline);
	if (line.marker) drawSpan(ctx, line.marker);
	for (const span of line.spans) {
		if (span.image)
			drawImage(
				ctx,
				assetOf(opts, span.image),
				span.xs[0]!,
				-span.image.h,
				span.image.w,
				span.image.h,
				opts.scale,
			);
		drawSpan(ctx, span);
		decorations(ctx, span);
	}
	if (line.hyphen) drawSpan(ctx, line.hyphen);
	if (opts.invisibles) invisibleMarks(ctx, line, opts);
	ctx.restore();
}

/** Edge rectangles of a border box, as x, y, w, h and colour. */
export function borderRects(
	box: ParaBox,
): [number, number, number, number, string][] {
	const b: Borders = box.border ?? {};
	const out: [number, number, number, number, string][] = [];
	const { x, y, w, h } = box;
	if (b.top) out.push([x, y, w, b.top.width, b.top.colour]);
	if (b.bottom)
		out.push([
			x,
			y + h - b.bottom.width,
			w,
			b.bottom.width,
			b.bottom.colour,
		]);
	if (b.left) out.push([x, y, b.left.width, h, b.left.colour]);
	if (b.right)
		out.push([
			x + w - b.right.width,
			y,
			b.right.width,
			h,
			b.right.colour,
		]);
	return out;
}

function paintBox(ctx: CanvasRenderingContext2D, box: ParaBox) {
	if (box.fill) {
		ctx.fillStyle = box.fill;
		ctx.fillRect(box.x, box.y, box.w, box.h);
	}
	for (const [x, y, w, h, c] of borderRects(box)) {
		ctx.fillStyle = c;
		ctx.fillRect(x, y, w, h);
	}
}
