import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { hash } from '@ember/helper';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import type { ModifierLike, WithBoundArgs } from '@glint/template';
import type { TOC } from '@ember/component/template-only';

/**
 * Modal dialog over the native <dialog> element.
 *
 * Written locally rather than vendored from shadcn-ember, which is the source
 * for the other primitives here. Its dialog is 421 lines that rebuild the modal
 * behaviour by hand — `role="dialog"`, `aria-modal`, a portal, its own Escape
 * handler. `showModal()` gets focus trapping, Escape, the top layer and
 * ::backdrop from the browser, so the wrapper only has to own open/close state
 * and returning focus to the trigger.
 *
 *   <Dialog as |d|>
 *     <button {{d.focusOnClose}} {{on "click" d.open}}>About</button>
 *     <d.Content class="dt-dialog">…<button {{on "click" d.close}}>×</button></d.Content>
 *   </Dialog>
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

const Content: TOC<ContentSignature> = <template>
	{{! the browser only reveals this once showModal() is called }}
	<dialog {{@register}} {{on "close" @onClose}} ...attributes>
		{{yield}}
	</dialog>
</template>;

export interface DialogSignature {
	Args: {
		/** Called with the dialog's returnValue when it closes. */
		onClose?: (returnValue: string) => void;
	};
	Blocks: {
		default: [
			{
				isOpen: boolean;
				open: () => void;
				close: () => void;
				/** Put on the trigger so focus returns to it on close. */
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

	// Fires for every close path, including Escape and a form[method=dialog],
	// so the state and the refocus live here rather than in `close`.
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
