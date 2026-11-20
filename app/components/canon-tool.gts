import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import type { ComponentLike } from '@glint/template';
import type { TOC } from '@ember/component/template-only';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import { PeelSticker } from 'delphitools-v2/components/sticker-wall';
import type { Tool } from 'delphitools-v2/lib/tools';

const KEY = 'dt-canon-expanded';

const Chevron: TOC<{ Args: { points: 'start' | 'end' } }> = <template>
	<svg
		class="dt-canon-chevron is-{{@points}}"
		viewBox="0 0 12 40"
		aria-hidden="true"
	><path d="M10 2 L2 20 L10 38" /></svg>
</template>;

function stored(): Set<string> {
	try {
		const ids: unknown = JSON.parse(
			localStorage.getItem(KEY) ?? '[]',
		);
		return new Set(Array.isArray(ids) ? ids.map(String) : []);
	} catch {
		return new Set();
	}
}

const PICTURE =
	'.canon-split-banner, .canon-split--halves > .canon-split-body > .canon-split-sidebar > .canon-canvas:only-child';

function scrolls(el: Element, dy: number): boolean {
	if (!/auto|scroll/.test(getComputedStyle(el).overflowY)) return false;
	return dy > 0
		? el.scrollTop + el.clientHeight < el.scrollHeight - 1
		: el.scrollTop > 0;
}

const wheelToPage = modifier((slot: HTMLElement) => {
	const wheel = (event: WheelEvent) => {
		if (event.defaultPrevented || event.ctrlKey) return;
		if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
		const target = event.target as Element;
		const picture = target.closest(PICTURE);
		if (!picture || !slot.contains(picture)) return;
		const dy =
			event.deltaY *
			(event.deltaMode === 1
				? 16
				: event.deltaMode === 2
					? slot.clientHeight
					: 1);
		for (
			let el: Element | null = target;
			el;
			el = el.parentElement
		) {
			if (scrolls(el, dy)) return;
			if (el === picture) break;
		}
		const split = picture.closest('.canon-split');
		const page = [
			split?.querySelector(':scope > .canon-split-body'),
			split?.querySelector(
				':scope > .canon-split-body > .canon-split-main',
			),
		].find((el): el is Element => !!el && scrolls(el, dy));
		if (!page) return;
		event.preventDefault();
		page.scrollBy({ top: dy });
	};
	slot.addEventListener('wheel', wheel, { passive: false });
	return () => slot.removeEventListener('wheel', wheel);
});

interface CanonToolSignature {
	Args: { tool: Tool; component: ComponentLike<object> | undefined };
}

export default class CanonTool extends Component<CanonToolSignature> {
	@tracked expandedIds = stored();
	@tracked stickerSlot: HTMLElement | null = null;

	findStickerSlot = modifier(
		(tool: HTMLElement, [component]: [unknown]) => {
			queueMicrotask(() => {
				this.stickerSlot = component
					? tool.querySelector<HTMLElement>(
							'.canon-split > .canon-split-body > .canon-split-main > .canon-split-end',
						)
					: null;
			});
		},
	);

	get stickerId() {
		return this.args.tool.component ?? this.args.tool.id;
	}

	get expanded() {
		return this.expandedIds.has(this.args.tool.id);
	}

	toggle = () => {
		const ids = new Set(this.expandedIds);
		if (ids.has(this.args.tool.id)) ids.delete(this.args.tool.id);
		else ids.add(this.args.tool.id);
		this.expandedIds = ids;
		try {
			localStorage.setItem(KEY, JSON.stringify([...ids]));
		} catch {
			// private mode: the choice lasts this visit only
		}
	};

	<template>
		<div
			class="dt-canon-tool
				{{if @tool.expands 'is-expandable'}}
				{{if this.expanded 'is-expanded'}}"
			{{this.findStickerSlot @component}}
			{{wheelToPage}}
		>
			{{#if @component}}
				<@component />
			{{/if}}
			{{#if this.stickerSlot}}
				{{~#in-element
					this.stickerSlot insertBefore=null
				~}}
					<PeelSticker
						@tool={{this.stickerId}}
						@label={{@tool.name}}
					/>
				{{~/in-element~}}
			{{/if}}
			{{#if @tool.expands}}
				{{#if this.expanded}}
					<button
						type="button"
						class="dt-canon-edge is-start"
						aria-label="Full width"
						aria-pressed="true"
						{{on "click" this.toggle}}
					><Chevron @points="end" /></button>
				{{else}}
					<button
						type="button"
						class="dt-canon-edge is-start"
						aria-label="Full width"
						aria-pressed="false"
						{{on "click" this.toggle}}
					><Chevron @points="start" /></button>
					<button
						type="button"
						class="dt-canon-edge is-end"
						tabindex="-1"
						aria-hidden="true"
						{{on "click" this.toggle}}
					><Chevron @points="end" /></button>
				{{/if}}
			{{/if}}
		</div>
	</template>
}
