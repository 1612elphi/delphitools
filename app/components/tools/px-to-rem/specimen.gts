import type { TOC } from '@ember/component/template-only';
import { modifier } from 'ember-modifier';
import CanonFigure from 'delphicanon/components/canon-figure';
import { reducedMotion } from 'delphicanon/lib/motion';
import {
	lineSpacing,
	settleEased,
	settleMs,
} from 'delphitools-v2/components/tools/px-to-rem/rem';

export interface SpecimenSignature {
	Args: {
		pixels?: number;
		base: number;
		result: string;
		unit: string;
	};
	Element: HTMLDivElement;
}

interface Pose {
	pixels: number;
	base: number;
}

const shown = new WeakMap<HTMLElement, Pose>();

// ponytail: glyphs over 600 px are clamped; the 200 px band clips long before that
function paint(element: HTMLElement, pose: Pose) {
	shown.set(element, pose);
	element.style.setProperty(
		'--px-to-rem-line',
		`${lineSpacing(pose.base)}px`,
	);
	element.style.setProperty(
		'--px-to-rem-glyph',
		`${Math.round(Math.min(pose.pixels, 600))}px`,
	);
}

const settle = modifier(
	(
		element: HTMLElement,
		[pixels, base]: [number | undefined, number],
	) => {
		const target = { pixels: Math.max(0, pixels ?? 0), base };
		const from = shown.get(element);
		if (!from || reducedMotion()) {
			paint(element, target);
			return;
		}
		const started = performance.now();
		const step = (now: number) => {
			const progress = Math.min(
				1,
				Math.max(0, (now - started) / settleMs),
			);
			const eased = settleEased(progress);
			paint(element, {
				pixels: Math.max(
					0,
					from.pixels +
						(target.pixels - from.pixels) *
							eased,
				),
				base: Math.max(
					1,
					from.base +
						(target.base - from.base) *
							eased,
				),
			});
			if (progress < 1) frame = requestAnimationFrame(step);
		};
		let frame = requestAnimationFrame(step);
		return () => cancelAnimationFrame(frame);
	},
);

const Specimen: TOC<SpecimenSignature> = <template>
	<div class="px-to-rem-specimen" {{settle @pixels @base}} ...attributes>
		<div class="px-to-rem-grid" aria-hidden="true"></div>
		<svg class="px-to-rem-glyphs" aria-hidden="true">
			<text y="1">Ag</text>
		</svg>
		<output class="px-to-rem-result" aria-label="Result">
			<CanonFigure
				@text={{@result}}
				@unit={{@unit}}
				@size={{figureSize @result @unit}}
				@halo="var(--canon-card)"
			/>
		</output>
	</div>
</template>;

// ponytail: shrinks past nine characters instead of measuring the text
function figureSize(result: string, unit: string) {
	const length = result.length + unit.length;
	return length <= 9 ? 40 : Math.max(20, Math.floor((40 * 9) / length));
}

export default Specimen;
