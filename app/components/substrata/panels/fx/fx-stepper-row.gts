import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import CanonRow from 'delphicanon/components/canon-row';
import CanonNumberField from 'delphicanon/components/canon-number-field';
import type { StepperParam } from 'delphitools-v2/lib/substrata/param-spec';
import {
	numberOf,
	resetOnDouble,
	specOf,
	write,
	type FxContext,
} from './fx-context';

interface Signature {
	Args: { ctx: FxContext; key: string };
}

export default class FxStepperRow extends Component<Signature> {
	get spec() {
		return specOf(this.args.ctx, this.args.key) as StepperParam;
	}

	get value() {
		return Math.round(numberOf(this.args.ctx, this.args.key));
	}

	get reset() {
		return resetOnDouble(this.args.ctx, this.args.key);
	}

	change = (v: number) => write(this.args.ctx, { [this.args.key]: v });

	<template>
		<CanonRow
			class="sub-fxp-row"
			@title={{this.spec.label}}
			@form="flush"
			data-fx-param={{@key}}
			{{on "dblclick" this.reset}}
			as |titleId|
		>
			<CanonNumberField
				@value={{this.value}}
				@min={{this.spec.min}}
				@max={{this.spec.max}}
				@step={{this.spec.step}}
				@unit={{this.spec.unit}}
				@labelledBy={{titleId}}
				@onChange={{this.change}}
			/>
		</CanonRow>
	</template>
}
