import Component from '@glimmer/component';
import { modifier } from 'ember-modifier';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSheet from 'delphicanon/components/canon-sheet';
import { attach, type CanonPlacement } from 'delphicanon/lib/popover';
import './pages.css';

interface Signature {
	Args: {
		open: boolean;
		phone: boolean;
		label: string;
		anchor: () => HTMLElement | null;
		placement?: CanonPlacement;
		onClose: () => void;
	};
	Blocks: { default: [] };
}

export default class FormPopover extends Component<Signature> {
	place = modifier((panel: HTMLElement) => {
		const anchor = this.args.anchor();
		const detach = anchor
			? attach(panel, anchor, {
					placement:
						this.args.placement ??
						'left-start',
				})
			: undefined;
		panel.classList.toggle('is-centred', !anchor);
		panel.showPopover();
		const first =
			panel.querySelector<HTMLElement>('[data-autofocus]') ??
			panel;
		first.focus({ preventScroll: true });
		if (first instanceof HTMLInputElement) first.select();
		const down = (e: PointerEvent) => {
			const target = e.target as Node;
			if (panel.contains(target) || anchor?.contains(target))
				return;
			this.args.onClose();
		};
		const key = (e: KeyboardEvent) => {
			if (
				e.key !== 'Escape' ||
				panel.querySelector(':popover-open')
			)
				return;
			e.stopPropagation();
			this.args.onClose();
		};
		document.addEventListener('pointerdown', down, true);
		window.addEventListener('keydown', key, true);
		return () => {
			document.removeEventListener('pointerdown', down, true);
			window.removeEventListener('keydown', key, true);
			const hadFocus = panel.contains(document.activeElement);
			detach?.();
			if (hadFocus) anchor?.focus({ preventScroll: true });
		};
	});

	<template>
		{{#if @phone}}
			<CanonSheet
				class="sub-pg-sheet"
				@open={{@open}}
				@onClose={{@onClose}}
				aria-label={{@label}}
			>{{yield}}</CanonSheet>
		{{else if @open}}
			<div
				popover="manual"
				class="canon-popover sub-pg-pop"
				role="dialog"
				aria-label={{@label}}
				tabindex="-1"
				{{this.place}}
			>
				<CanonRows
					@framed={{true}}
				>{{yield}}</CanonRows>
			</div>
		{{/if}}
	</template>
}
