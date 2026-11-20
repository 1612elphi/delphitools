import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { concat, fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import CanonDimensionLine from 'delphicanon/components/canon-dimension-line';
import CanonLoader from 'delphicanon/components/canon-loader';
import {
	CanonMenuList,
	showMenu,
	type CanonMenuEntry,
	type CanonMenuItem,
} from 'delphicanon/components/canon-menu';
import { dimensionLines } from 'delphicanon/lib/dimension-line';
import { attach } from 'delphicanon/lib/popover';
import { IconSvg } from 'delphitools-v2/components/icon';
import Slot from 'delphitools-v2/components/tools/media/slot';
import {
	SIDES,
	batchGrid,
	compositeFrame,
	drop,
	exportSize,
	imageFrame,
	nearest,
	onScreen,
	seamCentres,
	contains,
	tuning,
	zone,
	type Drop,
	type Layout,
	type Rect,
	type Side,
	type Target,
} from 'delphitools-v2/components/tools/image-stitcher/stitch';

export interface PictureSignature {
	Args: {
		layout: Layout | null;
		batch: boolean;
		selected: string | null;
		loading: boolean;
		springs: boolean;
		over: boolean;
		first: Target;
		onChoose: (target: Target) => void;
		onPaste: (target: Target) => void;
		onSelect: (key: string | null) => void;
		onDrag: (key: string, drop: Drop) => void;
		onDropFiles: (target: Target, files: File[]) => void;
	};
}

const Folder = <template><IconSvg @name="folder-open" /></template>;
const Clipboard = <template><IconSvg @name="clipboard-paste" /></template>;
const menuItems: CanonMenuEntry[] = [
	{ title: 'Files', icon: Folder },
	{ title: 'Paste', icon: Clipboard },
];

const addNames: Record<Side, string> = {
	top: 'Add top',
	left: 'Add left',
	right: 'Add right',
	bottom: 'Add bottom',
};
const arrows: Record<Side, string> = {
	top: 'arrow-up',
	left: 'arrow-left',
	right: 'arrow-right',
	bottom: 'arrow-down',
};

const px = (value: number) => `${Math.round(value * 100) / 100}px`;

function box({ x, y, width, height }: Rect) {
	return htmlSafe(
		`left: ${px(x)}; top: ${px(y)}; width: ${px(width)}; height: ${px(height)}`,
	);
}

const centred = (x: number, y: number, side: number) =>
	box({ x: x - side / 2, y: y - side / 2, width: side, height: side });

const isFiles = (event: DragEvent) =>
	!!event.dataTransfer?.types.includes('Files');

interface Mark {
	rect: Rect;
	edge?: Side;
	icon: string;
}

interface Held {
	key: string;
	pointer: number;
	touch: boolean;
	x: number;
	y: number;
	timer?: number;
	dragging: boolean;
}

export default class Picture extends Component<PictureSignature> {
	@tracked area: Rect = { x: 0, y: 0, width: 0, height: 0 };
	@tracked dragged?: { key: string; drop?: Drop; x: number; y: number };
	@tracked fileMark?: Mark;
	#held?: Held;
	#swallowClick = false;
	#target?: Target;
	#trigger?: HTMLElement;
	#point?: HTMLElement;
	#panel?: HTMLElement;

	get hasGutters() {
		return !this.args.batch && !!this.args.layout;
	}

	get frame(): Rect {
		const { layout } = this.args;
		if (!layout) return { x: 0, y: 0, width: 0, height: 0 };
		return compositeFrame(layout, this.area, this.hasGutters);
	}

	get frames() {
		const { layout } = this.args;
		if (!layout) return [];
		const { frame } = this;
		return layout.ops.map((op) => ({
			key: op.leafKey,
			op,
			rect: onScreen(op.dest, frame, layout),
		}));
	}

	get idle() {
		return !this.dragged && !this.fileMark;
	}

	get tiles() {
		const { batch, selected } = this.args;
		const count = this.frames.length;
		return this.frames.map(({ key, op, rect }, index) => {
			const at = imageFrame(op, rect);
			const number = batch ? index + 1 : undefined;
			const base = !batch && op.isBase && count > 1;
			const plate =
				number !== undefined
					? { width: 18, height: 16 }
					: { width: 18, height: 18 };
			return {
				key,
				name: op.src.name,
				url: op.src.url,
				matte: op.fit === 'matte',
				lit: !batch && key === selected,
				lifted: this.dragged?.key === key,
				number,
				base,
				plated:
					(number !== undefined || base) &&
					rect.width >= plate.width + 12 &&
					rect.height >= plate.height + 12,
				style: box(rect),
				image: box(at),
			};
		});
	}

	get blanks() {
		const { layout, batch } = this.args;
		if (!batch || !layout) return [];
		const cell = layout.ops[0]?.dest;
		if (!cell) return [];
		const { columns, rows } = batchGrid(layout);
		const out = [];
		for (let i = layout.ops.length; i < columns * rows; i++) {
			const r = onScreen(
				{
					x: (i % columns) * cell.width,
					y:
						Math.floor(i / columns) *
						cell.height,
					width: cell.width,
					height: cell.height,
				},
				this.frame,
				layout,
			);
			out.push(
				box({
					x: r.x + 4,
					y: r.y + 4,
					width: r.width - 8,
					height: r.height - 8,
				}),
			);
		}
		return out;
	}

	get gutterRects(): Record<Side, Rect> {
		const c = this.frame;
		const { gap, gutter } = tuning;
		return {
			top: {
				x: c.x,
				y: c.y - gap - gutter,
				width: c.width,
				height: gutter,
			},
			left: {
				x: c.x - gap - gutter,
				y: c.y,
				width: gutter,
				height: c.height,
			},
			right: {
				x: c.x + c.width + gap,
				y: c.y,
				width: gutter,
				height: c.height,
			},
			bottom: {
				x: c.x,
				y: c.y + c.height + gap,
				width: c.width,
				height: gutter,
			},
		};
	}

	get gutters() {
		if (!this.hasGutters || this.args.selected || !this.idle)
			return [];
		const rects = this.gutterRects;
		return SIDES.map((side) => ({
			side,
			label: addNames[side],
			style: box(rects[side]),
			target: { kind: 'add' as const, node: null, side },
		}));
	}

	get seams() {
		const { layout, batch, selected } = this.args;
		if (!layout || batch || selected || !this.idle) return [];
		const { frame } = this;
		const lines = layout.seams.map((seam) => ({
			id: seam.id,
			seam,
			line: onScreen(
				{
					x: seam.x,
					y: seam.y,
					width: seam.vertical ? 0 : seam.length,
					height: seam.vertical ? seam.length : 0,
				},
				frame,
				layout,
			),
		}));
		const byId = new Map(lines.map((l) => [l.id, l.seam]));
		return seamCentres(lines, tuning.button).map(({ id, x, y }) => {
			const seam = byId.get(id)!;
			return {
				id,
				style: centred(x, y, tuning.button),
				target: {
					kind: 'insert' as const,
					split: seam.splitKey,
					at: seam.at,
				},
			};
		});
	}

	get adders() {
		const { selected, batch } = this.args;
		const lit = this.frames.find((f) => f.key === selected)?.rect;
		if (batch || !lit || !this.idle) return [];
		const across = lit.width >= tuning.roomy ? 18 : -16;
		const down = lit.height >= tuning.roomy ? 18 : -16;
		const midX = lit.x + lit.width / 2;
		const midY = lit.y + lit.height / 2;
		const centres: Record<Side, [number, number]> = {
			top: [midX, lit.y + down],
			left: [lit.x + across, midY],
			right: [lit.x + lit.width - across, midY],
			bottom: [midX, lit.y + lit.height - down],
		};
		return SIDES.map((side) => ({
			side,
			label: `${addNames[side]} here`,
			style: centred(...centres[side], tuning.adder),
			target: { kind: 'add' as const, node: selected, side },
		}));
	}

	get lines() {
		const { layout } = this.args;
		const c = this.frame;
		if (!layout || c.width <= 0) return undefined;
		const lead = this.hasGutters ? tuning.gutter + tuning.gap : 0;
		const { across, down } = dimensionLines(c, c, lead + 2);
		const size = exportSize(layout.width, layout.height);
		return { across: box(across), down: box(down), size };
	}

	get reading() {
		const size = this.lines?.size;
		return size ? `${size.width} × ${size.height} px` : '';
	}

	get mark(): (Mark & { style: ReturnType<typeof box> }) | undefined {
		const mark = this.fileMark ?? this.dragMark;
		return mark && { ...mark, style: box(mark.rect) };
	}

	get dragMark(): Mark | undefined {
		const drop = this.dragged?.drop;
		if (!drop) return undefined;
		const rect = this.frames.find((f) => f.key === drop.key)?.rect;
		if (!rect) return undefined;
		return drop.kind === 'swap'
			? { rect, icon: 'arrow-left-right' }
			: {
					rect: zone(drop.side, rect),
					edge: drop.side,
					icon: arrows[drop.side],
				};
	}

	get ghost() {
		const { dragged } = this;
		const tile =
			dragged &&
			this.frames.find((f) => f.key === dragged.key);
		if (!dragged || !tile) return undefined;
		const { rect, op } = tile;
		const longest = Math.max(rect.width, rect.height, 1);
		const width = (rect.width / longest) * tuning.ghost;
		const height = (rect.height / longest) * tuning.ghost;
		return {
			url: op.src.url,
			matte: op.fit === 'matte',
			style: box({
				x: dragged.x - width / 2,
				y: dragged.y - height - tuning.lift,
				width,
				height,
			}),
		};
	}

	measure = modifier((element: HTMLElement) => {
		const observer = new ResizeObserver(() => {
			this.area = {
				x: element.offsetLeft,
				y: element.offsetTop,
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
			returnFocus: () => this.#trigger,
		});
	});

	openMenu = (target: Target, event: MouseEvent) => {
		event.stopPropagation();
		const trigger = event.currentTarget as HTMLElement;
		const point = this.#point;
		const panel = this.#panel;
		if (!point || !panel) return;
		this.#target = target;
		this.#trigger = trigger;
		const frame = point.offsetParent!.getBoundingClientRect();
		const button = trigger.getBoundingClientRect();
		const pointer = event.detail > 0;
		point.style.left = px(
			(pointer ? event.clientX : button.left) - frame.left,
		);
		point.style.top = px(
			(pointer ? event.clientY : button.bottom) - frame.top,
		);
		showMenu(panel, 'first');
	};

	pick = (item: CanonMenuItem) => {
		const target = this.#target;
		if (!target) return;
		if (item.title === 'Paste') this.args.onPaste(target);
		else this.args.onChoose(target);
	};

	choose = () => this.args.onChoose(this.args.first);

	pressTile = (key: string, event: MouseEvent) => {
		event.stopPropagation();
		if (this.#swallowClick) {
			this.#swallowClick = false;
			return;
		}
		this.args.onSelect(key);
	};

	pressBeside = () => {
		if (this.#swallowClick) {
			this.#swallowClick = false;
			return;
		}
		if (!this.args.batch && this.args.layout)
			this.args.onSelect(null);
	};

	#local(event: { clientX: number; clientY: number }, root: HTMLElement) {
		const r = root.getBoundingClientRect();
		return { x: event.clientX - r.left, y: event.clientY - r.top };
	}

	drags = modifier((root: HTMLElement) => {
		const begin = (held: Held) => {
			held.dragging = true;
			try {
				root.setPointerCapture(held.pointer);
			} catch {
				// the pointer is gone
			}
			this.dragged = { key: held.key, x: held.x, y: held.y };
		};
		const end = (commit: boolean) => {
			const held = this.#held;
			this.#held = undefined;
			window.clearTimeout(held?.timer);
			const dragged = this.dragged;
			this.dragged = undefined;
			if (!held?.dragging) return;
			this.#swallowClick = true;
			window.setTimeout(
				() => (this.#swallowClick = false),
				0,
			);
			if (commit && dragged?.drop)
				this.args.onDrag(dragged.key, dragged.drop);
		};
		const down = (event: PointerEvent) => {
			if (event.button !== 0) return;
			const tile = (
				event.target as Element
			).closest<HTMLElement>('.stitch-tile');
			const key = tile?.dataset['key'];
			if (!key) return;
			const { x, y } = this.#local(event, root);
			const held: Held = {
				key,
				pointer: event.pointerId,
				touch: event.pointerType === 'touch',
				x,
				y,
				dragging: false,
			};
			if (held.touch)
				held.timer = window.setTimeout(
					() => begin(held),
					tuning.hold,
				);
			this.#held = held;
		};
		const move = (event: PointerEvent) => {
			const held = this.#held;
			if (!held || event.pointerId !== held.pointer) return;
			const { x, y } = this.#local(event, root);
			if (!held.dragging) {
				const far =
					Math.hypot(x - held.x, y - held.y) > 4;
				if (held.touch && far) return end(false);
				if (!far) return;
				begin(held);
			}
			this.dragged = {
				key: held.key,
				x,
				y,
				drop: drop(x, y, this.frames, held.key),
			};
		};
		const up = (event: PointerEvent) => {
			if (event.pointerId === this.#held?.pointer) end(true);
		};
		const cancel = () => end(false);
		const touchMove = (event: TouchEvent) => {
			if (this.#held?.dragging) event.preventDefault();
		};
		const key = (event: KeyboardEvent) => {
			if (event.key === 'Escape' && this.#held) end(false);
		};
		root.addEventListener('pointerdown', down);
		root.addEventListener('pointermove', move);
		root.addEventListener('pointerup', up);
		root.addEventListener('pointercancel', cancel);
		root.addEventListener('touchmove', touchMove, {
			passive: false,
		});
		root.ownerDocument.addEventListener('keydown', key);
		return () => {
			end(false);
			root.removeEventListener('pointerdown', down);
			root.removeEventListener('pointermove', move);
			root.removeEventListener('pointerup', up);
			root.removeEventListener('pointercancel', cancel);
			root.removeEventListener('touchmove', touchMove);
			root.ownerDocument.removeEventListener('keydown', key);
		};
	});

	fileTarget(x: number, y: number): { target: Target; mark: Mark } {
		const c = this.frame;
		const at = (f: { rect: Rect }) => contains(f.rect, x, y);
		if (this.args.batch) {
			const index = this.frames.findIndex(at);
			const hit = this.frames[index];
			return {
				target: {
					kind: 'batch',
					at: hit ? index : this.frames.length,
				},
				mark: {
					rect: hit ? hit.rect : c,
					edge: hit ? 'left' : 'right',
					icon: 'plus',
				},
			};
		}
		const tile = this.frames.find(at);
		if (tile) {
			const [side] = nearest(x, y, tile.rect);
			return {
				target: { kind: 'add', node: tile.key, side },
				mark: {
					rect: zone(side, tile.rect),
					edge: side,
					icon: 'plus',
				},
			};
		}
		const [side] = nearest(x, y, c);
		return {
			target: { kind: 'add', node: null, side },
			mark: {
				rect: this.gutterRects[side],
				edge: side,
				icon: 'plus',
			},
		};
	}

	fileOver = (event: DragEvent) => {
		if (!isFiles(event) || !this.args.layout) return;
		event.preventDefault();
		const root = event.currentTarget as HTMLElement;
		const { x, y } = this.#local(event, root);
		const { mark } = this.fileTarget(x, y);
		const last = this.fileMark;
		if (
			!last ||
			last.edge !== mark.edge ||
			last.rect.x !== mark.rect.x ||
			last.rect.y !== mark.rect.y ||
			last.rect.width !== mark.rect.width
		)
			this.fileMark = mark;
	};

	fileLeave = (event: DragEvent) => {
		const root = event.currentTarget as Element;
		if (!root.contains(event.relatedTarget as Node | null))
			this.fileMark = undefined;
	};

	fileDrop = (event: DragEvent) => {
		this.fileMark = undefined;
		const files = [...(event.dataTransfer?.files ?? [])].filter(
			(f) => f.type.startsWith('image/'),
		);
		if (!files.length || !this.args.layout) return;
		event.preventDefault();
		const { x, y } = this.#local(
			event,
			event.currentTarget as HTMLElement,
		);
		this.args.onDropFiles(this.fileTarget(x, y).target, files);
	};

	<template>
		{{! template-lint-disable no-invalid-interactive }}
		<div
			class="stitch-picture
				{{if this.dragged 'stitch-picture--dragging'}}
				{{if @springs 'stitch-picture--springs'}}"
			{{this.drags}}
			{{on "click" this.pressBeside}}
			{{on "dragover" this.fileOver}}
			{{on "dragleave" this.fileLeave}}
			{{on "drop" this.fileDrop}}
		>
			<span class="stitch-area" {{this.measure}}></span>
			{{#if @layout}}
				{{#each this.blanks as |blank|}}
					<span
						class="stitch-blank"
						style={{blank}}
					></span>
				{{/each}}
				{{#each this.tiles key="key" as |tile|}}
					{{#if @batch}}
						<span
							class="stitch-tile
								{{if
									tile.lifted
									'stitch-tile--lifted'
								}}"
							style={{tile.style}}
							data-key={{tile.key}}
						>
							<span
								class="stitch-tile-image
									{{if
										tile.matte
										'stitch-tile-image--matte'
									}}"
							><img
									src={{tile.url}}
									alt={{tile.name}}
									draggable="false"
									style={{tile.image}}
								/></span>
							{{#if tile.plated}}
								<span
									class="stitch-plate"
									aria-hidden="true"
								>{{tile.number}}</span>
							{{/if}}
						</span>
					{{else}}
						<button
							type="button"
							class="stitch-tile
								{{if
									tile.lit
									'stitch-tile--lit'
								}}
								{{if
									tile.lifted
									'stitch-tile--lifted'
								}}"
							style={{tile.style}}
							data-key={{tile.key}}
							aria-label={{tile.name}}
							aria-pressed={{if
								tile.lit
								"true"
								"false"
							}}
							{{on
								"click"
								(fn
									this.pressTile
									tile.key
								)
							}}
						>
							<span
								class="stitch-tile-image
									{{if
										tile.matte
										'stitch-tile-image--matte'
									}}"
							><img
									src={{tile.url}}
									alt=""
									draggable="false"
									style={{tile.image}}
								/></span>
							{{#if tile.plated}}
								<span
									class="stitch-plate stitch-plate--pin"
									aria-hidden="true"
								><IconSvg
										@name="pin"
									/></span>
							{{/if}}
						</button>
					{{/if}}
				{{/each}}
				{{#each this.gutters key="side" as |gutter|}}
					<button
						type="button"
						class="stitch-add stitch-add--gutter"
						style={{gutter.style}}
						aria-label={{gutter.label}}
						aria-haspopup="menu"
						{{on
							"click"
							(fn
								this.openMenu
								gutter.target
							)
						}}
					><IconSvg @name="plus" /></button>
				{{/each}}
				{{#each this.seams key="id" as |seam|}}
					<button
						type="button"
						class="stitch-add stitch-add--seam"
						style={{seam.style}}
						aria-label="Insert here"
						aria-haspopup="menu"
						{{on
							"click"
							(fn
								this.openMenu
								seam.target
							)
						}}
					><IconSvg @name="plus" /></button>
				{{/each}}
				{{#each this.adders key="side" as |adder|}}
					<button
						type="button"
						class="stitch-add stitch-add--filled"
						style={{adder.style}}
						aria-label={{adder.label}}
						aria-haspopup="menu"
						{{on
							"click"
							(fn
								this.openMenu
								adder.target
							)
						}}
					><IconSvg @name="plus" /></button>
				{{/each}}
				{{#if this.lines}}
					<CanonDimensionLine
						class="stitch-dimension"
						@pixels={{this.lines.size.width}}
						style={{this.lines.across}}
					/>
					<CanonDimensionLine
						class="stitch-dimension"
						@pixels={{this.lines.size.height}}
						@down={{true}}
						style={{this.lines.down}}
					/>
				{{/if}}
				<output
					class="stitch-reading"
				>{{this.reading}}</output>
			{{else}}
				<Slot
					class="stitch-slot"
					@prompt="Drop images here"
					@icon="image-plus"
					@dashed={{true}}
					@fills={{true}}
					@over={{@over}}
					@onChoose={{this.choose}}
				/>
			{{/if}}
			{{#if this.mark}}
				<span
					class="stitch-mark
						{{if
							this.mark.edge
							(concat
								'stitch-mark--'
								this.mark.edge
							)
						}}"
					style={{this.mark.style}}
					aria-hidden="true"
				><span class="stitch-mark-badge"><IconSvg
							@name={{this.mark.icon}}
						/></span></span>
			{{/if}}
			{{#if this.ghost}}
				<span
					class="stitch-ghost
						{{if
							this.ghost.matte
							'stitch-ghost--matte'
						}}"
					style={{this.ghost.style}}
					aria-hidden="true"
				><img src={{this.ghost.url}} alt="" /></span>
			{{/if}}
			{{#if @loading}}
				<CanonLoader class="stitch-loader" />
			{{/if}}
			<span class="stitch-point" aria-hidden="true"></span>
			<CanonMenuList
				@items={{menuItems}}
				@onSelect={{this.pick}}
				{{this.menu}}
			/>
		</div>
	</template>
}
