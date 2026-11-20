import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import {
	formatTimestamp,
	parseTimestamp,
	type Cue,
} from 'delphitools-v2/lib/subtitles';
import './cue-row.css';

export interface CueRowSignature {
	Args: {
		index: number;
		cue: Cue;
		editable?: boolean;
		marked?: boolean;
		onChange?: (cue: Cue) => void;
		onSelect?: () => void;
	};
	Element: HTMLElement;
}

export const timecode = (ms: number) => formatTimestamp(ms, '.');

export function retimed(
	cue: Cue,
	edge: 'start' | 'end',
	text: string,
): Cue | null {
	const ms = parseTimestamp(text);
	return ms === null ? null : { ...cue, [edge]: ms };
}

const show = modifier(
	(field: HTMLInputElement | HTMLTextAreaElement, [value]: [string]) => {
		if (document.activeElement !== field && field.value !== value)
			field.value = value;
	},
);

function blurOnEnter(event: KeyboardEvent) {
	if (event.key === 'Enter') (event.target as HTMLElement).blur();
}

export default class CueRow extends Component<CueRowSignature> {
	get number() {
		return this.args.index + 1;
	}

	get start() {
		return timecode(this.args.cue.start);
	}

	get end() {
		return timecode(this.args.cue.end);
	}

	get lines() {
		return this.args.cue.text.split('\n').length;
	}

	select = () => this.args.onSelect?.();

	commitStart = (event: Event) => this.#commit(event, 'start');

	commitEnd = (event: Event) => this.#commit(event, 'end');

	#commit(event: Event, edge: 'start' | 'end') {
		const field = event.target as HTMLInputElement;
		const next = retimed(this.args.cue, edge, field.value);
		if (next && next[edge] !== this.args.cue[edge])
			this.args.onChange?.(next);
		field.value = timecode((next ?? this.args.cue)[edge]);
	}

	editText = (event: Event) => {
		const text = (event.target as HTMLTextAreaElement).value;
		this.args.onChange?.({ ...this.args.cue, text });
	};

	<template>
		{{#if @editable}}
			<div
				class="cue-row {{if @marked 'cue-row--marked'}}"
				{{on "focusin" this.select}}
				...attributes
			>
				<div class="cue-row-times">
					<span
						class="cue-row-index"
					>{{this.number}}</span>
					<input
						type="text"
						class="cue-row-time"
						aria-label="Start"
						inputmode="decimal"
						autocomplete="off"
						spellcheck="false"
						enterkeyhint="done"
						{{show this.start}}
						{{on "blur" this.commitStart}}
						{{on "keydown" blurOnEnter}}
					/>
					<input
						type="text"
						class="cue-row-time cue-row-time--end"
						aria-label="End"
						inputmode="decimal"
						autocomplete="off"
						spellcheck="false"
						enterkeyhint="done"
						{{show this.end}}
						{{on "blur" this.commitEnd}}
						{{on "keydown" blurOnEnter}}
					/>
				</div>
				<textarea
					class="cue-row-text"
					aria-label="Text"
					rows={{this.lines}}
					spellcheck="false"
					{{show @cue.text}}
					{{on "input" this.editText}}
				></textarea>
			</div>
		{{else if @onSelect}}
			<button
				type="button"
				class="cue-row cue-row--pressable
					{{if @marked 'cue-row--marked'}}"
				aria-current={{if @marked "true"}}
				{{on "click" this.select}}
				...attributes
			>
				<span class="cue-row-times">
					<span
						class="cue-row-index"
					>{{this.number}}</span>
					<span
						class="cue-row-time"
					>{{this.start}}</span>
					<span
						class="cue-row-time cue-row-time--end"
					>{{this.end}}</span>
				</span>
				<span class="cue-row-text">{{@cue.text}}</span>
			</button>
		{{else}}
			<div
				class="cue-row {{if @marked 'cue-row--marked'}}"
				...attributes
			>
				<div class="cue-row-times">
					<span
						class="cue-row-index"
					>{{this.number}}</span>
					<span
						class="cue-row-time"
					>{{this.start}}</span>
					<span
						class="cue-row-time cue-row-time--end"
					>{{this.end}}</span>
				</div>
				<div class="cue-row-text">{{@cue.text}}</div>
			</div>
		{{/if}}
	</template>
}
