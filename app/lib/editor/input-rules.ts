// Live-preview input rules: typing Markdown shorthand transforms the block/inline
// in place (the markers are consumed, never stored), so "# " becomes a heading,
// "**x**" becomes bold, etc. — the iA-Writer / Typora feel.
import {
	InputRule,
	inputRules,
	textblockTypeInputRule,
	wrappingInputRule,
} from 'prosemirror-inputrules';
import type {
	MarkType,
	Node as PMNode,
	NodeType,
	Schema,
} from 'prosemirror-model';
import { NodeSelection } from 'prosemirror-state';

function createTable(schema: Schema, rows = 3, cols = 3): PMNode | null {
	const { table, table_row, table_cell, table_header } = schema.nodes;
	if (!table || !table_row || !table_cell || !table_header) return null;
	const cellsOf = (type: NodeType) =>
		Array.from({ length: cols }, () => type.createAndFill()).filter(
			Boolean,
		) as PMNode[];
	const headerRow = table_row.create(null, cellsOf(table_header));
	const bodyRows = Array.from({ length: rows - 1 }, () =>
		table_row.create(null, cellsOf(table_cell)),
	);
	return table.create(null, [headerRow, ...bodyRows]);
}

/** Wrap the captured inner text (match[1]) in a mark, removing the delimiters. */
function markInputRule(regexp: RegExp, markType: MarkType): InputRule {
	return new InputRule(regexp, (state, match, start, end) => {
		const inner = match[1];
		if (!inner) return null;
		const tr = state.tr;
		const offset = match[0].lastIndexOf(inner);
		const textStart = start + offset;
		const textEnd = textStart + inner.length;
		if (textEnd < end) tr.delete(textEnd, end);
		if (textStart > start) tr.delete(start, textStart);
		tr.addMark(start, start + inner.length, markType.create());
		tr.removeStoredMark(markType);
		return tr;
	});
}

export function buildInputRules(schema: Schema): ReturnType<typeof inputRules> {
	const rules: InputRule[] = [];
	const {
		blockquote,
		ordered_list,
		bullet_list,
		code_block,
		heading,
		list_item,
		footnote,
		table,
	} = schema.nodes;
	const { strong, em, code, strikethrough } = schema.marks;

	// Block rules (fire on the trailing space / closing fence).
	if (blockquote) rules.push(wrappingInputRule(/^\s*>\s$/, blockquote));
	if (ordered_list)
		rules.push(
			wrappingInputRule(
				/^(\d+)\.\s$/,
				ordered_list,
				(match) => ({ order: +(match[1] ?? '1') }),
				(match, node) =>
					node.childCount +
						(node.attrs.order as number) ===
					+(match[1] ?? '0'),
			),
		);
	if (bullet_list)
		rules.push(wrappingInputRule(/^\s*([-+*])\s$/, bullet_list));
	if (code_block) rules.push(textblockTypeInputRule(/^```$/, code_block));
	if (heading)
		rules.push(
			textblockTypeInputRule(
				/^(#{1,6})\s$/,
				heading,
				(match) => ({
					level: (match[1] ?? '#').length,
				}),
			),
		);

	// Inline mark rules (fire on the closing delimiter).
	if (strong) rules.push(markInputRule(/\*\*([^*]+)\*\*$/, strong));
	if (em) {
		// Single * not adjacent to another * (so it doesn't fight **bold**), or _italic_.
		rules.push(markInputRule(/(?<![*\w])\*([^*\s][^*]*)\*$/, em));
		rules.push(markInputRule(/(?<![_\w])_([^_\s][^_]*)_$/, em));
	}
	if (code) rules.push(markInputRule(/(?<!`)`([^`]+)`$/, code));
	if (strikethrough)
		rules.push(markInputRule(/~~([^~]+)~~$/, strikethrough));

	// Task list: typing "[ ] " / "[x] " at the start of a list item toggles it.
	if (list_item)
		rules.push(
			new InputRule(
				/^\[( |x|X)\]\s$/,
				(state, match, start, end) => {
					const $from = state.selection.$from;
					const li = $from.node(-1);
					if (li.type !== list_item) return null;
					const liPos = $from.before(-1);
					return state.tr
						.delete(start, end)
						.setNodeMarkup(
							liPos,
							undefined,
							{
								...li.attrs,
								checked:
									match[1] !==
									' ',
							},
						);
				},
			),
		);

	// Footnote: typing "[^]" drops an empty footnote and selects it (opens the editor).
	if (footnote)
		rules.push(
			new InputRule(/\[\^\]$/, (state, match, start, end) => {
				const node = footnote.createAndFill();
				if (!node) return null;
				const tr = state.tr.replaceRangeWith(
					start,
					end,
					node,
				);
				return tr.setSelection(
					NodeSelection.create(tr.doc, start),
				);
			}),
		);

	// Table: typing "||| " at the start of a block drops a 3×3 table.
	if (table)
		rules.push(
			new InputRule(
				/^\|\|\|\s$/,
				(state, match, start, end) => {
					const created = createTable(schema);
					if (!created) return null;
					return state.tr
						.delete(start, end)
						.replaceSelectionWith(created);
				},
			),
		);

	return inputRules({ rules });
}
