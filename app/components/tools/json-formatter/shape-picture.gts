import Component from '@glimmer/component';
import { cached } from '@glimmer/tracking';
import { htmlSafe } from '@ember/template';
import { on } from '@ember/modifier';
import {
	focusCell,
	parentPath,
	shapeLevels,
	type Shape,
	type ShapeCell,
	type ShapeKind,
} from 'delphitools-v2/components/tools/json-formatter/shape';

interface ShapePictureSignature {
	Args: {
		shape: Shape | null;
		invalid: boolean;
		selected: string | null;
		onTap: (cell: ShapeCell) => void;
		onSelect: (cell: ShapeCell) => void;
	};
}

export const rowHeight = 26;

export const shapeHeight = (levels: number) => 52 + levels * rowHeight;

const legendNames: [ShapeKind, string][] = [
	['object', 'Object'],
	['array', 'Array'],
	['string', 'String'],
	['number', 'Number'],
	['literal', 'true false null'],
];

export default class ShapePicture extends Component<ShapePictureSignature> {
	@cached
	get view() {
		const { shape } = this.args;
		if (!shape) return undefined;
		const focus = focusCell(shape);
		const start = focus?.start ?? 0;
		const span = Math.max((focus?.end ?? 1) - start, 1e-12);
		const top = focus?.depth ?? 0;
		const cells = shape.cells.filter(
			(cell) =>
				cell.depth >= top &&
				cell.end > start &&
				cell.start < start + span,
		);
		return { top, start, span, cells, focus: shape.focus };
	}

	get cells() {
		const { view } = this;
		if (!view) return [];
		const { selected } = this.args;
		return view.cells.map((cell) => {
			const left =
				((cell.start - view.start) / view.span) * 100;
			const width =
				((cell.end - cell.start) / view.span) * 100;
			const back =
				cell.path === view.focus && cell.path !== 'root'
					? '‹ '
					: '';
			return {
				cell,
				label: back + cell.label,
				detail: (cell.label ? ' ' : '') + cell.detail,
				selected: cell.path === selected,
				style: htmlSafe(
					`left: ${left}%; width: calc(${width}% - 1px); top: ${(cell.depth - view.top) * rowHeight}px`,
				),
			};
		});
	}

	get rowsStyle() {
		const { shape } = this.args;
		const levels = shape ? shapeLevels(shape) : 1;
		return htmlSafe(`block-size: ${levels * rowHeight}px`);
	}

	get legend() {
		const present = new Set(
			this.view?.cells.map((cell) => cell.kind) ?? [],
		);
		return legendNames
			.filter(([kind]) => present.has(kind))
			.map(([kind, name]) => ({ kind, name }));
	}

	get reading() {
		const { selected } = this.args;
		const cell = this.view?.cells.find(
			(entry) => entry.path === selected,
		);
		return cell ? `${cell.label} ${cell.detail}`.trim() : '';
	}

	#cellAt(target: EventTarget | null) {
		const path = (
			target as HTMLElement | null
		)?.closest<HTMLElement>('[data-path]')?.dataset['path'];
		return this.view?.cells.find((cell) => cell.path === path);
	}

	tap = (event: MouseEvent) => {
		const cell = this.#cellAt(event.target);
		if (cell) this.args.onTap(cell);
	};

	keydown = (event: KeyboardEvent) => {
		const { view } = this;
		if (!view) return;
		const current =
			view.cells.find(
				(cell) => cell.path === this.args.selected,
			) ?? view.cells[0];
		if (!current) return;
		const peers = view.cells.filter(
			(cell) => cell.depth === current.depth,
		);
		const at = peers.indexOf(current);
		let next: ShapeCell | undefined;
		switch (event.key) {
			case 'ArrowLeft':
				next = peers[at - 1];
				break;
			case 'ArrowRight':
				next = peers[at + 1];
				break;
			case 'ArrowDown':
				next = view.cells.find(
					(cell) =>
						cell.depth ===
							current.depth + 1 &&
						cell.path.startsWith(
							`${current.path}.`,
						),
				);
				break;
			case 'ArrowUp':
				next = view.cells.find(
					(cell) =>
						cell.path ===
						parentPath(current.path),
				);
				break;
			case 'Enter':
			case ' ':
				event.preventDefault();
				this.args.onTap(current);
				return;
			case 'Escape': {
				const focus = view.cells.find(
					(cell) => cell.path === view.focus,
				);
				if (focus && focus.path !== 'root') {
					event.preventDefault();
					this.args.onTap(focus);
				}
				return;
			}
			default:
				return;
		}
		event.preventDefault();
		this.args.onSelect(next ?? current);
	};

	<template>
		<div class="jf-shape">
			{{#if this.view}}
				<div
					class="jf-shape-rows"
					role="group"
					aria-label="Document"
					tabindex="0"
					style={{this.rowsStyle}}
					{{on "click" this.tap}}
					{{on "keydown" this.keydown}}
				>
					{{#each
						this.cells key="cell.path"
						as |entry|
					}}
						<div
							class="jf-cell jf-k--{{entry.cell.kind}}
								{{if
									entry.selected
									'jf-cell--selected'
								}}"
							data-path={{entry.cell.path}}
							style={{entry.style}}
						><span
								class="jf-cell-text"
							>{{entry.label}}<span
									class="jf-cell-detail"
								>{{entry.detail}}</span></span></div>
					{{/each}}
				</div>
				<output
					class="dt-sr-only"
				>{{this.reading}}</output>
				<div class="jf-shape-legend" aria-hidden="true">
					{{#each this.legend as |item|}}
						<span
							class="jf-legend jf-k--{{item.kind}}"
						>{{item.name}}</span>
					{{/each}}
				</div>
			{{else}}
				<div
					class="jf-shape-empty
						{{if
							@invalid
							'jf-shape-empty--invalid'
						}}"
					role="img"
					aria-label={{if
						@invalid
						"Invalid"
						"Document"
					}}
				>{{if @invalid "Invalid" "Document"}}</div>
			{{/if}}
		</div>
	</template>
}
