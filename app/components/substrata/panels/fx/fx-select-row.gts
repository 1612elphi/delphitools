import Component from '@glimmer/component';
import CanonMenuCell from 'delphicanon/components/canon-menu-cell';
import CanonRow from 'delphicanon/components/canon-row';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import type { SelectParam } from 'delphitools-v2/lib/substrata/param-spec';
import { specOf, stringOf, write, type FxContext } from './fx-context';

interface Signature {
	Args: { ctx: FxContext; key: string; bare?: boolean };
}

export default class FxSelectRow extends Component<Signature> {
	get spec() {
		return specOf(this.args.ctx, this.args.key) as SelectParam;
	}

	get items() {
		return this.spec.options.map((o) => o.label);
	}

	get long() {
		return this.spec.options.length > 4;
	}

	get selected() {
		const value = stringOf(this.args.ctx, this.args.key);
		return Math.max(
			0,
			this.spec.options.findIndex((o) => o.value === value),
		);
	}

	pick = (index: number) => {
		const option = this.spec.options[index];
		if (option)
			write(this.args.ctx, { [this.args.key]: option.value });
	};

	<template>
		{{#if @bare}}
			<CanonSegmented
				class="sub-fxp-choice"
				aria-label={{this.spec.label}}
				data-fx-param={{@key}}
				@items={{this.items}}
				@selected={{this.selected}}
				@onChange={{this.pick}}
			/>
		{{else}}
			<CanonRow
				class="sub-fxp-row"
				@title={{this.spec.label}}
				@form="flush"
				data-fx-param={{@key}}
				as |titleId|
			>
				{{#if this.long}}
					<CanonMenuCell
						@labelledBy={{titleId}}
						@items={{this.items}}
						@selected={{this.selected}}
						@onChange={{this.pick}}
					/>
				{{else}}
					<CanonSegmented
						aria-labelledby={{titleId}}
						@items={{this.items}}
						@selected={{this.selected}}
						@onChange={{this.pick}}
					/>
				{{/if}}
			</CanonRow>
		{{/if}}
	</template>
}
