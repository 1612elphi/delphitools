import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonRows from 'delphicanon/components/canon-rows';
import { PopoverCell } from 'delphitools-v2/components/substrata/editor/tool-bar/bar-cells';
import { Choice } from 'delphitools-v2/components/errata/tool-panel';
import {
	editStore,
	insertTableAt,
	setTableBorder,
	tableAction,
	tableState,
	type TableAction,
} from 'delphitools-v2/lib/errata/write/editor';
import { focusEditor } from 'delphitools-v2/lib/errata/write/view';
import type { TableBorder } from 'delphitools-v2/lib/errata/write/types';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

const SIZE = 8;
const GRID = Array.from({ length: SIZE * SIZE }, (_, i) => ({
	row: Math.floor(i / SIZE) + 1,
	col: (i % SIZE) + 1,
}));

const BORDERS: { value: TableBorder['kind']; label: string }[] = [
	{ value: 'all', label: 'All' },
	{ value: 'outer', label: 'Outer' },
	{ value: 'none', label: 'None' },
];

const EDITS: { action: TableAction; label: string }[] = [
	{ action: 'rowAbove', label: 'Row above' },
	{ action: 'rowBelow', label: 'Row below' },
	{ action: 'deleteRow', label: 'Delete row' },
	{ action: 'colLeft', label: 'Column left' },
	{ action: 'colRight', label: 'Column right' },
	{ action: 'deleteCol', label: 'Delete column' },
];

export default class TableMenu extends Component<{
	Args: {
		phone?: boolean;
		tool?: string;
		cellOnly?: boolean;
		onInsert?: () => void;
		text?: string;
	};
}> {
	state = new TrackedExternal(editStore.subscribe, editStore.get);
	@tracked rows = 1;
	@tracked cols = 1;

	willDestroy() {
		super.willDestroy();
		this.state.unsubscribe();
	}

	get table() {
		void this.state.current;
		return tableState();
	}

	get shown() {
		return !this.args.cellOnly || !!this.table;
	}

	get size() {
		return `${this.rows} × ${this.cols}`;
	}

	isOn = (c: { row: number; col: number }) =>
		c.row <= this.rows && c.col <= this.cols;

	hover = (c: { row: number; col: number }) => {
		this.rows = c.row;
		this.cols = c.col;
	};

	insert = (close: () => void, c: { row: number; col: number }) => {
		insertTableAt(c.row, c.col);
		close();
		this.args.onInsert?.();
		focusEditor();
	};

	act = (action: TableAction, close: () => void) => {
		tableAction(action);
		if (action === 'deleteTable') close();
		focusEditor();
	};

	setBorder = (kind: TableBorder['kind']) => {
		setTableBorder(kind);
		focusEditor();
	};

	<template>
		{{#if this.shown}}
			<PopoverCell
				@label="Table"
				@icon={{unless @text "grid-3x3"}}
				@text={{@text}}
				@placement={{if @phone "top" "left-start"}}
				@tip={{if @phone "top" "left"}}
				data-tool={{if @tool @tool "table"}}
				as |close|
			>
				{{#if this.table}}
					<CanonRows
						class="err-write-table-actions"
					>
						<CanonGrid @columns={{3}}>
							{{#each EDITS as |a|}}
								<CanonButton
									@kind="segment"
									@text={{a.label}}
									data-table={{a.action}}
									@onClick={{fn
										this.act
										a.action
										close
									}}
								/>
							{{/each}}
							<CanonButton
								@kind="segment"
								@text="Merge cells"
								@disabled={{if
									this.table.range
									false
									true
								}}
								data-table="merge"
								@onClick={{fn
									this.act
									"merge"
									close
								}}
							/>
							<CanonButton
								@kind="segment"
								@text="Split cell"
								@disabled={{if
									this.table.merged
									false
									true
								}}
								data-table="split"
								@onClick={{fn
									this.act
									"split"
									close
								}}
							/>
							<CanonButton
								@kind="segment"
								@text="Header row"
								@selected={{this.table.table.header}}
								data-table="header"
								@onClick={{fn
									this.act
									"header"
									close
								}}
							/>
						</CanonGrid>
						<CanonButton
							@kind="segment"
							@text="Delete table"
							data-table="deleteTable"
							@onClick={{fn
								this.act
								"deleteTable"
								close
							}}
						/>
						<Choice
							@label="Borders"
							@options={{BORDERS}}
							@value={{this.table.table.border.kind}}
							@onChange={{this.setBorder}}
							@columns={{3}}
							data-table="borders"
						/>
					</CanonRows>
				{{else}}
					<div class="err-write-table-pick">
						<div
							class="err-write-table-grid"
							role="group"
							aria-label="Size"
						>
							{{#each GRID as |c|}}
								<button
									type="button"
									class={{if
										(this.isOn
											c
										)
										"is-on"
									}}
									aria-label="{{c.row}} × {{c.col}}"
									data-rows={{c.row}}
									data-cols={{c.col}}
									{{on
										"pointerenter"
										(fn
											this.hover
											c
										)
									}}
									{{on
										"focus"
										(fn
											this.hover
											c
										)
									}}
									{{on
										"click"
										(fn
											this.insert
											close
											c
										)
									}}
								></button>
							{{/each}}
						</div>
						<span
							class="err-write-table-size"
							data-table-size
						>{{this.size}}</span>
					</div>
				{{/if}}
			</PopoverCell>
		{{/if}}
	</template>
}
