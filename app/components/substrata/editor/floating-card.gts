import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import type { TOC } from '@ember/component/template-only';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import { IconSvg } from 'delphitools-v2/components/icon';

const GAP = 8;

interface Signature {
	Args: {
		anchor: HTMLElement;
		at?: { x: number; y: number };
		width?: number;
		label: string;
		onClose: () => void;
	};
	Blocks: { default: [] };
}

export default class FloatingCard extends Component<Signature> {
	@tracked place = { x: 0, y: 0, width: 300, onRight: false };

	get host(): HTMLElement {
		return (
			this.args.anchor.closest<HTMLElement>('.sub-ed') ??
			document.body
		);
	}

	get style() {
		const { x, y, width, onRight } = this.place;
		return htmlSafe(
			`inset-inline-start: ${x}px; inset-block-start: ${y}px; inline-size: ${width}px; --sub-card-from: ${onRight ? 12 : -12}px`,
		);
	}

	position = modifier((card: HTMLElement) => {
		const root = this.host;
		const room = root.getBoundingClientRect();
		const anchor = this.args.anchor.getBoundingClientRect();
		const panel = (
			this.args.anchor.closest('.sub-rail-panel') ??
			this.args.anchor
		).getBoundingClientRect();
		const width = Math.min(
			this.args.width ?? 300,
			room.width - 2 * GAP,
		);
		const height = Math.min(
			card.offsetHeight,
			room.height - 2 * GAP,
		);
		const at = this.args.at;
		const onRight = at
			? at.x + width > room.right - GAP
			: panel.left + panel.width / 2 >
				room.left + room.width / 2;
		const from = at ? { left: at.x, right: at.x } : panel;
		const beside = onRight
			? from.left - GAP - width
			: from.right + GAP;
		const x = Math.min(
			Math.max(beside, room.left + GAP),
			room.right - GAP - width,
		);
		const y = Math.min(
			Math.max(at?.y ?? anchor.top, room.top + GAP),
			room.bottom - GAP - height,
		);
		this.place = {
			x: x - room.left,
			y: y - room.top,
			width,
			onRight,
		};
		card.focus();
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return;
			e.stopPropagation();
			this.args.onClose();
		};
		window.addEventListener('keydown', onKey, true);
		const refit = new ResizeObserver(() => {
			const limit =
				root.clientHeight - GAP - card.offsetHeight;
			if (this.place.y > limit)
				this.place = {
					...this.place,
					y: Math.max(GAP, limit),
				};
		});
		refit.observe(card);
		return () => {
			window.removeEventListener('keydown', onKey, true);
			refit.disconnect();
		};
	});

	<template>
		{{#in-element this.host insertBefore=null}}
			<div class="sub-card-layer">
				<button
					type="button"
					class="sub-card-scrim"
					aria-label="Close"
					tabindex="-1"
					{{on "click" @onClose}}
				></button>
				<div
					class="sub-card"
					role="dialog"
					aria-label={{@label}}
					tabindex="-1"
					style={{this.style}}
					{{this.position}}
				>{{yield}}</div>
			</div>
		{{/in-element}}
	</template>
}

export const MenuCard: TOC<{
	Args: {
		title: string;
		icon: string;
		disabled?: boolean;
		destructive?: boolean;
		onClick?: () => void;
	};
	Element: HTMLButtonElement;
}> = <template>
	<button
		type="button"
		class="sub-menu-card {{if @destructive 'is-destructive'}}"
		disabled={{@disabled}}
		{{on "click" (orNoop @onClick)}}
		...attributes
	>
		<span class="sub-menu-card-icon"><IconSvg
				@name={{@icon}}
			/></span>
		<span class="sub-menu-card-title">{{@title}}</span>
	</button>
</template>;

function orNoop(fn?: () => void) {
	return fn ?? (() => {});
}
