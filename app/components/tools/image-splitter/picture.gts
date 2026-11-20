import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import {
	CanonMenuList,
	showMenu,
	type CanonMenuEntry,
	type CanonMenuItem,
} from 'delphicanon/components/canon-menu';
import { attach } from 'delphicanon/lib/popover';
import Slot from 'delphitools-v2/components/tools/media/slot';
import {
	cellRect,
	cells,
	frames,
	seamFor,
	tileSize,
	tuning,
	type Cell,
	type Size,
} from 'delphitools-v2/components/tools/image-splitter/split';

export interface PictureSignature {
	Args: {
		url?: string;
		pixels: Size;
		rows: number;
		cols: number;
		joined: boolean;
		springs: boolean;
		over: boolean;
		menu: CanonMenuEntry[];
		onChoose: () => void;
		onPick: (cell: Cell, item: CanonMenuItem) => void;
	};
}

const px = (value: number) => `${Math.round(value * 100) / 100}px`;
const percent = (value: number) => `${Math.round(value * 10000) / 100}%`;

export default class Picture extends Component<PictureSignature> {
	@tracked area: Size = { width: 0, height: 0 };
	#chosen?: Cell;
	#tile?: HTMLElement;
	#point?: HTMLElement;
	#panel?: HTMLElement;

	get tiles() {
		const { pixels, rows, cols, joined } = this.args;
		const tile = tileSize(pixels, rows, cols);
		const seam = joined ? 0 : seamFor(this.area, rows, cols);
		const boxes = frames(
			rows,
			cols,
			{
				width: Math.max(1, tile.width),
				height: Math.max(1, tile.height),
			},
			seam,
			this.area,
		);
		return cells(rows, cols).map((cell, i) => {
			const box = boxes[i]!;
			const crop = cellRect(cell, pixels, rows, cols);
			const width = Math.max(1, crop.width);
			const height = Math.max(1, crop.height);
			return {
				cell,
				key: cell.label,
				labelled:
					box.width >= tuning.labelWidth &&
					box.height >= tuning.labelHeight,
				style: htmlSafe(
					`left: ${px(box.x)}; top: ${px(box.y)}; width: ${px(box.width)}; height: ${px(box.height)}`,
				),
				image: htmlSafe(
					`left: ${percent(-crop.x / width)}; top: ${percent(-crop.y / height)}; width: ${percent(pixels.width / width)}; height: ${percent(pixels.height / height)}`,
				),
			};
		});
	}

	measure = modifier((element: HTMLElement) => {
		const observer = new ResizeObserver(() => {
			this.area = {
				width: element.clientWidth,
				height: element.clientHeight,
			};
		});
		observer.observe(element);
		return () => observer.disconnect();
	});

	menu = modifier((panel: HTMLElement) => {
		this.#panel = panel;
		this.#point = panel.previousElementSibling as HTMLElement;
		return attach(panel, this.#point, {
			placement: 'bottom-start',
			gap: '0px',
			returnFocus: () => this.#tile,
		});
	});

	open = (cell: Cell, event: MouseEvent) => {
		const tile = event.currentTarget as HTMLElement;
		const point = this.#point;
		const panel = this.#panel;
		if (!point || !panel) return;
		this.#chosen = cell;
		this.#tile = tile;
		const frame = point.offsetParent!.getBoundingClientRect();
		const box = tile.getBoundingClientRect();
		const pointer = event.detail > 0;
		const x = pointer
			? event.clientX
			: tile.matches(':dir(rtl)')
				? box.right
				: box.left;
		const y = pointer ? event.clientY : box.bottom;
		point.style.left = px(x - frame.left);
		point.style.top = px(y - frame.top);
		showMenu(panel, 'first');
	};

	pick = (item: CanonMenuItem) => {
		if (this.#chosen) this.args.onPick(this.#chosen, item);
	};

	<template>
		<div
			class="split-picture
				{{if @springs 'split-picture--springs'}}"
		>
			<div class="split-area" {{this.measure}}>
				{{#if @url}}
					{{#each this.tiles key="key" as |tile|}}
						<button
							type="button"
							class="split-tile"
							style={{tile.style}}
							aria-label={{tile.cell.label}}
							aria-haspopup="menu"
							{{on
								"click"
								(fn
									this.open
									tile.cell
								)
							}}
						>
							<img
								src={{@url}}
								alt=""
								draggable="false"
								style={{tile.image}}
							/>
							{{#if tile.labelled}}
								<span
									class="split-tile-label"
									aria-hidden="true"
								>{{tile.cell.label}}</span>
							{{/if}}
						</button>
					{{/each}}
				{{else}}
					<Slot
						class="split-slot"
						@prompt="Drop an image here"
						@icon="image"
						@dashed={{true}}
						@fills={{true}}
						@over={{@over}}
						@onChoose={{@onChoose}}
					/>
				{{/if}}
			</div>
			<span class="split-point" aria-hidden="true"></span>
			<CanonMenuList
				@items={{@menu}}
				@onSelect={{this.pick}}
				{{this.menu}}
			/>
		</div>
	</template>
}
