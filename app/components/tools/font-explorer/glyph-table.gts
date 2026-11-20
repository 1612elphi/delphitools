import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonDialog from 'delphicanon/components/canon-dialog';
import {
	hex,
	inView,
	tableLayout,
} from 'delphitools-v2/components/tools/font-explorer/table';

const cellSize = 48;
const headHeight = 36;
const overscan = 400;

interface GlyphTableSignature {
	Args: {
		open: boolean;
		codes: number[];
		family: string;
		onCopy: (char: string) => void;
		onClose: () => void;
	};
}

export default class GlyphTable extends Component<GlyphTableSignature> {
	@tracked width = 0;
	@tracked viewHeight = 0;
	@tracked scrollTop = 0;

	get title() {
		const { codes } = this.args;
		const first = codes[0];
		const last = codes.at(-1);
		return first === undefined || last === undefined
			? 'Glyphs'
			: `Glyphs · U+${hex(first)}–${hex(last)}`;
	}

	get columns() {
		return Math.max(4, Math.floor(this.width / cellSize));
	}

	@cached
	get layout() {
		return tableLayout(
			this.args.codes,
			this.columns,
			cellSize,
			headHeight,
		);
	}

	get stageStyle() {
		return htmlSafe(
			`block-size: ${this.layout.height}px; font-family: ${this.args.family}; --fx-table-columns: ${this.columns}`,
		);
	}

	get items() {
		return inView(
			this.layout.items,
			this.scrollTop - overscan,
			this.scrollTop + this.viewHeight + overscan,
		).map((item) => ({
			...item,
			style: htmlSafe(
				`translate: 0 ${item.top}px; block-size: ${item.height}px`,
			),
			cells: item.codes.map((code) => ({
				code,
				char: String.fromCodePoint(code),
				label: `U+${hex(code)}`,
			})),
		}));
	}

	track = modifier((element: HTMLElement) => {
		const observer = new ResizeObserver(([entry]) => {
			this.width = entry?.contentRect.width ?? 0;
			this.viewHeight = entry?.contentRect.height ?? 0;
		});
		observer.observe(element);
		const scrolled = () => (this.scrollTop = element.scrollTop);
		element.addEventListener('scroll', scrolled, { passive: true });
		return () => {
			observer.disconnect();
			element.removeEventListener('scroll', scrolled);
		};
	});

	<template>
		<CanonDialog
			class="fx-table-dialog"
			@open={{@open}}
			@title={{this.title}}
			@onClose={{@onClose}}
		>
			<:default>
				<div class="fx-table-scroller" {{this.track}}>
					<div
						class="fx-table-stage"
						style={{this.stageStyle}}
					>
						{{#each
							this.items key="key"
							as |item|
						}}
							{{#if item.name}}
								<h3
									class="fx-table-block"
									style={{item.style}}
								>{{item.name}}</h3>
							{{else}}
								<div
									class="fx-table-row"
									style={{item.style}}
								>
									{{#each
										item.cells
										key="code"
										as |cell|
									}}
										<button
											type="button"
											class="fx-glyph"
											aria-label={{cell.label}}
											{{on
												"click"
												(fn
													@onCopy
													cell.char
												)
											}}
										>{{cell.char}}</button>
									{{/each}}
								</div>
							{{/if}}
						{{/each}}
					</div>
				</div>
			</:default>
			<:footer as |close|>
				<CanonButton
					@kind="primary"
					@text="Done"
					@onClick={{fn close ""}}
				/>
			</:footer>
		</CanonDialog>
	</template>
}
