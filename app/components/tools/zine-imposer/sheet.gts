import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import CanonFigure from 'delphicanon/components/canon-figure';
import { IconSvg } from 'delphitools-v2/components/icon';
import type { ZineFoldLayout, ZineSide } from 'delphitools-v2/lib/zine-folds';
import type { ZineImage } from './images';

const pct = (share: number) => `${Math.round(share * 10000) / 100}%`;

const DASHES = { valley: '6 4', mountain: '8 3 1.5 3' };

interface FaceSignature {
	Args: {
		layout: ZineFoldLayout;
		side: ZineSide;
		images: (ZineImage | null)[];
		aspect: number;
		lit?: number;
		dropAt?: number;
		onDragOver: (side: ZineSide, event: DragEvent) => void;
		onDrop: (side: ZineSide, event: DragEvent) => void;
	};
}

class Face extends Component<FaceSignature> {
	get back() {
		return this.args.side.side === 'back';
	}

	get cells() {
		const { layout, side, images, lit, dropAt } = this.args;
		const numbered = images.some(Boolean);
		return side.placements.map((spot) => {
			const image = images[spot.page - 1] ?? null;
			return {
				key: `${spot.col}-${spot.row}`,
				page: spot.page,
				image,
				fills: image?.fitMode === 'fill',
				number: !image && numbered,
				turned: spot.rotation === 180,
				lit: spot.page === lit,
				over: spot.page - 1 === dropAt,
				style: htmlSafe(
					[
						`left: ${pct(spot.col / layout.cols)}`,
						`top: ${pct(spot.row / layout.rows)}`,
						`width: ${pct(1 / layout.cols)}`,
						`height: ${pct(1 / layout.rows)}`,
					].join('; '),
				),
			};
		});
	}

	get creases() {
		return this.args.layout.foldLines.map((fold) => {
			const at = pct(fold.pos);
			const vertical = fold.axis === 'v';
			return {
				x1: vertical ? at : '0',
				y1: vertical ? '0' : at,
				x2: vertical ? at : '100%',
				y2: vertical ? '100%' : at,
				dashes: DASHES[fold.kind],
			};
		});
	}

	get cuts() {
		if (this.back) return [];
		return this.args.layout.cutLines.map((cut) => ({
			x1: pct(cut.x1),
			y1: pct(cut.y1),
			x2: pct(cut.x2),
			y2: pct(cut.y2),
		}));
	}

	get scissors() {
		const cut = this.back
			? undefined
			: this.args.layout.cutLines[0];
		if (!cut) return null;
		const angle = Math.atan2(
			(cut.y2 - cut.y1) / this.args.aspect,
			cut.x2 - cut.x1,
		);
		return htmlSafe(
			`left: ${pct(cut.x1)}; top: ${pct(cut.y1)}; rotate: ${angle}rad`,
		);
	}

	dragOver = (event: DragEvent) =>
		this.args.onDragOver(this.args.side, event);
	drop = (event: DragEvent) => this.args.onDrop(this.args.side, event);

