import Component from '@glimmer/component';

const NONE = Symbol('none');

export interface FreshSignature {
	Args: { value: unknown };
	Blocks: { default: [mine: (value: unknown) => void] };
}

export default class Fresh extends Component<FreshSignature> {
	#key = 0;
	#last: unknown = this.args.value;
	#mine: unknown = NONE;

	/* eslint-disable ember/no-side-effects */
	get keys(): number[] {
		const { value } = this.args;
		if (value !== this.#last) {
			if (value !== this.#mine) this.#key++;
			this.#last = value;
			this.#mine = NONE;
		}
		return [this.#key];
	}
	/* eslint-enable ember/no-side-effects */

	mine = (value: unknown) => {
		this.#mine = value;
	};

	<template>
		{{#each this.keys key="@identity"}}
			{{yield this.mine}}
		{{/each}}
	</template>
}

export function both<A extends unknown[]>(
	mine: (value: unknown) => void,
	write: (...args: A) => void,
): (...args: A) => void {
	return (...args) => {
		mine(args[0]);
		write(...args);
	};
}
