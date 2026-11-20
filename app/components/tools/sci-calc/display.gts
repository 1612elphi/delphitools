import Component from '@glimmer/component';
import { modifier } from 'ember-modifier';
import {
	groupBreaks,
	parts,
	type Piece,
} from 'delphitools-v2/components/tools/sci-calc/entry';

export type ReadoutKind = 'idle' | 'blank' | 'preview' | 'result' | 'failure';

export interface Readout {
	kind: ReadoutKind;
	text: string;
}

export interface DisplaySignature {
	Args: {
		pieces: Piece[];
		ghosts: number;
		dimmed: boolean;
		readout: Readout;
		degrees: boolean;
	};
}

const fit = modifier((element: HTMLElement, [minimum]: [number, unknown]) => {
	const content = element.firstElementChild as HTMLElement | null;
	const run = () => {
		if (!content) return;
		element.style.setProperty('--sci-fit', '1');
		const need = content.getBoundingClientRect().width;
		const room = element.clientWidth;
		const scale = need > room ? Math.max(minimum, room / need) : 1;
		element.style.setProperty('--sci-fit', String(scale));
	};
	run();
	void document.fonts?.ready.then(run);
	const size = new ResizeObserver(run);
	size.observe(element);
	return () => size.disconnect();
});

export default class Display extends Component<DisplaySignature> {
	get ghostText() {
		return ')'.repeat(this.args.ghosts);
	}

	get worded() {
		const { kind, text } = this.args.readout;
		return (
			kind === 'failure' ||
			/\p{L}/u.test(parts(text).mantissa)
		);
	}

	get infinite() {
		return this.args.readout.text.includes('∞');
	}

	get figure() {
		const { mantissa, exponent } = parts(this.args.readout.text);
		const breaks = new Set(groupBreaks(mantissa));
		const characters = [...mantissa];
		return {
			characters: characters.map((character, index) => ({
				character,
				gap: breaks.has(index),
				stop:
					character === '.' ||
					characters[index + 1] === '.',
			})),
			exponent,
		};
	}

	<template>
		<div class="sci-display">
			<div class="sci-display-top">
				<span class="sci-lamps" aria-hidden="true">
					<span
						class="sci-lamp
							{{if
								@degrees
								'is-lit'
							}}"
					>DEG</span>
					<span
						class="sci-lamp
							{{unless
								@degrees
								'is-lit'
							}}"
					>RAD</span>
				</span>
				<div
					class="sci-expression
						{{if @dimmed 'is-dimmed'}}"
					{{fit 0.7 @pieces}}
				>
					<span class="sci-expression-text">
						{{~#each @pieces as |piece|~}}
							<span
								class="sci-piece sci-piece--{{piece.kind}}
									{{if
										piece.raised
										'is-raised'
									}}"
							>{{piece.text}}</span>
						{{~/each~}}
						{{~#if @ghosts~}}
							<span
								class="sci-piece sci-piece--ghost"
								aria-hidden="true"
							>{{this.ghostText}}</span>
						{{~/if~}}
					</span>
				</div>
			</div>
			<div class="sci-rule"></div>
			<output
				class="sci-readout sci-readout--{{@readout.kind}}"
				aria-label="Result"
				aria-live="polite"
				{{fit 0.4 @readout.text}}
			>
				{{#if this.worded}}
					<span
						class="sci-readout-text sci-readout-word
							{{if
								this.infinite
								'is-infinite'
							}}"
					>{{@readout.text}}</span>
				{{else}}
					<span class="sci-readout-text">
						{{~#each
							this.figure.characters
							as |c|
						~}}
							<span
								class="{{if
										c.gap
										'sci-gap'
									}}
									{{if
										c.stop
										'sci-stop'
									}}"
							>{{c.character}}</span>
						{{~/each~}}
						{{~#if this.figure.exponent~}}
							<span
								class="sci-times"
							>&nbsp;×</span><span
								class="sci-ten"
							>10</span><span
								class="sci-power"
							>{{this.figure.exponent}}</span>
						{{~/if~}}
					</span>
				{{/if}}
			</output>
		</div>
	</template>
}