	<template>
		<div
			class="zi-face {{if this.back 'zi-face--back'}}"
			{{on "dragover" this.dragOver}}
			{{on "drop" this.drop}}
		>
			<div class="zi-paper">
				{{#each this.cells key="key" as |cell|}}
					<div
						class="zi-cell
							{{if
								cell.turned
								'zi-cell--turned'
							}}
							{{if
								cell.lit
								'zi-cell--lit'
							}}
							{{if
								cell.over
								'zi-cell--over'
							}}"
						style={{cell.style}}
					>
						<span class="zi-art">
							{{#if cell.image}}
								<img
									class="zi-picture
										{{if
											cell.fills
											'zi-picture--fills'
										}}"
									src={{cell.image.url}}
									alt=""
									draggable="false"
								/>
								<span
									class="zi-tag"
								>{{cell.page}}</span>
							{{else if cell.number}}
								<span
									class="zi-number"
								>{{cell.page}}</span>
							{{/if}}
						</span>
					</div>
				{{/each}}
				<svg class="zi-lines" aria-hidden="true">
					{{#each this.creases as |crease|}}
						<line
							class="zi-crease"
							x1={{crease.x1}}
							y1={{crease.y1}}
							x2={{crease.x2}}
							y2={{crease.y2}}
							stroke-dasharray={{crease.dashes}}
						/>
					{{/each}}
					{{#each this.cuts as |cut|}}
						<line
							class="zi-cut"
							x1={{cut.x1}}
							y1={{cut.y1}}
							x2={{cut.x2}}
							y2={{cut.y2}}
						/>
					{{/each}}
				</svg>
				{{#if this.scissors}}
					<span
						class="zi-scissors"
						style={{this.scissors}}
						aria-hidden="true"
					><IconSvg @name="scissors" /></span>
				{{/if}}
			</div>
		</div>
	</template>
}

export interface SheetSignature {
	Args: {
		layout: ZineFoldLayout;
		images: (ZineImage | null)[];
		width: number;
		height: number;
		lit?: number;
		back: boolean;
		legend: string;
		detail: string;
		figure: string;
		onFlip: () => void;
		onDropAt: (index: number, files: File[]) => void;
	};
}

export default class Sheet extends Component<SheetSignature> {
	@tracked dropAt?: number;

	get aspect() {
		return this.args.width / Math.max(this.args.height, 1);
	}

	get style() {
		return htmlSafe(`--zi-aspect: ${this.aspect}`);
	}

	get front() {
		return this.args.layout.sides[0];
	}

	get backSide() {
		return this.args.layout.sides[1];
	}

	get name() {
		return [this.args.legend, this.args.detail]
			.filter(Boolean)
			.join(', ');
	}

	#page(side: ZineSide, event: DragEvent) {
		const paper = (
			event.currentTarget as HTMLElement
		).querySelector('.zi-paper');
		if (!paper) return undefined;
		const box = paper.getBoundingClientRect();
		const { cols, rows } = this.args.layout;
		const col = Math.floor(
			((event.clientX - box.left) / box.width) * cols,
		);
		const row = Math.floor(
			((event.clientY - box.top) / box.height) * rows,
		);
		return side.placements.find(
			(p) => p.col === col && p.row === row,
		)?.page;
	}

	dragOver = (side: ZineSide, event: DragEvent) => {
		if (!event.dataTransfer?.types.includes('Files')) return;
		event.preventDefault();
		const page = this.#page(side, event);
		this.dropAt = page === undefined ? undefined : page - 1;
	};

	drop = (side: ZineSide, event: DragEvent) => {
		const page = this.#page(side, event);
		this.dropAt = undefined;
		const files = [...(event.dataTransfer?.files ?? [])];
		if (page === undefined || !files.length) return;
		event.preventDefault();
		this.args.onDropAt(page - 1, files);
	};

	leave = (event: DragEvent) => {
		const root = event.currentTarget as Element;
		if (!root.contains(event.relatedTarget as Node | null))
			this.dropAt = undefined;
	};

	<template>
		<div
			class="zi-sheet"
			style={{this.style}}
			{{on "dragleave" this.leave}}
		>
			<div class="zi-sheet-head">
				<div class="zi-sheet-text">
					<span
						class="zi-legend"
					>{{@legend}}</span>
					<span
						class="zi-detail"
					>{{@detail}}</span>
				</div>
				<CanonFigure
					class="zi-figure"
					@text={{@figure}}
					@unit="px"
					@size={{30}}
					@halo="var(--canon-muted)"
				/>
			</div>
			{{#if this.backSide}}
				<button
					type="button"
					class="zi-turner
						{{if @back 'zi-turner--back'}}"
					aria-label={{this.name}}
					{{on "click" @onFlip}}
				>
					{{#if this.front}}
						<Face
							@layout={{@layout}}
							@side={{this.front}}
							@images={{@images}}
							@aspect={{this.aspect}}
							@lit={{@lit}}
							@dropAt={{this.dropAt}}
							@onDragOver={{this.dragOver}}
							@onDrop={{this.drop}}
						/>
					{{/if}}
					<Face
						@layout={{@layout}}
						@side={{this.backSide}}
						@images={{@images}}
						@aspect={{this.aspect}}
						@lit={{@lit}}
						@dropAt={{this.dropAt}}
						@onDragOver={{this.dragOver}}
						@onDrop={{this.drop}}
					/>
				</button>
			{{else if this.front}}
				<figure
					class="zi-turner"
					aria-label={{this.name}}
				>
					<Face
						@layout={{@layout}}
						@side={{this.front}}
						@images={{@images}}
						@aspect={{this.aspect}}
						@lit={{@lit}}
						@dropAt={{this.dropAt}}
						@onDragOver={{this.dragOver}}
						@onDrop={{this.drop}}
					/>
				</figure>
			{{/if}}
		</div>
	</template>
}
