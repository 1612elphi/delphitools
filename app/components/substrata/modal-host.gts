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

const PASS1_MODALS: ReadonlySet<ModalId> = new Set<ModalId>([
	'canvas-size',
	'new-scene',
	'onboarding',
]);

export default class ModalHost extends Component {
	open = new TrackedExternal(subscribeModal, getOpenModal);

	// track dialog close source
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
		// esc completes onboarding
		if (open === 'onboarding') {
			finishOnboarding();
			return;
		}
		closeModal();
		// esc creates default scene
		if (open === 'new-scene') ensureScene();
	};

	get showClose() {
		return (
			this.openId === 'canvas-size' ||
			this.openId === 'new-scene'
		);
	}

	dismiss = (event: Event) => {
		(event.currentTarget as HTMLElement).closest('dialog')?.close();
	};

	// dialog click requires modifier
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
