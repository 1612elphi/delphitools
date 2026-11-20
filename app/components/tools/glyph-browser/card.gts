import type { TOC } from '@ember/component/template-only';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import CanonFigure from 'delphicanon/components/canon-figure';
import CanonValueLine from 'delphicanon/components/canon-value-line';
import { reducedMotion } from 'delphicanon/lib/motion';
import press from 'delphicanon/modifiers/canon-press';

export interface CardSignature {
	Args: {
		char: string;
		code: number;
		label: string;
		category: string;
		lines: { label: string; value: string }[];
		onCopyLabel: () => void;
		onHeight: (height: number) => void;
	};
}

const shownBefore = new WeakMap<HTMLElement, number>();

const push = modifier((element: HTMLElement, [code]: [number]) => {
	const before = shownBefore.get(element);
	shownBefore.set(element, code);
	if (before === undefined || before === code || reducedMotion()) return;
	const from = code > before ? 1 : -1;
	const rtl = getComputedStyle(element).direction === 'rtl' ? -1 : 1;
	element.animate(
		[
			{ translate: `${from * rtl * 40}% 0`, opacity: 0 },
			{ translate: '0 0', opacity: 1 },
		],
		{ duration: 280, easing: 'ease-out' },
	);
});

const reportHeight = modifier(
	(element: HTMLElement, [report]: [(height: number) => void]) => {
		const observer = new ResizeObserver(() =>
			report(element.offsetHeight),
		);
		observer.observe(element);
		return () => observer.disconnect();
	},
);

const Card: TOC<CardSignature> = <template>
	<div class="gb-card">
		<div class="gb-card-body" {{reportHeight @onHeight}}>
			<div class="gb-card-top">
				<div
					class="gb-square"
					role="img"
					aria-label={{@char}}
				>
					<span
						class="gb-square-glyph"
						aria-hidden="true"
						{{push @code}}
					>{{@char}}</span>
				</div>
				<div class="gb-words">
					<button
						type="button"
						class="gb-figure"
						aria-label="Code Point, {{@label}}"
						{{press}}
						{{on "click" @onCopyLabel}}
					>
						<CanonFigure
							@text={{@label}}
							@size={{28}}
						/>
					</button>
					<span
						class="gb-facts"
					>{{@category}}</span>
				</div>
			</div>
			<div class="gb-values">
				{{#each @lines key="label" as |line|}}
					<CanonValueLine
						@label={{line.label}}
						@value={{line.value}}
						@layout="above"
						@fadeDelay={{0}}
					/>
				{{/each}}
			</div>
		</div>
	</div>
</template>;

export default Card;
