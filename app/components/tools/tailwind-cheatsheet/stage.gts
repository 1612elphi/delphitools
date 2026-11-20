import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import { reducedMotion } from 'delphicanon/lib/motion';
import type { CheatSheetCategory, CheatSheetItem } from './data';
import {
	DESIGN,
	motionFrames,
	motionMarkup,
	motionOf,
	specimen,
} from './specimen';

interface StageSignature {
	Args: {
		item: CheatSheetItem;
		category: CheatSheetCategory;
		onJump: () => void;
	};
}

const ratio = DESIGN.width / DESIGN.height;
const SIBLING_GAP = 4;

export function svg(body: string, extra = '') {
	return `<svg class="tw-specimen" viewBox="0 0 ${DESIGN.width} ${DESIGN.height}" aria-hidden="true" focusable="false"${extra}>${body}</svg>`;
}

export function siblingCells(count: number, width: number, height: number) {
	for (let rows = 1; rows <= Math.max(1, count); rows++) {
		const columns = Math.ceil(count / rows);
		const cellHeight = (height - SIBLING_GAP * (rows - 1)) / rows;
		const cellWidth = cellHeight * ratio;
		if (columns * (cellWidth + SIBLING_GAP) - SIBLING_GAP <= width)
			return {
				columns,
				width: cellWidth,
				height: cellHeight,
			};
	}
	return { columns: count, width: 1, height: 1 };
}

export default class Stage extends Component<StageSignature> {
	@tracked cells = { columns: 1, width: 0, height: 0 };

	get moves() {
		return !reducedMotion();
	}

	get motion() {
		return this.moves
			? motionOf(
					this.args.item.class,
					this.args.category.name,
				)
			: undefined;
	}

	get picture() {
		const { item, category } = this.args;
		const motion = this.motion;
		return htmlSafe(
			svg(
				specimen(item, category.name, this.moves) +
					(motion ? motionMarkup(motion) : ''),
			),
		);
	}

	get example() {
		return (
			this.args.item.example &&
			`e.g. ${this.args.item.example}`
		);
	}

	get nameStyle() {
		return htmlSafe(`--tw-chars: ${this.args.item.class.length}`);
	}

	@cached
	get siblings() {
		const { item, category } = this.args;
		if (category.items.length < 2) return [];
		return category.items.map((entry) => ({
			key: entry.class,
			lit: entry === item,
			picture: htmlSafe(svg(specimen(entry, category.name))),
		}));
	}

	get siblingsStyle() {
		const { columns, width, height } = this.cells;
		return htmlSafe(
			`grid-template-columns: repeat(${columns}, ${width}px); grid-auto-rows: ${height}px; gap: ${SIBLING_GAP}px`,
		);
	}

	measure = modifier((box: HTMLElement, [count]: [number]) => {
		const observer = new ResizeObserver(([entry]) => {
			const size = entry?.contentRect;
			if (!size || size.width === 0) return;
			const next = siblingCells(
				count,
				size.width,
				size.height,
			);
			const { columns, width, height } = this.cells;
			if (
				next.columns !== columns ||
				Math.abs(next.width - width) > 0.5 ||
				Math.abs(next.height - height) > 0.5
			)
				this.cells = next;
		});
		observer.observe(box);
		return () => observer.disconnect();
	});

	animate = modifier((stage: HTMLElement, [name]: [string]) => {
		void name;
		if (!this.moves) return;
		stage.animate([{ opacity: 0.25 }, { opacity: 1 }], {
			duration: 220,
			easing: 'ease-out',
		});
		const motion = this.motion;
		if (!motion) return;
		const running = [
			...stage.querySelectorAll<SVGElement>('[data-tw-move]'),
		].flatMap((element) => {
			const frames = motionFrames(
				motion,
				element.dataset['twMove'] ?? '',
			);
			return frames
				? [
						element.animate(
							frames.keyframes,
							frames.options,
						),
					]
				: [];
		});
		return () => running.forEach((animation) => animation.cancel());
	});

	<template>
		<div class="tw-stage" {{this.animate @item.class}}>
			<button
				type="button"
				class="tw-stage-jump"
				aria-label={{@category.name}}
				{{on "click" @onJump}}
			></button>
			<div class="tw-stage-specimen">{{this.picture}}</div>
			<div class="tw-stage-text">
				<p
					class="tw-stage-caption"
				>{{@category.name}}</p>
				<p
					class="tw-stage-name"
					style={{this.nameStyle}}
				>{{@item.class}}</p>
				<p class="tw-stage-css">{{@item.css}}</p>
				{{#if this.example}}
					<p
						class="tw-stage-example"
					>{{this.example}}</p>
				{{/if}}
			</div>
			{{#if this.siblings.length}}
				<div
					class="tw-stage-siblings"
					aria-hidden="true"
					{{this.measure this.siblings.length}}
				>
					<div
						class="tw-stage-sibling-grid"
						style={{this.siblingsStyle}}
					>
						{{#each
							this.siblings key="key"
							as |sibling|
						}}
							<div
								class="tw-stage-sibling
									{{if
										sibling.lit
										'tw-stage-sibling--lit'
									}}"
							>{{sibling.picture}}</div>
						{{/each}}
					</div>
				</div>
			{{/if}}
		</div>
	</template>
}
