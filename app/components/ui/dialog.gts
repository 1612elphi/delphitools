import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { hash } from '@ember/helper';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import type { ModifierLike, WithBoundArgs } from '@glint/template';

/**
 * local not vendored: showModal() gives focus trap, escape, top layer
 */

interface ContentSignature {
	Element: HTMLDialogElement;
	Args: {
		/** @internal */ register: ModifierLike<{
			Element: HTMLDialogElement;
		}>;
		/** @internal */ onClose: () => void;
	};
	Blocks: { default: [] };
}

// native <dialog> never closes on ::backdrop clicks; those surface as clicks on
// the dialog element itself. no rect check: a click-release outside after a
// press inside counts as a backdrop click, matching native conventions.
class Content extends Component<ContentSignature> {
	closeOnBackdrop = (event: MouseEvent) => {
		if (event.target === event.currentTarget) {
			(event.currentTarget as HTMLDialogElement).close();
		}
	};

	<template>
		{{! hidden until showModal() }}
		<dialog
			{{@register}}
			{{on "click" this.closeOnBackdrop}}
			{{on "close" @onClose}}
			...attributes
		>
			{{yield}}
		</dialog>
	</template>;
}

export interface DialogSignature {
	Args: {
		onClose?: (returnValue: string) => void;
	};
	Blocks: {
		default: [
			{
				isOpen: boolean;
				open: () => void;
				close: () => void;
				focusOnClose: ModifierLike<{
					Element: HTMLElement;
				}>;
				Content: WithBoundArgs<
					typeof Content,
					'register' | 'onClose'
				>;
			},
		];
	};
}

export default class Dialog extends Component<DialogSignature> {
	@tracked isOpen = false;

	#element?: HTMLDialogElement;
	#trigger?: HTMLElement;

	register = modifier((element: HTMLDialogElement) => {
		this.#element = element;
		return () => {
			this.#element = undefined;
		};
	});

	focusOnClose = modifier((element: HTMLElement) => {
		this.#trigger = element;
		return () => {
			this.#trigger = undefined;
		};
	});

	open = () => {
		this.#element?.showModal();
		this.isOpen = true;
	};

	close = () => {
		this.#element?.close();
	};

	// fires for escape, form[method=dialog], and .close()
	handleClose = () => {
		this.isOpen = false;
		this.#trigger?.focus();
		this.args.onClose?.(this.#element?.returnValue ?? '');
	};

	<template>
		{{yield
			(hash
				isOpen=this.isOpen
				open=this.open
				close=this.close
				focusOnClose=this.focusOnClose
				Content=(component
					Content
					register=this.register
					onClose=this.handleClose
				)
			)
		}}
	</template>
}
