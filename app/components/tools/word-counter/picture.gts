import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonFigure from 'delphicanon/components/canon-figure';
import { IconSvg } from 'delphitools-v2/components/icon';
import { TEXT_ACCEPT } from 'delphitools-v2/lib/tools';

interface PictureSignature {
	Args: {
		text: string;
		words: number;
		onInput: (text: string) => void;
		onHeight: (height: number) => void;
	};
}

const PasteIcon = <template><IconSvg @name="clipboard" /></template>;
const FilesIcon = <template><IconSvg @name="folder" /></template>;
const ClearIcon = <template><IconSvg @name="trash-2" /></template>;

const accept = TEXT_ACCEPT.join(',');

const headHeight = 50;

const reportHeight = modifier(
	(element: HTMLElement, [report]: [(height: number) => void]) => {
		const observer = new ResizeObserver(() =>
			report(headHeight + element.offsetHeight),
		);
		observer.observe(element);
		return () => observer.disconnect();
	},
);

export default class Picture extends Component<PictureSignature> {
	#file?: HTMLInputElement;

	get wordsText() {
		return this.args.words.toLocaleString();
	}

	get mirror() {
		return `${this.args.text} `;
	}

	input = (event: Event) =>
		this.args.onInput((event.target as HTMLTextAreaElement).value);

	paste = async () => {
		const text = await navigator.clipboard
			.readText()
			.catch(() => '');
		if (text) this.args.onInput(text);
	};

	clear = () => this.args.onInput('');

	read = async (file: File | undefined) => {
		if (file) this.args.onInput(await file.text());
	};

	fileField = modifier((element: HTMLInputElement) => {
		this.#file = element;
	});

	openFiles = () => this.#file?.click();

	pick = (event: Event) => {
		const field = event.target as HTMLInputElement;
		void this.read(field.files?.[0]);
		field.value = '';
	};

	drop = (event: DragEvent) => {
		const file = event.dataTransfer?.files[0];
		if (!file) return;
		event.preventDefault();
		void this.read(file);
	};

	over = (event: DragEvent) => {
		if (event.dataTransfer?.types.includes('Files'))
			event.preventDefault();
	};

	<template>
		<div
			class="wc-picture"
			{{on "dragover" this.over}}
			{{on "drop" this.drop}}
		>
			<div class="wc-picture-head">
				<CanonFigure
					@text={{this.wordsText}}
					@unit="words"
					@size={{26}}
					@colour={{if
						@words
						"var(--canon-primary)"
						"var(--canon-muted-foreground)"
					}}
				/>
				<span class="wc-picture-tools">
					<CanonButton
						@kind="cell"
						@label="Paste"
						@icon={{PasteIcon}}
						@onClick={{this.paste}}
					/>
					<CanonButton
						@kind="cell"
						@label="Files"
						@icon={{FilesIcon}}
						@onClick={{this.openFiles}}
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
				<input
					type="file"
					class="wc-file"
					accept={{accept}}
					hidden
					aria-label="Files"
					{{on "change" this.pick}}
					{{this.fileField}}
				/>
			</div>
			<div class="wc-picture-scroll">
				<div
					class="wc-picture-text"
					{{reportHeight @onHeight}}
				>
					<div
						class="wc-mirror"
						aria-hidden="true"
					>{{this.mirror}}</div>
					<textarea
						class="wc-editor"
						rows="1"
						placeholder="Paste or type text here…"
						aria-label="Text"
						value={{@text}}
						{{on "input" this.input}}
					></textarea>
				</div>
			</div>
		</div>
	</template>
}
