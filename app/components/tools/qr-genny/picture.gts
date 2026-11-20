import Component from '@glimmer/component';
import { modifier } from 'ember-modifier';
import CanonFigure from 'delphicanon/components/canon-figure';
import { IconSvg } from 'delphitools-v2/components/icon';
import {
	SheetMotion,
	columnsOf,
	cropMark,
	easeInOut,
	fadeSeconds,
	gridAt,
	gridOf,
	modulesEqual,
	pathAt,
	place,
	rowsOf,
	shareAt,
	sizeOf,
	sweepLimit,
	type CodeSheet,
	type Rect,
} from './code-sheet';
import './code-sheet.css';

interface CodeSheetPictureSignature {
	Args: {
		sheet?: CodeSheet;
		caption: string;
		pixels?: { width: number; height: number };
		label: string;
		emptyIcon: string;
		emptyText?: string;
	};
	Element: HTMLDivElement;
}

export interface CodeSheetStats {
	frames: number;
	drawMs: number[];
	sweeps: number;
	fades: number;
}

const now = () => performance.now() / 1000;
const still = () =>
	window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Colours {
	border: string;
	marks: string;
	warn: string;
	hairline: number;
}

export default class CodeSheetPicture extends Component<CodeSheetPictureSignature> {
	motion = new SheetMotion();
	stats: CodeSheetStats = { frames: 0, drawMs: [], sweeps: 0, fades: 0 };
	#shown?: CodeSheet;
	#canvas?: HTMLCanvasElement;
	#area?: HTMLElement;
	#scale = 1;
	#drawn = false;
	#frame = 0;
	#fade?: { image: HTMLCanvasElement; began: number };
	#place = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

	get areaRect(): Rect | undefined {
		const area = this.#area;
		if (!area) return undefined;
		return {
			x: area.offsetLeft,
			y: area.offsetTop,
			width: area.clientWidth,
			height: area.clientHeight,
		};
	}

	placer = (sheet: CodeSheet) => {
		const area = this.areaRect;
		return area && place(sheet, area, this.#scale);
	};

	mount = modifier((host: HTMLElement) => {
		this.#canvas = host.querySelector('canvas')!;
		this.#area =
			host.querySelector<HTMLElement>('.code-sheet-area')!;
		if (import.meta.env.DEV)
			(
				host as HTMLElement & {
					codeSheetStats?: CodeSheetStats;
				}
			).codeSheetStats = this.stats;
		const resize = new ResizeObserver(() => {
			const canvas = this.#canvas!;
			this.#scale = window.devicePixelRatio || 1;
			canvas.width = Math.round(
				host.clientWidth * this.#scale,
			);
			canvas.height = Math.round(
				host.clientHeight * this.#scale,
			);
			this.#fade = undefined;
			this.draw();
		});
		resize.observe(host);
		const repaint = () => this.draw();
		const theme = new MutationObserver(repaint);
		theme.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['class', 'data-theme'],
		});
		const scheme = window.matchMedia(
			'(prefers-color-scheme: dark)',
		);
		scheme.addEventListener('change', repaint);
		return () => {
			cancelAnimationFrame(this.#frame);
			this.#frame = 0;
			resize.disconnect();
			theme.disconnect();
			scheme.removeEventListener('change', repaint);
		};
	});

	show = modifier(
		(host: HTMLElement, [sheet]: [CodeSheet | undefined]) => {
			if (sheet === this.#shown) return;
			const before = this.#shown;
			this.#shown = sheet;
			const animated =
				this.#drawn &&
				!still() &&
				host.isConnected &&
				!!this.areaRect;
			const changed = !modulesEqual(before, sheet);
			const cells =
				before && sheet
					? Math.max(
							rowsOf(before),
							rowsOf(sheet),
						) *
						Math.max(
							columnsOf(before),
							columnsOf(sheet),
						)
					: 0;
			if (!animated) {
				this.motion.reset(sheet);
				this.#fade = undefined;
			} else if (
				before &&
				sheet &&
				changed &&
				cells <= sweepLimit
			) {
				this.stats.sweeps += 1;
				this.motion.sweep(sheet, this.placer, now());
			} else if (before || sheet) {
				this.stats.fades += 1;
				this.#snapshot();
				if (!before || !sheet || changed)
					this.motion.reset(sheet);
				else this.motion.restyle(sheet);
			}
			this.#run();
		},
	);

	#snapshot() {
		const canvas = this.#canvas;
		if (!canvas || !canvas.width || !canvas.height) return;
		const image = document.createElement('canvas');
		image.width = canvas.width;
		image.height = canvas.height;
		image.getContext('2d')?.drawImage(canvas, 0, 0);
		this.#fade = { image, began: now() };
	}

