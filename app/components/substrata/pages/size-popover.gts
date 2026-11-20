import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { guidFor } from '@ember/object/internals';
import { modifier } from 'ember-modifier';
import CanonEmptyRow from 'delphicanon/components/canon-empty-row';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonTextCell from 'delphicanon/components/canon-text-cell';
import { ChevronsUpDown } from 'delphicanon/lib/control-icons';
import { attach, hide, isOpen, panelFor } from 'delphicanon/lib/popover';
import 'delphicanon/components/canon-menu-cell.css';
import 'delphicanon/components/canon-popover.css';
import Cell from 'delphitools-v2/components/tools/paper-sizes/cell';
import 'delphitools-v2/components/tools/paper-sizes/popover.css';
import {
	findSizes,
	sizeFor,
	sizeTitle,
	type CanvasSize,
} from 'delphitools-v2/lib/substrata/canvas-sizes';

interface Signature {
	Args: {
		width: number;
		height: number;
		picked?: string;
		onPick: (size: CanvasSize) => void;
	};
	Element: HTMLButtonElement;
}

const findPlaceholder = 'Story · 1080x1920';

export default class SizePopover extends Component<Signature> {
	id = `${guidFor(this)}-size`;
	@tracked text = '';
	@tracked open = false;
	#panel?: HTMLElement;

	get selected() {
		return sizeFor(
			this.args.width,
			this.args.height,
			this.args.picked,
		);
	}

	get title() {
		const { selected } = this;
		return selected ? sizeTitle(selected) : 'Custom';
	}

	@cached
	get series() {
		const picked = this.selected?.id;
		return findSizes(this.text).map((s) => ({
			...s,
			cells: s.sizes.map((size) => ({
				size,
				glyph: {
					name: size.name,
					widthMM: size.width,
					heightMM: size.height,
				},
				text: `${size.width} × ${size.height}`,
				mark: size.id === picked ? 1 : undefined,
			})),
		}));
	}

	find = (text: string) => (this.text = text);

	pick = (size: CanvasSize) => {
		this.args.onPick(size);
		if (this.#panel) hide(this.#panel);
	};

	trigger = modifier((button: HTMLButtonElement) => {
		const panel = panelFor(button, this.id);
		this.#panel = panel;
		const detach = attach(panel, button, {
			placement: 'bottom-start',
			invokes: true,
			haspopup: 'dialog',
		});
		const opening = (event: ToggleEvent) => {
			this.open = event.newState === 'open';
			if (this.open) this.text = '';
		};
		const opened = () => {
			if (!isOpen(panel)) return;
			panel.querySelector<HTMLInputElement>(
				'.paper-find',
			)?.focus({ preventScroll: true });
		};
		panel.addEventListener('beforetoggle', opening);
		panel.addEventListener('toggle', opened);
		return () => {
			panel.removeEventListener('beforetoggle', opening);
			panel.removeEventListener('toggle', opened);
			detach();
		};
	});

	<template>
		<button
			type="button"
			class="canon-menu-cell paper-popover-trigger"
			aria-label="Size, {{this.title}}"
			{{this.trigger}}
			...attributes
		>
			<span
				class="canon-menu-cell-title"
			>{{this.title}}</span>
			<span
				class="canon-menu-cell-icon"
				aria-hidden="true"
			><ChevronsUpDown /></span>
		</button>
		<div
			id={{this.id}}
			class="canon-popover paper-popover"
			popover="auto"
			role="dialog"
			aria-label="Size"
		>
			<CanonRows @framed={{true}}>
				<CanonHeading @text="Size" />
				<CanonTextCell
					class="paper-find"
					aria-label="Find"
					autocomplete="off"
					autocapitalize="none"
					spellcheck="false"
					@value={{this.text}}
					@placeholder={{findPlaceholder}}
					@onChange={{this.find}}
				/>
			</CanonRows>
			{{#if this.open}}
				<CanonRows
					class="paper-popover-list"
					@framed={{true}}
				>
					{{#each
						this.series key="id"
						as |series|
					}}
						<CanonHeading
							@text={{series.name}}
						/>
						<CanonGrid @columns={{3}}>
							{{#each
								series.cells
								key="size.id"
								as |cell|
							}}
								<Cell
									@size={{cell.glyph}}
									@text={{cell.text}}
									@mark={{cell.mark}}
									@tick={{true}}
									@onPick={{fn
										this.pick
										cell.size
									}}
								/>
							{{/each}}
						</CanonGrid>
					{{else}}
						<CanonEmptyRow
							@text="No match"
						/>
					{{/each}}
				</CanonRows>
			{{/if}}
		</div>
	</template>
}
