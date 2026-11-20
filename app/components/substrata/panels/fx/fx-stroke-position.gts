import Component from '@glimmer/component';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import CanonRow from 'delphicanon/components/canon-row';
import type { SelectParam } from 'delphitools-v2/lib/substrata/param-spec';
import {
	resetOnDouble,
	specOf,
	stringOf,
	write,
	type FxContext,
} from './fx-context';

export default class FxStrokePosition extends Component<{
	Args: { ctx: FxContext };
}> {
	get spec() {
		return specOf(this.args.ctx, 'position') as SelectParam;
	}

	get value() {
		return stringOf(this.args.ctx, 'position');
	}

	get reset() {
		return resetOnDouble(this.args.ctx, 'position');
	}

	isOn = (v: string) => v === this.value;

	pick = (v: string) => {
		if (v !== this.value) write(this.args.ctx, { position: v });
	};

	<template>
		<CanonRow
			class="sub-fxp-row"
			@title={{this.spec.label}}
			@form="flush"
			data-fx-param="position"
			{{on "dblclick" this.reset}}
			as |titleId|
		>
			<div
				class="sub-fxp-position"
				role="radiogroup"
				aria-labelledby={{titleId}}
			>
				{{#each this.spec.options key="value" as |o|}}
					<button
						type="button"
						class="sub-fxp-position-cell is-{{o.value}}
							{{if
								(this.isOn
									o.value
								)
								'is-selected'
							}}"
						role="radio"
						aria-checked={{if
							(this.isOn o.value)
							"true"
							"false"
						}}
						{{on
							"click"
							(fn this.pick o.value)
						}}
					>
						<span
							class="sub-fxp-position-mark"
							aria-hidden="true"
						></span>
						<span>{{o.label}}</span>
					</button>
				{{/each}}
			</div>
		</CanonRow>
	</template>
}