	#run() {
		this.draw();
		if (this.#frame || !this.#moving(now())) return;
		const tick = () => {
			this.draw();
			if (this.#moving(now())) {
				this.#frame = requestAnimationFrame(tick);
				return;
			}
			this.#frame = 0;
			this.#canvas?.removeAttribute('data-moving');
			this.motion.compact();
			this.draw();
		};
		this.#canvas?.setAttribute('data-moving', '');
		this.#frame = requestAnimationFrame(tick);
	}

	#moving(time: number) {
		const fading =
			this.#fade && time - this.#fade.began < fadeSeconds;
		if (!fading) this.#fade = undefined;
		return !!fading || !this.motion.settled(time);
	}

	draw() {
		const canvas = this.#canvas;
		const context = canvas?.getContext('2d');
		if (!canvas || !context || !canvas.width) return;
		const started = performance.now();
		const time = now();
		const scale = this.#scale;
		context.setTransform(scale, 0, 0, scale, 0, 0);
		context.clearRect(0, 0, canvas.width, canvas.height);
		const colours = this.#colours(canvas);
		const sheet = this.motion.sheet;
		const placement = this.motion.placementAt(this.placer, time);
		if (!sheet || !placement) {
			this.#drawEmpty(context, colours);
		} else {
			this.#drawPaper(
				context,
				sheet,
				placement.sheet,
				colours,
			);
			this.#drawCropMarks(context, placement.sheet, colours);
			this.#drawModules(context, sheet, time);
			for (const layer of this.motion.marks) {
				const alpha = this.motion.marksAlpha(
					layer,
					time,
				);
				if (alpha <= 0.001 || !layer.sheet.marks)
					continue;
				context.save();
				context.globalAlpha = alpha;
				layer.sheet.marks(
					context,
					placement.origin,
					placement.pitch,
				);
				context.restore();
			}
			if (this.motion.settled(time))
				this.#drawQuietZone(context, sheet, colours);
		}
		const fade = this.#fade;
		if (fade) {
			const left =
				1 -
				easeInOut(
					Math.min(
						1,
						(time - fade.began) /
							fadeSeconds,
					),
				);
			context.save();
			context.setTransform(1, 0, 0, 1, 0, 0);
			context.globalAlpha = left;
			context.drawImage(fade.image, 0, 0);
			context.restore();
		}
		this.#drawn = true;
		const stats = this.stats;
		stats.frames += 1;
		stats.drawMs.push(performance.now() - started);
		if (stats.drawMs.length > 240) stats.drawMs.shift();
	}

	#colours(canvas: HTMLElement): Colours {
		const style = getComputedStyle(canvas);
		return {
			border: style.getPropertyValue('--canon-border').trim(),
			marks: style
				.getPropertyValue('--canon-muted-foreground')
				.trim(),
			warn: style
				.getPropertyValue('--canon-destructive')
				.trim(),
			hairline:
				parseFloat(
					style.getPropertyValue(
						'--canon-hairline',
					),
				) || 1,
		};
	}

	#drawModules(
		context: CanvasRenderingContext2D,
		sheet: CodeSheet,
		time: number,
	) {
		const path = new Path2D();
		const matrix = this.#place;
		const rises = this.motion.layers.every(
			(layer) => rowsOf(layer.swept.sheet) === 1,
		);
		for (const layer of this.motion.layers) {
			const placed = this.placer(layer.swept.sheet);
			if (!placed) continue;
			const grid = gridAt(
				layer,
				gridOf(layer.swept.sheet, placed),
				time,
			);
			const cells = layer.rows * layer.columns;
			for (let i = 0; i < cells; i++) {
				const share = shareAt(layer, i, time);
				if (share <= 0.001) continue;
				const row =
					layer.top +
					Math.floor(i / layer.columns);
				const column = layer.left + (i % layer.columns);
				let x = grid.x + column * grid.width;
				let y = grid.y + row * grid.height;
				let width = grid.width;
				let height = grid.height;
				if (share < 1) {
					if (rises) {
						y += height * (1 - share);
						height *= share;
					} else {
						x += (width * (1 - share)) / 2;
						y += (height * (1 - share)) / 2;
						width *= share;
						height *= share;
					}
				}
				const unit = pathAt(layer, i);
				if (!unit) {
					path.rect(x, y, width, height);
					continue;
				}
				matrix.a = width;
				matrix.d = height;
				matrix.e = x;
				matrix.f = y;
				path.addPath(unit, matrix);
			}
		}
		context.fillStyle = sheet.ink;
		context.fill(path);
	}

	#drawPaper(
		context: CanvasRenderingContext2D,
		sheet: CodeSheet,
		frame: Rect,
		colours: Colours,
	) {
		const line = colours.hairline;
		context.fillStyle = colours.border;
		context.fillRect(
			frame.x - line,
			frame.y - line,
			frame.width + 2 * line,
			frame.height + 2 * line,
		);
		if (sheet.paper) {
			context.fillStyle = sheet.paper;
			context.fillRect(
				frame.x,
				frame.y,
				frame.width,
				frame.height,
			);
			return;
		}
		context.save();
		context.beginPath();
		context.rect(frame.x, frame.y, frame.width, frame.height);
		context.clip();
		context.fillStyle = 'white';
		context.fillRect(frame.x, frame.y, frame.width, frame.height);
		context.fillStyle = 'rgb(230 230 230)';
		const check = 8;
		for (
			let y = frame.y, odd = false;
			y < frame.y + frame.height;
			y += check, odd = !odd
		) {
			for (
				let x = frame.x + (odd ? check : 0);
				x < frame.x + frame.width;
				x += check * 2
			)
				context.fillRect(x, y, check, check);
		}
		context.restore();
	}

	#drawCropMarks(
		context: CanvasRenderingContext2D,
		frame: Rect,
		colours: Colours,
	) {
		const { gap, length } = cropMark;
		const left = frame.x;
		const right = frame.x + frame.width;
		const top = frame.y;
		const bottom = frame.y + frame.height;
		context.beginPath();
		for (const [x, y, dx, dy] of [
			[left, top, -1, -1],
			[right, top, 1, -1],
			[left, bottom, -1, 1],
			[right, bottom, 1, 1],
		] as const) {
			context.moveTo(x, y + dy * gap);
			context.lineTo(x, y + dy * (gap + length));
			context.moveTo(x + dx * gap, y);
			context.lineTo(x + dx * (gap + length), y);
		}
		context.strokeStyle = colours.marks;
		context.lineWidth = colours.hairline;
		context.stroke();
	}

	#drawQuietZone(
		context: CanvasRenderingContext2D,
		sheet: CodeSheet,
		colours: Colours,
	) {
		const zone = sheet.quietZone ?? 0;
		const { margin } = sheet;
		if (
			Math.min(
				margin.left,
				margin.right,
				margin.top,
				margin.bottom,
			) >=
			zone - 0.01
		)
			return;
		const placed = this.placer(sheet);
		if (!placed) return;
		const { origin, pitch } = placed;
		const size = sizeOf(sheet);
		const width = size.width - margin.left - margin.right;
		const height =
			size.height -
			margin.top -
			margin.bottom -
			(sheet.footer ?? 0);
		context.save();
		context.setLineDash([4, 3]);
		context.strokeStyle = colours.warn;
		context.lineWidth = colours.hairline;
		context.strokeRect(
			origin.x - zone * pitch,
			origin.y - zone * pitch,
			(width + 2 * zone) * pitch,
			(height + 2 * zone) * pitch,
		);
		context.restore();
	}

	#drawEmpty(context: CanvasRenderingContext2D, colours: Colours) {
		const area = this.areaRect;
		if (!area) return;
		const side = Math.min(area.width, area.height) * 0.62;
		if (side <= 0) return;
		const frame = {
			x: area.x + area.width / 2 - side / 2,
			y: area.y + area.height / 2 - side / 2,
			width: side,
			height: side,
		};
		context.save();
		context.globalAlpha = 0.5;
		context.setLineDash([5, 4]);
		context.strokeStyle = colours.marks;
		context.lineWidth = colours.hairline;
		context.strokeRect(frame.x, frame.y, frame.width, frame.height);
		context.restore();
		this.#drawCropMarks(context, frame, colours);
	}

	get figure() {
		const { pixels } = this.args;
		return pixels ? `${pixels.width} × ${pixels.height}` : '';
	}

	<template>
		<div
			class="code-sheet"
			...attributes
			{{this.mount}}
			{{this.show @sheet}}
		>
			<canvas
				class="code-sheet-canvas"
				width="0"
				height="0"
				role="img"
				aria-label={{@label}}
			></canvas>
			<div class="code-sheet-area">
				{{#unless @sheet}}
					<div class="code-sheet-empty">
						<span
							class="code-sheet-empty-icon"
						>
							<IconSvg
								@name={{@emptyIcon}}
							/>
						</span>
						{{#if @emptyText}}
							<span
								class="code-sheet-empty-text"
							>{{@emptyText}}</span>
						{{/if}}
					</div>
				{{/unless}}
			</div>
			<div class="code-sheet-caption" aria-hidden="true">
				<span
					class="code-sheet-name"
				>{{@caption}}</span>
				{{#if @pixels}}
					<CanonFigure
						class="code-sheet-figure"
						@text={{this.figure}}
						@unit="px"
						@size={{17}}
						@colour="var(--canon-muted-foreground)"
						@halo="var(--canon-card)"
					/>
				{{/if}}
			</div>
		</div>
	</template>
}
