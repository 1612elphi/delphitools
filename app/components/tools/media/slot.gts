import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import { IconSvg } from 'delphitools-v2/components/icon';
import { clipboardImages } from 'delphitools-v2/lib/clipboard-images';
import { matchesAccept } from 'delphitools-v2/modifiers/file-paste';
import './slot.css';

const Folder = <template><IconSvg @name="folder-open" /></template>;
const Upload = <template><IconSvg @name="upload" /></template>;
const Paste = <template><IconSvg @name="clipboard-paste" /></template>;

const IMAGE_EXTENSION = /^\.(png|jpe?g|gif|webp|avif|bmp|svg|ico|tiff?)$/i;

export interface SlotSignature {
	Args: {
		prompt: string;
		icon: string;
		accept?: string;
		dashed?: boolean;
		fills?: boolean;
		row?: boolean;
		multiple?: boolean;
		over?: boolean;
		onFile?: (file: File) => void;
		onFiles?: (files: File[]) => void;
		onChoose?: () => void;
	};
	Element: HTMLElement;
}

export default class Slot extends Component<SlotSignature> {
	#input?: HTMLInputElement;
	#root?: HTMLElement;

	keep = modifier((input: HTMLInputElement) => {
		this.#input = input;
	});

	root = modifier((element: HTMLElement) => {
		this.#root = element;
	});

	choose = () =>
		this.args.onChoose
			? this.args.onChoose()
			: this.#input?.click();

	picked = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const files = [...(input.files ?? [])];
		input.value = '';
		if (!files.length) return;
		if (this.args.onFiles) this.args.onFiles(files);
		else this.args.onFile?.(files[0]!);
	};

	get ownInput() {
		return (
			!this.args.onChoose &&
			(this.args.onFile || this.args.onFiles)
		);
	}

	get pastes() {
		const { accept } = this.args;
		return (
			!accept ||
			accept.split(',').some((part) => {
				const p = part.trim();
				return (
					p.startsWith('image/') ||
					IMAGE_EXTENSION.test(p)
				);
			})
		);
	}

	paste = async () => {
		const { accept, onFile, onFiles } = this.args;
		const files = (await clipboardImages()).filter(
			(file) => !accept || matchesAccept(file, accept),
		);
		if (!files.length) return;
		if (onFiles) onFiles(files);
		else if (onFile) onFile(files[0]!);
		else this.#root?.dispatchEvent(pasteEvent(files));
	};

	<template>
		{{#if @row}}
			<div class="media-slot-bar" {{this.root}}>
				<button
					type="button"
					class="media-slot media-slot--row
						{{if @over 'media-slot--over'}}"
					tabindex="-1"
					{{on "click" this.choose}}
					...attributes
				>
					<span class="media-slot-icon"><IconSvg
							@name={{@icon}}
						/></span>
					<span
						class="media-slot-prompt"
					>{{@prompt}}</span>
				</button>
				<CanonButton
					class="media-slot-files"
					@kind="cell"
					@text="Files"
					@icon={{Folder}}
					@onClick={{this.choose}}
				/>
				{{#if this.pastes}}
					<CanonButton
						class="media-slot-paste"
						@kind="cell"
						@text="Paste"
						@icon={{Paste}}
						@onClick={{this.paste}}
					/>
				{{/if}}
			</div>
		{{else}}
			<div
				class="media-slot
					{{if @dashed 'media-slot--dashed'}}
					{{if @fills 'media-slot--fills'}}
					{{if @over 'media-slot--over'}}"
				{{this.root}}
				...attributes
			>
				<button
					type="button"
					class="media-slot-target"
					tabindex="-1"
					aria-hidden="true"
					{{on "click" this.choose}}
				></button>
				<span class="media-slot-icon"><IconSvg
						@name={{@icon}}
					/></span>
				<span
					class="media-slot-prompt"
				>{{@prompt}}</span>
				<span class="media-slot-actions">
					<CanonButton
						class="media-slot-upload"
						@kind="cell"
						@text="Upload"
						@icon={{Upload}}
						@onClick={{this.choose}}
					/>
					{{#if this.pastes}}
						<CanonButton
							class="media-slot-paste"
							@kind="cell"
							@text="Paste"
							@icon={{Paste}}
							@onClick={{this.paste}}
						/>
					{{/if}}
				</span>
			</div>
		{{/if}}
		{{#if this.ownInput}}
			{{! template-lint-disable require-input-label }}
			<input
				type="file"
				accept={{@accept}}
				multiple={{@multiple}}
				hidden
				{{this.keep}}
				{{on "change" this.picked}}
			/>
		{{/if}}
	</template>
}

function pasteEvent(files: File[]): ClipboardEvent {
	const data = new DataTransfer();
	for (const file of files) data.items.add(file);
	return new ClipboardEvent('paste', {
		clipboardData: data,
		bubbles: true,
		cancelable: true,
	});
}
