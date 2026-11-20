import Component from '@glimmer/component';
import { modifier } from 'ember-modifier';
import { IconSvg } from 'delphitools-v2/components/icon';
import { getRaster } from 'delphitools-v2/lib/substrata/raster-cache';
import {
	polygonPoints,
	shapeDims,
	starPoints,
} from 'delphitools-v2/lib/substrata/shape-geometry';
import {
	presetShape,
	SYMBOL_GRID,
} from 'delphitools-v2/lib/substrata/preset-shapes';
import {
	freehandDims,
	outlineToPathD,
	strokeOutline,
} from 'delphitools-v2/lib/substrata/freehand';
import { resolveFontCss } from 'delphitools-v2/lib/substrata/fonts';
import type {
	Layer,
	ShapeParams,
} from 'delphitools-v2/lib/substrata/doc-model';

const SIDE = 32;

function shapePath(params: ShapeParams): Path2D {
	const path = new Path2D();
	switch (params.shape) {
		case 'symbol': {
			const m = new DOMMatrix()
				.translate(
					-params.width / 2,
					-params.height / 2,
				)
				.scale(
					params.width / SYMBOL_GRID,
					params.height / SYMBOL_GRID,
				);
			path.addPath(
				new Path2D(
					presetShape(params.symbolId)?.d ?? '',
				),
				m,
			);
			break;
		}
		case 'rectangle':
			path.roundRect(
				-params.width / 2,
				-params.height / 2,
				params.width,
				params.height,
				params.cornerRadius,
			);
			break;
		case 'ellipse':
			path.ellipse(
				0,
				0,
				params.rx,
				params.ry,
				0,
				0,
				2 * Math.PI,
			);
			break;
		case 'line':
			path.moveTo(-params.length / 2, 0);
			path.lineTo(params.length / 2, 0);
			break;
		case 'polygon':
		case 'star': {
			const pts =
				params.shape === 'polygon'
					? polygonPoints(
							params.sides,
							params.radius,
						)
					: starPoints(
							params.points,
							params.outerRadius,
							params.innerRadius,
						);
			pts.forEach((p, i) =>
				i === 0
					? path.moveTo(p.x, p.y)
					: path.lineTo(p.x, p.y),
			);
			path.closePath();
			break;
		}
	}
	return path;
}

function paint(ctx: CanvasRenderingContext2D, layer: Layer): void {
	if (layer.kind === 'text') {
		if (layer.plate) {
			ctx.fillStyle = layer.plate.colour;
			ctx.beginPath();
			ctx.roundRect(
				1,
				7,
				SIDE - 2,
				SIDE - 14,
				layer.plate.shape === 'pill' ? 9 : 2,
			);
			ctx.fill();
		}
		ctx.fillStyle =
			layer.fill !== 'transparent'
				? layer.fill
				: (layer.stroke?.colour ?? '#888888');
		ctx.font = `bold 13px ${resolveFontCss(layer.fontFamily)}`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(layer.text.slice(0, 2), SIDE / 2, SIDE / 2 + 1);
		return;
	}
	if (layer.kind === 'freehand') {
		const dims = freehandDims(layer.rawPoints, layer.strokeOptions);
		const d = outlineToPathD(
			strokeOutline(layer.rawPoints, layer.strokeOptions),
		);
		if (!d) return;
		const s = (SIDE - 6) / Math.max(dims.width, dims.height, 1);
		ctx.translate(SIDE / 2, SIDE / 2);
		ctx.scale(s, s);
		ctx.fillStyle = layer.fill;
		ctx.fill(new Path2D(d));
		return;
	}
	if (layer.kind === 'shape') {
		const dims = shapeDims(layer.params);
		const s = (SIDE - 8) / Math.max(dims.width, dims.height, 1);
		const path = shapePath(layer.params);
		ctx.translate(SIDE / 2, SIDE / 2);
		ctx.scale(s, s);
		if (layer.params.shape !== 'line') {
			ctx.fillStyle =
				typeof layer.fill === 'string'
					? layer.fill
					: (layer.fill.stops[0]?.colour ??
						'#888888');
			ctx.fill(path);
		}
		if (layer.stroke) {
			ctx.strokeStyle = layer.stroke.colour;
			ctx.lineWidth = Math.max(layer.stroke.width, 1.5 / s);
			ctx.stroke(path);
		}
		return;
	}
	if (layer.kind !== 'raster') return;
	const src = getRaster(layer.blobHash);
	if (!src) return;
	const s = Math.min(SIDE / src.width, SIDE / src.height);
	const w = src.width * s;
	const h = src.height * s;
	ctx.drawImage(src, (SIDE - w) / 2, (SIDE - h) / 2, w, h);
}

function signature(layer: Layer): string {
	switch (layer.kind) {
		case 'raster':
			return layer.blobHash;
		case 'shape':
			return JSON.stringify([
				layer.params,
				layer.fill,
				layer.stroke,
			]);
		case 'freehand':
			return `${layer.rawPoints.length}|${layer.fill}|${layer.strokeOptions.size}`;
		case 'text':
			return `${layer.text}|${layer.fill}|${layer.plate?.colour}|${layer.stroke?.colour}|${layer.fontFamily}`;
		default:
			return '';
	}
}

export default class LayerThumb extends Component<{
	Args: { layer: Layer };
}> {
	get isGroup() {
		return this.args.layer.kind === 'group';
	}

	get sig() {
		return signature(this.args.layer);
	}

	draw = modifier((canvas: HTMLCanvasElement, [sig]: [string]) => {
		void sig;
		const scale = window.devicePixelRatio || 1;
		canvas.width = SIDE * scale;
		canvas.height = SIDE * scale;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		ctx.setTransform(scale, 0, 0, scale, 0, 0);
		ctx.clearRect(0, 0, SIDE, SIDE);
		paint(ctx, this.args.layer);
	});

	<template>
		{{#if this.isGroup}}
			<span
				class="sub-layer-thumb is-group"
				aria-hidden="true"
			>
				<IconSvg @name="folder" />
			</span>
		{{else}}
			<canvas
				class="sub-layer-thumb"
				aria-hidden="true"
				{{this.draw this.sig}}
			></canvas>
		{{/if}}
	</template>
}
