import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { modifier } from 'ember-modifier';
import { MathMorph } from 'delphicanon/lib/math/draw';
import { canvasMetrics } from 'delphicanon/lib/math/measure';
import { keyed, type Keyed } from 'delphicanon/lib/math/morph';
import type { Node } from 'delphicanon/lib/math/node';
import { Typesetter, type Ink } from 'delphicanon/lib/math/typeset';

export interface PictureLine {
	node?: Node;
	fallback: string;
	size: number;
	ink: Ink;
}

interface PictureSignature {
	Args: {
		lines: PictureLine[];
		faint: boolean;
		promoted: number;
		label: string;
	};
}

export const pictureHeight = 188;
const faintAlpha = 0.3;
const lineGap = 12;
const growth = 1.25;
const padding = 16;

export default class Picture extends Component<PictureSignature> {
	@tracked width = 0;
	@tracked height = 0;

	arrange(): Keyed[] {
		const area = {
			x: padding,
			y: 8,
			width: this.width - padding * 2,
			height: this.height - 8 - padding,
		};
		const { lines, faint } = this.args;
		if (area.width <= 0 || area.height <= 0 || !lines.length)
			return [];
		const boxes = lines.map((line) => {
			const setter = new Typesetter(
				canvasMetrics,
				line.size,
				line.ink,
			);
			const box = line.node
				? setter.layout(line.node)
				: setter.text(line.fallback);
			box.ascent = Math.max(box.ascent, line.size * 0.72);
			box.descent = Math.max(box.descent, line.size * 0.24);
			return box;
		});
		const widthFits = boxes.map(
			(box) => area.width / Math.max(1, box.width),
		);
		const gaps = lineGap * (boxes.length - 1);
		let scales = widthFits.map((fit) => Math.min(1, fit));
		const total = boxes.reduce(
			(sum, box, i) => sum + box.height * scales[i]!,
			0,
		);
		const fit = Math.min(
			growth,
			Math.min(...widthFits.map((w) => Math.max(1, w))),
			(area.height - gaps) / Math.max(1, total),
		);
		scales = scales.map((scale) => scale * fit);
		const blockWidth = Math.max(
			...boxes.map((box, i) => box.width * scales[i]!),
		);
		const left = area.x + area.width / 2 - blockWidth / 2;
		let y = area.y + area.height / 2 - (total * fit + gaps) / 2;
		const alpha = faint ? faintAlpha : 1;
		const placed: Keyed[] = [];
		boxes.forEach((box, index) => {
			const scale = scales[index]!;
			const baseline = y + box.ascent * scale;
			placed.push(
				...keyed(box.atoms, String(index), (atom) => ({
					atom: {
						...atom,
						weight: atom.weight * scale,
					},
					frame: {
						x: left + atom.frame.x * scale,
						y:
							baseline +
							atom.frame.y * scale,
						width: atom.frame.width * scale,
						height:
							atom.frame.height *
							scale,
					},
					alpha,
				})),
			);
			y += box.height * scale + lineGap;
		});
		return placed;
	}

	measure = modifier((element: HTMLElement) => {
		const observer = new ResizeObserver(([entry]) => {
			this.width = entry?.contentRect.width ?? 0;
			this.height = entry?.contentRect.height ?? 0;
		});
		observer.observe(element);
		return () => observer.disconnect();
	});

	#morphs = new WeakMap<SVGGElement, MathMorph>();
	#promoted = 0;
	#size = '';

	draw = modifier(
		(
			group: SVGGElement,
			[, , promoted]: [
				PictureLine[],
				boolean,
				number,
				number,
				number,
			],
		) => {
			let morph = this.#morphs.get(group);
			const first = !morph;
			morph ??= new MathMorph(group);
			this.#morphs.set(group, morph);
			if (promoted !== this.#promoted) {
				this.#promoted = promoted;
				morph.rename((key) =>
					key.startsWith('1|')
						? `0|${key.slice(2)}`
						: key.startsWith('0|')
							? `gone|${key}`
							: key,
				);
			}
			const size = `${this.width}x${this.height}`;
			const resized = size !== this.#size;
			this.#size = size;
			morph.show(this.arrange(), !first && !resized);
		},
	);

	<template>
		<div class="alg-picture" {{this.measure}}>
			<svg
				class="alg-picture-svg"
				role="img"
				aria-label={{@label}}
			>
				<g
					{{this.draw
						@lines
						@faint
						@promoted
						this.width
						this.height
					}}
				></g>
			</svg>
		</div>
	</template>
}
