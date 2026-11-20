import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { modifier } from 'ember-modifier';
import { glyphEased, reducedMotion } from 'delphicanon/lib/motion';
import { railPattern } from 'delphitools-v2/components/tools/decoder/scene';

interface FenceSignature {
	Args: { text: string; rails: number; label: string };
}

const padding = 16;
const pitchRange = { least: 11, most: 26 };
const settleMs = 500;

function heights(count: number, rails: number) {
	const effective = Math.max(2, Math.min(rails, Math.max(count, 2)));
	return railPattern(count, rails).map((rail) => rail / (effective - 1));
}

export default class Fence extends Component<FenceSignature> {
	@tracked width = 0;
	@tracked height = 0;
	@tracked progress = 1;
	#from: number[] = [];
	#shown = { text: '', rails: 3 };
	#began = 0;
	#frame = 0;

	willDestroy() {
		super.willDestroy();
		cancelAnimationFrame(this.#frame);
	}

	measure = modifier((element: Element) => {
		const observer = new ResizeObserver(([entry]) => {
			if (!entry) return;
			const { width, height } = entry.contentRect;
			if (width !== this.width) this.width = width;
			if (height !== this.height) this.height = height;
		});
		observer.observe(element);
		return () => observer.disconnect();
	});

	follow = modifier((_: Element, [text, rails]: [string, number]) => {
		const before = this.#shown;
		this.#shown = { text, rails };
		if (rails === before.rails || reducedMotion() || !this.width)
			return;
		const target = heights(
			Array.from(before.text).length,
			before.rails,
		);
		this.#from = target.map((h, i) => this.presented(i, h));
		this.#began = performance.now();
		cancelAnimationFrame(this.#frame);
		queueMicrotask(() => {
			if (!this.isDestroying) this.step();
		});
	});

	step = () => {
		this.progress = Math.min(
			1,
			(performance.now() - this.#began) / settleMs,
		);
		if (this.progress < 1)
			this.#frame = requestAnimationFrame(this.step);
	};

	presented(index: number, target: number) {
		const from = this.#from[index];
		if (this.progress >= 1 || from === undefined) return target;
		return from + (target - from) * glyphEased(this.progress);
	}

	get area() {
		return {
			x: padding,
			y: padding * 0.75,
			width: Math.max(0, this.width - padding * 2),
			height: Math.max(0, this.height - padding * 1.5),
		};
	}

	get scene() {
		const { area } = this;
		const characters = Array.from(this.args.text);
		const { rails } = this.args;
		if (area.width <= 0 || area.height <= 0 || !characters.length) {
			const rules = Array.from(
				{ length: area.width > 0 ? rails : 0 },
				(_, rail) => ({
					y:
						area.y +
						(area.height * rail) /
							Math.max(rails - 1, 1),
					faint: false,
				}),
			);
			return { rules, points: '', glyphs: [], size: 16 };
		}
		const pitch = Math.min(
			Math.max(
				area.width / characters.length,
				pitchRange.least,
			),
			pitchRange.most,
		);
		const columns = Math.min(
			characters.length,
			Math.floor(area.width / pitch),
		);
		const size = Math.min(16, pitch * 0.95);
		const half = size * 0.6;
		const top = area.y + half;
		const track = Math.max(0, area.height - half * 2);
		const effective = Math.max(
			2,
			Math.min(rails, characters.length),
		);
		const rail = railPattern(characters.length, rails);
		const target = heights(characters.length, rails);
		const rules = Array.from({ length: effective }, (_, index) => ({
			y: top + (track * index) / (effective - 1),
			faint: true,
		}));
		const fades = columns < characters.length;
		const glyphs = characters
			.slice(0, columns)
			.map((character, i) => {
				const x = area.x + (i + 0.5) * pitch;
				const y =
					top +
					track * this.presented(i, target[i]!);
				return {
					x,
					y,
					box: {
						x: x - pitch / 2 + 1,
						y: y - half,
						w: pitch - 2,
						h: half * 2,
					},
					text:
						character === ' '
							? '·'
							: character,
					ink:
						character === ' '
							? 'muted'
							: rail[i]! % 2 === 0
								? 'plain'
								: 'lit',
					opacity: fades
						? Math.min(1, (columns - i) / 4)
						: 1,
				};
			});
		return {
			rules,
			points: glyphs.map((g) => `${g.x},${g.y}`).join(' '),
			glyphs,
			size,
		};
	}

	<template>
		<div
			class="dec-layer"
			{{this.measure}}
			{{this.follow @text @rails}}
		>
			<svg
				class="dec-fence"
				width={{this.width}}
				height={{this.height}}
				role="img"
				aria-label={{@label}}
			>
				{{#each this.scene.rules as |rule|}}
					<rect
						class="dec-fence-rule
							{{if
								rule.faint
								'dec-fence-rule--faint'
							}}"
						x={{this.area.x}}
						y={{rule.y}}
						width={{this.area.width}}
						height="1"
						transform="translate(0 -0.5)"
					/>
				{{/each}}
				{{#if this.scene.points}}
					<polyline
						class="dec-fence-line"
						points={{this.scene.points}}
					/>
				{{/if}}
				{{#each this.scene.glyphs as |glyph|}}
					<g opacity={{glyph.opacity}}>
						<rect
							class="dec-fence-box"
							x={{glyph.box.x}}
							y={{glyph.box.y}}
							width={{glyph.box.w}}
							height={{glyph.box.h}}
						/>
						<text
							class="dec-fence-glyph dec-fence-glyph--{{glyph.ink}}"
							x={{glyph.x}}
							y={{glyph.y}}
							font-size={{this.scene.size}}
						>{{glyph.text}}</text>
					</g>
				{{/each}}
			</svg>
		</div>
	</template>
}
