import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { eq } from 'ember-truth-helpers';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonFigure from 'delphicanon/components/canon-figure';
import { IconSvg } from 'delphitools-v2/components/icon';
import {
	codeOf,
	decoding,
	encoded,
	encoding,
} from 'delphitools-v2/components/tools/decoder/bits';
import type {
	CipherId,
	ManualParams,
} from 'delphitools-v2/components/tools/decoder/engine';
import Fence from 'delphitools-v2/components/tools/decoder/fence';
import Pairs from 'delphitools-v2/components/tools/decoder/pairs';
import Regroup from 'delphitools-v2/components/tools/decoder/regroup';
import {
	marks,
	pairs,
	pictureOf,
	type Run,
} from 'delphitools-v2/components/tools/decoder/scene';

interface PictureSignature {
	Args: {
		text: string;
		cipher: CipherId;
		encode: boolean;
		params: ManualParams;
		source: string;
		output: string;
		name: string;
		detail: string;
		score?: number;
		onInput: (text: string) => void;
		onHeight: (height: number) => void;
		onFocus: (focused: boolean) => void;
	};
}

const PasteIcon = <template><IconSvg @name="clipboard" /></template>;
const ClearIcon = <template><IconSvg @name="trash-2" /></template>;

export const headHeight = 44;
export const stageHeight = 148;

const reportHeight = modifier(
	(element: HTMLElement, [report]: [(height: number) => void]) => {
		const observer = new ResizeObserver(() =>
			report(headHeight + element.offsetHeight + stageHeight),
		);
		observer.observe(element);
		return () => observer.disconnect();
	},
);

export default class Picture extends Component<PictureSignature> {
	get kind() {
		return pictureOf(this.args.cipher);
	}

	get label() {
		const { name, detail } = this.args;
		return detail ? `${name}, ${detail}` : name;
	}

	get runs(): Run[] {
		const { cipher, encode, params, source, text } = this.args;
		return source
			? marks(cipher, encode, params, text)
			: [{ text, tone: 'ink' }];
	}

	get tail() {
		return '​';
	}

	get pairs() {
		const { cipher, encode, params, source, output } = this.args;
		return pairs(cipher, encode, params, source, output);
	}

	get reading() {
		const { cipher, encode, source } = this.args;
		const code = codeOf(cipher);
		return encode
			? encoding([...new TextEncoder().encode(source)], code)
			: decoding(encoded(source, cipher), code);
	}

	get fenceText() {
		return this.args.encode ? this.args.source : this.args.output;
	}

	get score() {
		const { score } = this.args;
		return score === undefined
			? undefined
			: String(Math.round(score * 100));
	}

	input = (event: Event) =>
		this.args.onInput((event.target as HTMLTextAreaElement).value);

	paste = async () => {
		const text = await navigator.clipboard
			.readText()
			.catch(() => '');
		if (text && !this.isDestroying) this.args.onInput(text);
	};

	clear = () => this.args.onInput('');

	focused = () => this.args.onFocus(true);

	blurred = () => this.args.onFocus(false);

	<template>
		<figure class="dec-picture" aria-label={{this.label}}>
			<div class="dec-head">
				<figcaption class="dec-caption">
					<span
						class="dec-caption-name"
					>{{@name}}</span>
					{{#if @detail}}
						<span
							class="dec-caption-detail"
						>{{@detail}}</span>
					{{/if}}
				</figcaption>
				<CanonFigure
					class="dec-score
						{{if
							this.score
							'dec-score--shown'
						}}"
					@text={{if this.score this.score "0"}}
					@unit="%"
					@size={{20}}
					aria-hidden={{if
						this.score
						"false"
						"true"
					}}
				/>
				<span class="dec-tools">
					<CanonButton
						@kind="cell"
						@label="Paste"
						@icon={{PasteIcon}}
						@onClick={{this.paste}}
					/>
					<CanonButton
						@kind="cell"
						@label="Clear"
						@icon={{ClearIcon}}
						@disabled={{if
							@text
							false
							true
						}}
						@onClick={{this.clear}}
					/>
				</span>
			</div>
			<div class="dec-scroll">
				<div
					class="dec-text"
					{{reportHeight @onHeight}}
				>
					<div
						class="dec-marks"
						aria-hidden="true"
					>
						{{~#each this.runs as |run|~}}
							<span
								class="dec-tone--{{run.tone}}"
							>{{run.text}}</span>
						{{~/each~}}
						{{~this.tail~}}
					</div>
					<textarea
						class="dec-input"
						rows="1"
						placeholder="Paste cipher text or plaintext here…"
						aria-label="Input"
						autocomplete="off"
						autocapitalize="off"
						spellcheck="false"
						value={{@text}}
						{{on "input" this.input}}
						{{on "focus" this.focused}}
						{{on "blur" this.blurred}}
					></textarea>
				</div>
			</div>
			<div class="dec-stage">
				{{#if (eq this.kind "fence")}}
					<Fence
						@text={{this.fenceText}}
						@rails={{@params.rails}}
						@label={{@output}}
					/>
				{{else if (eq this.kind "bits")}}
					<Regroup
						@reading={{this.reading}}
						@label={{@output}}
					/>
				{{else}}
					<Pairs
						@pairs={{this.pairs}}
						@label={{@output}}
					/>
				{{/if}}
			</div>
		</figure>
	</template>
}
