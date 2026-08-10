import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import { eq } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import CanvasSizeModal from 'delphitools-v2/components/substrata/modals/canvas-size-modal';
import OnboardingModal from 'delphitools-v2/components/substrata/modals/onboarding-modal';
import {
	closeModal,
	getOpenModal,
	subscribeModal,
	type ModalId,
} from 'delphitools-v2/lib/substrata/modal';
import { ensureScene } from 'delphitools-v2/lib/substrata/file-ops';
import { finishOnboarding } from 'delphitools-v2/lib/substrata/onboarding-pref';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

/**
 * Host for the editor's blocking modals, on the native `<dialog>` element —
 * showModal() supplies the top layer, focus trap and Esc-to-close (the same
 * trade the local ui/dialog primitive makes). Reads the modal store and shows
 * the active dialog; each modal body owns its width and layout.
 *
 * Pass-1 boundary: only Canvas size · New scene · Onboarding are ported.
 * Export, Shortcuts and the two About panes are pass 2 — their ids stay
 * closed here, so ⌘E currently does nothing visible.
 */
const PASS1_MODALS: ReadonlySet<ModalId> = new Set<ModalId>([
	'canvas-size',
	'new-scene',
	'onboarding',
]);

export default class ModalHost extends Component {
	open = new TrackedExternal(subscribeModal, getOpenModal);

	// distinguishes store-driven close() from user dismissal (Esc): only the
	// latter runs the fallback paths in onClose
	#closingProgrammatically = false;

	willDestroy() {
		super.willDestroy();
		this.open.unsubscribe();
	}

	get openId(): ModalId | null {
		const id = this.open.current;
		return id !== null && PASS1_MODALS.has(id) ? id : null;
	}

	sync = modifier(
		(dialog: HTMLDialogElement, [openId]: [ModalId | null]) => {
			if (openId !== null && !dialog.open) {
				dialog.showModal();
			} else if (openId === null && dialog.open) {
				this.#closingProgrammatically = true;
				dialog.close();
				this.#closingProgrammatically = false;
			}
		},
	);

	onClose = () => {
		if (this.#closingProgrammatically) return;
		const open = this.open.current;
		// Esc-close of the onboarding still counts as "seen" and hands over
		// to the New-scene dialog — same path as its final button
		if (open === 'onboarding') {
			finishOnboarding();
			return;
		}
		closeModal();
		// fresh boots are doc-less until the New-scene dialog lands one —
		// Esc-dismiss falls back to a default blank scene
		if (open === 'new-scene') ensureScene();
	};

	// the X on Canvas size / New scene (Radix's default showCloseButton; the
	// onboarding opts out, as the source does)
	get showClose() {
		return (
			this.openId === 'canvas-size' ||
			this.openId === 'new-scene'
		);
	}

	// both routes go through dialog.close() so the `close` handler above runs
	// the same seen-marking / ensureScene fallbacks as Esc
	dismiss = (event: Event) => {
		(event.currentTarget as HTMLElement).closest('dialog')?.close();
	};

	// a click on ::backdrop targets the dialog element itself; clicks in the
	// content target its children. A custom modifier because template-lint's
	// no-invalid-interactive rejects {{on "click"}} on <dialog>.
	backdropDismiss = modifier((dialog: HTMLDialogElement) => {
		const onClick = (event: MouseEvent) => {
			if (event.target === dialog) dialog.close();
		};
		dialog.addEventListener('click', onClick);
		return () => dialog.removeEventListener('click', onClick);
	});

	<template>
		<dialog
			class="sub-modal"
			{{this.sync this.openId}}
			{{on "close" this.onClose}}
			{{this.backdropDismiss}}
		>
			{{#if this.showClose}}
				<button
					type="button"
					class="sub-modal-x"
					aria-label="Close"
					{{on "click" this.dismiss}}
				>
					<Icon @name="x" />
				</button>
			{{/if}}
			{{#if (eq this.openId "canvas-size")}}
				<CanvasSizeModal />
			{{else if (eq this.openId "new-scene")}}
				<CanvasSizeModal @mode="new" />
			{{else if (eq this.openId "onboarding")}}
				<OnboardingModal />
			{{/if}}
		</dialog>
	</template>
}
