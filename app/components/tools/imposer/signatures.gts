import Component from '@glimmer/component';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import type { Signature } from 'delphitools-v2/components/tools/imposer/sheet';

export const blockHeight = 128;

const top = 14;
const label = 18;
const spine = blockHeight - 14 - label - 8;

const range = (signature: Signature) => `${signature.from}–${signature.to}`;

const reveal = modifier((element: HTMLElement, [lit]: [number]) => {
	void lit;
	const button = element.querySelector<HTMLElement>(
		'.imp-block-signature--lit',
	);
	if (!button) return;
	const start = button.offsetLeft - 24;
	const end = button.offsetLeft + button.offsetWidth + 24;
	if (start < element.scrollLeft) element.scrollLeft = start;
	else if (end > element.scrollLeft + element.clientWidth)
		element.scrollLeft = end - element.clientWidth;
});

export interface SignatureBlockSignature {
	Args: {
		signatures: Signature[];
		lit: number;
		glued: boolean;
		onSelect: (sheet: number) => void;
	};
	Element: HTMLDivElement;
}

export default class SignatureBlock extends Component<SignatureBlockSignature> {
	get label() {
		return this.args.signatures.map(range).join(', ');
	}

	get labelY() {
		return spine + 8 + (this.args.glued ? 3 : 0);
	}

	get items() {
		const { lit } = this.args;
		let first = 0;
		return this.args.signatures.map((signature) => {
			const width = Math.min(
				120,
				Math.max(44, 20 + signature.sheets * 7),
			);
			const count = Math.max(signature.sheets, 1);
			const step = Math.min(
				4,
				(width / 2 - 6) / count,
				(spine - top - 8) / count,
			);
			const folds = Array.from(
				{ length: signature.sheets },
				(_, inner) => {
					const inset = inner * step;
					const left = inset;
					const right = width - inset;
					const bottom = spine - inset;
					const r = Math.min(
						8,
						(right - left) / 2,
					);
					return {
						d:
							`M${left} ${top}L${left} ${bottom - r}` +
							`Q${left} ${bottom} ${left + r} ${bottom}` +
							`L${right - r} ${bottom}` +
							`Q${right} ${bottom} ${right} ${bottom - r}` +
							`L${right} ${top}`,
						lit: first + inner === lit,
					};
				},
			);
			const item = {
				first,
				width,
				viewBox: `0 0 ${width} ${blockHeight}`,
				centre: width / 2,
				label: range(signature),
				lit:
					lit >= first &&
					lit < first + signature.sheets,
				folds,
			};
			first += signature.sheets;
			return item;
		});
	}

	<template>
		<div
			class="imp-block"
			role="group"
			aria-label={{this.label}}
			{{reveal @lit}}
			...attributes
		>
			<div class="imp-block-track">
				{{#each this.items as |item|}}
					<button
						type="button"
						class="imp-block-signature
							{{if
								item.lit
								'imp-block-signature--lit'
							}}"
						aria-label={{item.label}}
						aria-current={{if
							item.lit
							"true"
						}}
						{{on
							"click"
							(fn
								@onSelect
								item.first
							)
						}}
					>
						<svg
							viewBox={{item.viewBox}}
							width={{item.width}}
							height={{blockHeight}}
							aria-hidden="true"
						>
							{{#each
								item.folds
								as |fold|
							}}
								<path
									class="imp-block-sheet
										{{if
											fold.lit
											'imp-block-sheet--lit'
										}}"
									d={{fold.d}}
								/>
							{{/each}}
							<text
								class="imp-block-label"
								x={{item.centre}}
								y={{this.labelY}}
							>{{item.label}}</text>
						</svg>
					</button>
				{{/each}}
				{{#if @glued}}
					<span class="imp-block-glue"></span>
				{{/if}}
			</div>
		</div>
	</template>
}
