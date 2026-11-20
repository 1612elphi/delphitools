import Component from '@glimmer/component';
import type { TOC } from '@ember/component/template-only';
import { concat, fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { eq } from 'ember-truth-helpers';
import type { MaskShape } from 'delphitools-v2/lib/mask-shapes';
import {
	families,
	familyIndex,
	inFamily,
} from 'delphitools-v2/components/tools/image-masker/mask';

export interface PickerSignature {
	Args: {
		shape: MaskShape;
		custom: boolean;
		thumb?: string;
		onPick: (shape: MaskShape) => void;
	};
}

const Glyph: TOC<{
	Args: { shape: MaskShape; thumb?: string };
}> = <template>
	<svg viewBox="0 0 100 100" aria-hidden="true">
		{{#if @thumb}}
			<clipPath id={{concat "masker-clip-" @shape.id}}><path
					d={{@shape.d}}
				/></clipPath>
			<image
				href={{@thumb}}
				width="100"
				height="100"
				preserveAspectRatio="xMidYMid slice"
				clip-path={{concat
					"url(#masker-clip-"
					@shape.id
					")"
				}}
			/>
		{{else}}
			<path d={{@shape.d}} />
		{{/if}}
	</svg>
</template>;

const fillers = Array.from({ length: (14 - (families.length % 14)) % 14 });

export default class Picker extends Component<PickerSignature> {
	get family() {
		return Math.max(0, familyIndex(this.args.shape));
	}

	get chosenFamily() {
		return this.args.custom ? -1 : this.family;
	}

	get chosenId() {
		return this.args.custom ? undefined : this.args.shape.id;
	}

	get families() {
		return families.map((family) => ({
			...family,
			first: family.shapes[0]!,
		}));
	}

	get variants() {
		return families[this.family]!.shapes;
	}

	pickFamily = (index: number) =>
		this.args.onPick(inFamily(this.args.shape, index));

	<template>
		<div class="masker-picker">
			<div class="masker-cells masker-cells--families">
				{{#each this.families as |family index|}}
					<button
						type="button"
						class="masker-cell
							{{if
								(eq
									index
									this.chosenFamily
								)
								'masker-cell--chosen'
							}}"
						title={{family.title}}
						aria-label={{family.title}}
						aria-pressed={{if
							(eq
								index
								this.chosenFamily
							)
							"true"
							"false"
						}}
						{{on
							"click"
							(fn
								this.pickFamily
								index
							)
						}}
					><Glyph
							@shape={{family.first}}
						/></button>
				{{/each}}
				{{#each fillers}}
					<span
						class="masker-cell masker-filler"
					></span>
				{{/each}}
			</div>
			<div class="masker-cells masker-cells--variants">
				{{#each this.variants key="id" as |shape|}}
					<button
						type="button"
						class="masker-cell
							{{if
								(eq
									shape.id
									this.chosenId
								)
								'masker-cell--chosen'
							}}"
						title={{shape.label}}
						aria-label={{shape.label}}
						aria-pressed={{if
							(eq
								shape.id
								this.chosenId
							)
							"true"
							"false"
						}}
						{{on
							"click"
							(fn @onPick shape)
						}}
					><Glyph
							@shape={{shape}}
							@thumb={{@thumb}}
						/></button>
				{{/each}}
			</div>
		</div>
	</template>
}
