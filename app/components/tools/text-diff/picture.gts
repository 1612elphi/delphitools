import Component from '@glimmer/component';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import { IconSvg } from 'delphitools-v2/components/icon';
import MarkedEditor from 'delphitools-v2/components/tools/media/marked-editor';
import {
	pieces,
	type SideMark,
} from 'delphitools-v2/components/tools/text-diff/diff';

export type SideId = 'old' | 'new';

interface PictureSignature {
	Args: {
		oldText: string;
		newText: string;
		oldMarks: SideMark[];
		newMarks: SideMark[];
		onInput: (side: SideId, text: string) => void;
		onFile: (side: SideId, file: File) => void;
		onCopy: (side: SideId) => void;
		onSwap: () => void;
		onHeight: (height: number) => void;
	};
}

export const ACCEPT =
	'text/*,.txt,.md,.json,.csv,.log,.xml,.yaml,.yml,.html,.css,.js,.ts,.tsx,.jsx';

const OpenIcon = <template><IconSvg @name="upload" /></template>;
const PasteIcon = <template><IconSvg @name="clipboard" /></template>;
const CopyIcon = <template><IconSvg @name="copy" /></template>;
const ClearIcon = <template><IconSvg @name="trash-2" /></template>;
const SwapIcon = <template><IconSvg @name="arrow-up-down" /></template>;

const headHeight = 50;

const reportHeight = modifier(
	(element: HTMLElement, [report]: [(height: number) => void]) => {
		const texts = [
			...element.querySelectorAll<HTMLElement>(
				'.td-side-text',
			),
		];
		const observer = new ResizeObserver(() =>
			report(
				texts.reduce(
					(sum, text) =>
						sum +
						headHeight +
						text.offsetHeight,
					0,
				),
			),
		);
		for (const text of texts) observer.observe(text);
		return () => observer.disconnect();
	},
);

const plain: SideMark = { lit: false, spans: [] };

function lines(text: string, marks: SideMark[]) {
	return text.split('\n').map((line, index) => {
		const mark = marks[index] ?? plain;
		return {
			lit: mark.lit,
			pieces: line
				? pieces(line, mark.spans)
				: [{ text: ' ', on: false }],
		};
	});
}

export default class Picture extends Component<PictureSignature> {
	get sides() {
		const { oldText, newText, oldMarks, newMarks } = this.args;
		return [
			{
				id: 'old' as SideId,
				label: 'Original',
				text: oldText,
				lines: lines(oldText, oldMarks),
			},
			{
				id: 'new' as SideId,
				label: 'Modified',
				text: newText,
				lines: lines(newText, newMarks),
			},
		];
	}

	paste = async (side: SideId) => {
		const text = await navigator.clipboard
			.readText()
			.catch(() => '');
		if (text && !this.isDestroying) this.args.onInput(side, text);
	};

	clear = (side: SideId) => this.args.onInput(side, '');

	chooseFile = (side: SideId, event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (file) this.args.onFile(side, file);
	};

	#pickers: Partial<Record<SideId, HTMLInputElement>> = {};

	keepPicker = modifier((input: HTMLInputElement, [side]: [SideId]) => {
		this.#pickers[side] = input;
	});

	openFile = (side: SideId) => this.#pickers[side]?.click();

	drop = (side: SideId, event: DragEvent) => {
		const file = event.dataTransfer?.files[0];
		if (!file) return;
		event.preventDefault();
		this.args.onFile(side, file);
	};

	<template>
		<div class="td-picture" {{reportHeight @onHeight}}>
			{{#each this.sides key="id" as |side|}}
				<section
					class="td-side td-side--{{side.id}}"
					aria-label={{side.label}}
					{{on "drop" (fn this.drop side.id)}}
				>
					<div class="td-side-head">
						<span
							class="td-side-label"
						>{{side.label}}</span>
						<span class="td-side-tools">
							<input
								type="file"
								class="dt-sr-only"
								accept={{ACCEPT}}
								tabindex="-1"
								aria-hidden="true"
								aria-label="Open file"
								{{this.keepPicker
									side.id
								}}
								{{on
									"change"
									(fn
										this.chooseFile
										side.id
									)
								}}
							/>
							{{#if (isNew side.id)}}
								<CanonButton
									class="td-swap"
									@kind="cell"
									@label="Swap"
									@icon={{SwapIcon}}
									@onClick={{@onSwap}}
								/>
							{{/if}}
							<CanonButton
								@kind="cell"
								@label="Open file"
								@icon={{OpenIcon}}
								@onClick={{fn
									this.openFile
									side.id
								}}
							/>
							<CanonButton
								@kind="cell"
								@label="Paste"
								@icon={{PasteIcon}}
								@onClick={{fn
									this.paste
									side.id
								}}
							/>
							<CanonButton
								@kind="cell"
								@label="Copy"
								@icon={{CopyIcon}}
								@disabled={{if
									side.text
									false
									true
								}}
								@onClick={{fn
									@onCopy
									side.id
								}}
							/>
							<CanonButton
								@kind="cell"
								@label="Clear"
								@icon={{ClearIcon}}
								@disabled={{if
									side.text
									false
									true
								}}
								@onClick={{fn
									this.clear
									side.id
								}}
							/>
						</span>
					</div>
					<div class="td-side-scroll">
						<MarkedEditor
							class="td-side-text"
							@text={{side.text}}
							@lines={{side.lines}}
							@placeholder="Type or paste"
							@label={{side.label}}
							@onInput={{fn
								@onInput
								side.id
							}}
						>
							<:line as |line|>
								{{~#each
									line.pieces
									key="@index"
									as |piece|
								~}}
									<span
										class={{if
											piece.on
											"td-word"
										}}
									>{{piece.text}}</span>
								{{~/each~}}
							</:line>
						</MarkedEditor>
					</div>
				</section>
			{{/each}}
		</div>
	</template>
}

function isNew(side: SideId) {
	return side === 'new';
}
