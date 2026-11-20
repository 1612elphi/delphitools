import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { htmlSafe } from '@ember/template';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonMathView from 'delphicanon/components/canon-math-view';
import CanonRow from 'delphicanon/components/canon-row';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonStepper from 'delphicanon/components/canon-stepper';

const forms = ['Factored', 'Expanded'];
const fill = htmlSafe('block-size: 100%');

function expanded(n: number) {
	const terms: string[] = [];
	let coefficient = 1;
	for (let k = n; k >= 0; k--) {
		const power = k === 0 ? '' : k === 1 ? 'x' : `x^${k}`;
		const times = coefficient === 1 || !power ? '' : '*';
		const number =
			coefficient === 1 && power ? '' : String(coefficient);
		terms.push(`${number}${times}${power}`);
		coefficient = (coefficient * k) / (n - k + 1);
	}
	return terms.join('+');
}

export default class MathsPattern extends Component {
	@tracked form = 0;
	@tracked power = 2;

	get text() {
		return this.form ? expanded(this.power) : `(x+1)^${this.power}`;
	}

	setForm = (form: number) => (this.form = form);
	step = (direction: -1 | 1) =>
		(this.power = Math.min(5, Math.max(1, this.power + direction)));

	<template>
		<CanonCanvas @height={{128}}>
			<CanonMathView
				@text={{this.text}}
				@size={{28}}
				@morphs={{true}}
				style={{fill}}
			/>
		</CanonCanvas>
		<CanonSegmented
			aria-label="Form"
			@items={{forms}}
			@selected={{this.form}}
			@onChange={{this.setForm}}
		/>
		<CanonRow @title="Power" @form="flush">
			<CanonStepper @onStep={{this.step}}>
				<span
					class="canon-stepper-value"
				>{{this.power}}</span>
			</CanonStepper>
		</CanonRow>
	</template>
}
