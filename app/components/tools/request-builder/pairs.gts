import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonTextCell from 'delphicanon/components/canon-text-cell';
import { IconSvg } from 'delphitools-v2/components/icon';

export class PairRow {
	@tracked key;
	@tracked value;
	focus: boolean;

	constructor(key = '', value = '', focus = false) {
		this.key = key;
		this.value = value;
		this.focus = focus;
	}
}

interface PairsSignature {
	Args: {
		rows: PairRow[];
		keyName: string;
		label: string;
		onChange: (rows: PairRow[]) => void;
	};
}

const AddIcon = <template><IconSvg @name="plus" /></template>;
const RemoveIcon = <template><IconSvg @name="x" /></template>;

const focusNew = modifier((field: HTMLInputElement, [row]: [PairRow]) => {
	if (!row.focus) return;
	row.focus = false;
	field.focus();
});

export default class Pairs extends Component<PairsSignature> {
	add = () =>
		this.args.onChange([
			...this.args.rows,
			new PairRow('', '', true),
		]);

	remove = (row: PairRow) =>
		this.args.onChange(
			this.args.rows.filter((other) => other !== row),
		);

	setKey = (row: PairRow, value: string) => {
		row.key = value;
		this.args.onChange(this.args.rows);
	};

	setValue = (row: PairRow, value: string) => {
		row.value = value;
		this.args.onChange(this.args.rows);
	};

	<template>
		<div class="rq-pairs" role="group" aria-label={{@label}}>
			{{#each @rows as |row|}}
				<div class="rq-pair">
					<CanonTextCell
						class="rq-pair-cell"
						autocomplete="off"
						autocapitalize="off"
						spellcheck="false"
						@value={{row.key}}
						@placeholder={{@keyName}}
						@onChange={{fn this.setKey row}}
						aria-label={{@keyName}}
						{{focusNew row}}
					/>
					<CanonTextCell
						class="rq-pair-cell"
						autocomplete="off"
						autocapitalize="off"
						spellcheck="false"
						@value={{row.value}}
						@placeholder="Value"
						@onChange={{fn
							this.setValue
							row
						}}
						aria-label="Value"
					/>
					<CanonButton
						class="rq-pair-remove"
						@kind="cell"
						@icon={{RemoveIcon}}
						@label="Remove"
						@onClick={{fn this.remove row}}
					/>
				</div>
			{{/each}}
			<CanonButton
				class="rq-pair-add"
				@kind="cell"
				@text="Add"
				@icon={{AddIcon}}
				@onClick={{this.add}}
			/>
		</div>
	</template>
}
