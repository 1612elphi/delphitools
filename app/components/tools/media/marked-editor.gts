import Component from '@glimmer/component';
import { htmlSafe } from '@ember/template';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import './marked-editor.css';

export interface MarkedLine {
	lit?: boolean;
}

interface MarkedEditorSignature<L extends MarkedLine> {
	Args: {
		text: string;
		placeholder: string;
		label: string;
		onInput: (text: string) => void;
		lines?: L[];
		interactive?: boolean;
		prose?: boolean;
	};
	Blocks: {
		default: [];
		line: [line: L];
	};
	Element: HTMLDivElement;
}

const headHeight = 50;

export const reportHeight = modifier(
	(element: HTMLElement, [report]: [(height: number) => void]) => {
		const observer = new ResizeObserver(() =>
			report(headHeight + element.offsetHeight),
		);
		observer.observe(element);
		return () => observer.disconnect();
	},
);

const number = (index: number) => index + 1;

export default class MarkedEditor<
	L extends MarkedLine = MarkedLine,
> extends Component<MarkedEditorSignature<L>> {
	get gutterStyle() {
		const { lines } = this.args;
		if (!lines) return undefined;
		const digits = String(lines.length).length;
		return htmlSafe(
			`--media-marked-gutter: calc(${Math.max(2, digits)}ch + 14px)`,
		);
	}

	get tail() {
		return this.args.text?.endsWith('\n') ? '\u200b' : '';
	}

	input = (event: Event) =>
		this.args.onInput((event.target as HTMLTextAreaElement).value);

	<template>
		<div class="media-marked" ...attributes>
			{{#if @text}}
				{{#unless @interactive}}
					<div
						class="media-marked-marks"
						style={{this.gutterStyle}}
						aria-hidden="true"
					>
						{{~#if @lines~}}
							{{~#each
								@lines
								key="@index"
								as |line index|
							~}}
								<div
									class="media-marked-line
										{{if
											line.lit
											'media-marked-line--lit'
										}}"
								><span
										class="media-marked-gutter"
									>{{number
											index
										}}</span><span
										class="media-marked-text"
									>{{~yield
											line
											to="line"
										~}}</span></div>
							{{~/each~}}
						{{~else~}}
							{{~yield~}}
							{{~this.tail~}}
						{{~/if~}}
					</div>
				{{/unless}}
			{{/if}}
			<textarea
				class="media-marked-source"
				style={{this.gutterStyle}}
				rows="1"
				placeholder={{@placeholder}}
				aria-label={{@label}}
				autocomplete="off"
				autocapitalize={{unless @prose "off"}}
				spellcheck="false"
				value={{@text}}
				{{on "input" this.input}}
			></textarea>
			{{#if @text}}
				{{#if @interactive}}
					<div
						class="media-marked-marks"
					>{{~yield~}}</div>
				{{/if}}
			{{/if}}
		</div>
	</template>
}
