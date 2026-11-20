import Component from '@glimmer/component';
import { modifier } from 'ember-modifier';
import CanonFigure from 'delphicanon/components/canon-figure';
import {
	cover,
	figure,
	idleText,
	tuning,
} from 'delphitools-v2/components/tools/base64-image-encoder/mosaic';

export interface MosaicImage {
	id: string;
	name: string;
	raw: string;
	uriBytes: number;
	thumbnail?: HTMLCanvasElement;
}

interface MosaicSignature {
	Args: { image?: MosaicImage };
}

const fadeMs = 300;
const still = () =>
	window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function sample(thumbnail: HTMLCanvasElement, columns: number, rows: number) {
	const canvas = document.createElement('canvas');
	canvas.width = columns;
	canvas.height = rows;
	const context = canvas.getContext('2d', { willReadFrequently: true });
	if (!context) return undefined;
	context.imageSmoothingQuality = 'medium';
	context.drawImage(thumbnail, 0, 0, columns, rows);
	return context.getImageData(0, 0, columns, rows).data;
}

export default class Base64Mosaic extends Component<MosaicSignature> {
	#canvas?: HTMLCanvasElement;
	#ghost?: HTMLCanvasElement;
	#shown?: string;

	get figure() {
		return figure(this.args.image?.uriBytes ?? 0);
	}

	mount = modifier((host: HTMLElement) => {
		this.#canvas = host.querySelector('canvas.b64-mosaic-text')!;
		this.#ghost = host.querySelector('canvas.b64-mosaic-ghost')!;
		const repaint = () => this.draw();
		const resize = new ResizeObserver(repaint);
		resize.observe(host);
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
			resize.disconnect();
			theme.disconnect();
			scheme.removeEventListener('change', repaint);
		};
	});

	show = modifier(
		(_host: HTMLElement, [image]: [MosaicImage | undefined]) => {
			if (image?.id === this.#shown) return;
			const first = this.#shown === undefined && !image;
			this.#shown = image?.id;
			if (!first && !still()) this.#fade();
			this.draw();
		},
	);

	#fade() {
		const canvas = this.#canvas;
		const ghost = this.#ghost;
		if (!canvas?.width || !ghost) return;
		ghost.width = canvas.width;
		ghost.height = canvas.height;
		ghost.getContext('2d')?.drawImage(canvas, 0, 0);
		ghost.animate([{ opacity: 1 }, { opacity: 0 }], {
			duration: fadeMs,
			easing: 'ease-in-out',
			fill: 'forwards',
		});
	}

	draw() {
		const canvas = this.#canvas;
		const host = canvas?.parentElement;
		const context = canvas?.getContext('2d');
		if (!canvas || !host || !context) return;
		const scale = window.devicePixelRatio || 1;
		const width = host.clientWidth;
		const height = host.clientHeight;
		canvas.width = Math.round(width * scale);
		canvas.height = Math.round(height * scale);
		context.setTransform(scale, 0, 0, scale, 0, 0);
		const style = getComputedStyle(canvas);
		const mono = style.getPropertyValue('--canon-mono-font').trim();
		context.font = `600 ${tuning.point}px ${mono || 'monospace'}`;
		context.textBaseline = 'top';
		const cell = {
			width: context.measureText('M').width,
			height: Math.ceil(tuning.point * 1.2),
		};
		const area = {
			x: 8,
			y: 6,
			width: width - 16,
			height: height - 12,
		};
		const columns = Math.max(
			1,
			Math.floor(area.width / cell.width),
		);
		const rows = Math.max(1, Math.floor(area.height / cell.height));
		const image = this.args.image;
		const text = image
			? image.raw.slice(0, columns * rows)
			: idleText;
		const faint = style
			.getPropertyValue('--canon-muted-foreground')
			.trim();
		const left =
			area.x + area.width / 2 - (columns * cell.width) / 2;

		const thumbnail = image?.thumbnail;
		const covered = thumbnail
			? cover(columns, rows, cell, thumbnail)
			: undefined;
		const pixels =
			thumbnail && covered?.columns
				? sample(
						thumbnail,
						covered.columns,
						covered.rows,
					)
				: undefined;

		context.clearRect(0, 0, width, height);
		for (let row = 0; row < rows; row++) {
			for (let column = 0; column < columns; column++) {
				const index = row * columns + column;
				const character = text
					? text[index % text.length]!
					: ' ';
				let colour: string | undefined;
				if (
					covered &&
					pixels &&
					column >= covered.x &&
					column < covered.x + covered.columns &&
					row >= covered.y &&
					row < covered.y + covered.rows
				) {
					const at =
						((row - covered.y) *
							covered.columns +
							(column - covered.x)) *
						4;
					const alpha = pixels[at + 3]! / 255;
					if (alpha > 0)
						colour = `rgb(${pixels[at]} ${pixels[at + 1]} ${pixels[at + 2]} / ${Math.max(tuning.faint, alpha)})`;
				}
				context.globalAlpha = colour ? 1 : tuning.faint;
				context.fillStyle = colour ?? faint;
				context.fillText(
					character,
					left + column * cell.width,
					area.y + row * cell.height,
				);
			}
		}
		context.globalAlpha = 1;
	}

	<template>
		<div class="b64-mosaic" {{this.mount}} {{this.show @image}}>
			<canvas
				class="b64-mosaic-text"
				role={{if @image "img"}}
				aria-label={{@image.name}}
				aria-hidden={{if @image "false" "true"}}
			></canvas>
			<canvas
				class="b64-mosaic-ghost"
				aria-hidden="true"
			></canvas>
			<CanonFigure
				class="b64-mosaic-figure
					{{if
						@image
						'b64-mosaic-figure--shown'
					}}"
				@text={{this.figure.value}}
				@unit={{this.figure.unit}}
				@size={{30}}
				@halo="var(--canon-card)"
			/>
		</div>
	</template>
}
