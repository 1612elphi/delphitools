import Component from '@glimmer/component';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import CanonFigure from 'delphicanon/components/canon-figure';
import CanonLoader from 'delphicanon/components/canon-loader';
import { springEasing } from 'delphicanon/lib/motion';
import { reducedMotion } from 'delphitools-v2/lib/flow-hooks';
import Slot from 'delphitools-v2/components/tools/media/slot';
import type { Geometry } from 'delphitools-v2/components/tools/scroll-genny/scroll';

export interface PictureSignature {
	Args: {
		geometry?: Geometry;
		slides: string[];
		busy: boolean;
		over: boolean;
		onFile: (file: File) => void;
	};
}

const pct = (value: number) => `${Math.round(value * 10000) / 100}%`;

const morph = { duration: 500, easing: springEasing(0.8) };

const layoutOf = (element: Element) =>
	getComputedStyle(element)
		.getPropertyValue('--canon-split-layout')
		.trim();

export default class Picture extends Component<PictureSignature> {
	get strip() {
		const g = this.args.geometry;
		if (!g || !this.args.slides.length) return [];
		const width = g.tileWidth * g.slideCount;
		return [
			{
				count: g.slideCount,
				style: htmlSafe(
					`--scroll-ratio: ${width / g.tileHeight}`,
				),
				label: `${g.slideCount} ${this.unit}`,
				seams: Array.from(
					{ length: g.slideCount - 1 },
					(_, i) =>
						htmlSafe(
							`inset-inline-start: ${pct((i + 1) / g.slideCount)}`,
						),
				),
				edges: g.needsFill
					? [
							g.imageStart,
							g.imageStart +
								g.imageWidth,
						].map((x) =>
							htmlSafe(
								`inset-inline-start: ${pct(x / width)}`,
							),
						)
					: [],
			},
		];
	}

	get slides() {
		return this.args.slides.map((url, index) => ({
			url,
			number: index + 1,
		}));
	}

	morphOnLayout = modifier((strip: HTMLElement) => {
		const body = strip.closest('.canon-split-body');
		if (!body) return;
		let layout = layoutOf(body);
		let last: DOMRect | undefined;
		let running: Animation | undefined;
		const observer = new ResizeObserver(() => {
			const next = layoutOf(body);
			const flipped = next !== layout;
			layout = next;
			const moving = running?.playState === 'running';
			const shown = strip.getBoundingClientRect();
			running?.cancel();
			const from = moving
				? shown
				: flipped
					? last
					: undefined;
			const to = strip.getBoundingClientRect();
			last = to;
			if (!from || !to.width || reducedMotion()) return;
			const dx = from.left - to.left;
			const dy = from.top - to.top;
			running = strip.animate(
				[
					{
						transformOrigin: '0 0',
						transform: `translate(${dx}px, ${dy}px) scale(${from.width / to.width})`,
					},
					{
						transformOrigin: '0 0',
						transform: 'none',
					},
				],
				morph,
			);
		});
		observer.observe(strip);
		return () => {
			observer.disconnect();
			running?.cancel();
		};
	});

	get unit() {
		return this.args.geometry?.slideCount === 1
			? 'slide'
			: 'slides';
	}

	<template>
		<div class="scroll-picture">
			<div class="scroll-area">
				{{#each this.strip key="count" as |strip|}}
					<figure
						class="scroll-strip"
						aria-label={{strip.label}}
						style={{strip.style}}
						{{this.morphOnLayout}}
					>
						{{#each this.slides as |slide|}}
							<span
								class="scroll-slide"
							>
								<img
									src={{slide.url}}
									alt=""
									decoding="async"
								/>
								<span
									class="scroll-chip"
								>{{slide.number}}</span>
							</span>
						{{/each}}
						{{#each strip.seams as |seam|}}
							<span
								class="scroll-seam"
								style={{seam}}
							></span>
						{{/each}}
						{{#each strip.edges as |edge|}}
							<span
								class="scroll-edge"
								style={{edge}}
							></span>
						{{/each}}
					</figure>
				{{else}}
					<Slot
						class="scroll-slot"
						@prompt="Drop an image here"
						@icon="image"
						@accept="image/*"
						@dashed={{true}}
						@fills={{true}}
						@over={{@over}}
						@onFile={{@onFile}}
					/>
				{{/each}}
			</div>
			{{#if @geometry}}
				<CanonFigure
					class="scroll-figure"
					@text="{{@geometry.slideCount}}"
					@unit={{this.unit}}
					@halo="var(--canon-muted)"
				/>
			{{/if}}
			{{#if @busy}}
				<CanonLoader class="scroll-loader" />
			{{/if}}
		</div>
	</template>
}
