import Component from '@glimmer/component';
import { cached } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonStatus from 'delphicanon/components/canon-status';
import { IconSvg } from 'delphitools-v2/components/icon';
import MarkedEditor, {
	reportHeight,
} from 'delphitools-v2/components/tools/media/marked-editor';
import {
	tokenRuns,
	type Run,
} from 'delphitools-v2/components/tools/json-formatter/shape';

interface EditorSignature {
	Args: {
		text: string;
		fileName: string | null;
		errorLine?: number;
		onInput: (text: string) => void;
		onFile: (file: File) => void;
		onHeight: (height: number) => void;
	};
}

const OpenIcon = <template><IconSvg @name="upload" /></template>;
const PasteIcon = <template><IconSvg @name="clipboard" /></template>;
const ClearIcon = <template><IconSvg @name="trash-2" /></template>;

// ponytail: plain lines past this; colouring a multi-megabyte paste per keystroke stalls typing
const colourLimit = 20_000;

interface Line {
	runs: Run[];
	lit: boolean;
}

export default class Editor extends Component<EditorSignature> {
	@cached
	get lines(): Line[] {
		const { text, errorLine } = this.args;
		const colours = text.length <= colourLimit;
		return text.split('\n').map((line, index) => ({
			runs: line
				? colours
					? tokenRuns(line)
					: [{ text: line, kind: null }]
				: [{ text: ' ', kind: null }],
			lit: errorLine === index + 1,
		}));
	}

	paste = async () => {
		const text = await navigator.clipboard
			.readText()
			.catch(() => '');
		if (text && !this.isDestroying) this.args.onInput(text);
	};

	clear = () => this.args.onInput('');

	chooseFile = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (file) this.args.onFile(file);
	};

	#picker?: HTMLInputElement;

	keepPicker = modifier((input: HTMLInputElement) => {
		this.#picker = input;
	});

	openFile = () => this.#picker?.click();

	<template>
		<div class="jf-editor">
			<div class="jf-editor-head">
				{{#if @errorLine}}
					<CanonStatus
						@text="Invalid"
						@tone="warn"
					/>
				{{else if @fileName}}
					<span
						class="jf-editor-file"
					>{{@fileName}}</span>
				{{/if}}
				<span class="jf-editor-tools">
					<input
						type="file"
						class="dt-sr-only"
						accept=".json,application/json,text/plain"
						tabindex="-1"
						aria-hidden="true"
						aria-label="Open file"
						{{this.keepPicker}}
						{{on "change" this.chooseFile}}
					/>
					<CanonButton
						@kind="cell"
						@label="Open file"
						@icon={{OpenIcon}}
						@onClick={{this.openFile}}
					/>
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
			<div class="jf-editor-scroll">
				<MarkedEditor
					class="jf-editor-text"
					@text={{@text}}
					@lines={{this.lines}}
					@placeholder="Paste JSON"
					@label="Source"
					@onInput={{@onInput}}
					{{reportHeight @onHeight}}
				>
					<:line as |line|>
						{{~#each line.runs as |run|~}}
							<span
								class="jf-t--{{run.kind}}"
							>{{run.text}}</span>
						{{~/each~}}
					</:line>
				</MarkedEditor>
			</div>
		</div>
	</template>
}
