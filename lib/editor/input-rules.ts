// Live-preview input rules: typing Markdown shorthand transforms the block/inline
// in place (the markers are consumed, never stored), so "# " becomes a heading,
// "**x**" becomes bold, etc. — the iA-Writer / Typora feel.
import {
  InputRule,
  inputRules,
  textblockTypeInputRule,
  wrappingInputRule,
} from "prosemirror-inputrules";
import type { MarkType, Node as PMNode, Schema } from "prosemirror-model";
import { NodeSelection } from "prosemirror-state";

function createTable(schema: Schema, rows = 3, cols = 3): PMNode | null {
  const { table, table_row, table_cell, table_header } = schema.nodes;
  if (!table || !table_row || !table_cell || !table_header) return null;
  const cellsOf = (type: typeof table_cell) =>
    Array.from({ length: cols }, () => type.createAndFill()).filter(Boolean) as PMNode[];
  const headerRow = table_row.create(null, cellsOf(table_header));
  const bodyRows = Array.from({ length: rows - 1 }, () => table_row.create(null, cellsOf(table_cell)));
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
  const n = schema.nodes;
  const m = schema.marks;

  // Block rules (fire on the trailing space / closing fence).
  if (n.blockquote) rules.push(wrappingInputRule(/^\s*>\s$/, n.blockquote));
  if (n.ordered_list)
    rules.push(
      wrappingInputRule(
        /^(\d+)\.\s$/,
        n.ordered_list,
        (match) => ({ order: +match[1] }),
        (match, node) => node.childCount + (node.attrs.order as number) === +match[1],
      ),
    );
  if (n.bullet_list) rules.push(wrappingInputRule(/^\s*([-+*])\s$/, n.bullet_list));
  if (n.code_block) rules.push(textblockTypeInputRule(/^```$/, n.code_block));
  if (n.heading)
    rules.push(
      textblockTypeInputRule(/^(#{1,6})\s$/, n.heading, (match) => ({ level: match[1].length })),
    );

  // Inline mark rules (fire on the closing delimiter).
  if (m.strong) rules.push(markInputRule(/\*\*([^*]+)\*\*$/, m.strong));
  if (m.em) {
    // Single * not adjacent to another * (so it doesn't fight **bold**), or _italic_.
    rules.push(markInputRule(/(?<![*\w])\*([^*\s][^*]*)\*$/, m.em));
    rules.push(markInputRule(/(?<![_\w])_([^_\s][^_]*)_$/, m.em));
  }
  if (m.code) rules.push(markInputRule(/(?<!`)`([^`]+)`$/, m.code));
  if (m.strikethrough) rules.push(markInputRule(/~~([^~]+)~~$/, m.strikethrough));

  // Task list: typing "[ ] " / "[x] " at the start of a list item toggles it.
  if (n.list_item)
    rules.push(
      new InputRule(/^\[( |x|X)\]\s$/, (state, match, start, end) => {
        const $from = state.selection.$from;
        const li = $from.node(-1);
        if (!li || li.type !== n.list_item) return null;
        const liPos = $from.before(-1);
        return state.tr
          .delete(start, end)
          .setNodeMarkup(liPos, undefined, { ...li.attrs, checked: match[1] !== " " });
      }),
    );

  // Footnote: typing "[^]" drops an empty footnote and selects it (opens the editor).
  if (n.footnote)
    rules.push(
      new InputRule(/\[\^\]$/, (state, _match, start, end) => {
        const footnote = n.footnote.createAndFill();
        if (!footnote) return null;
        const tr = state.tr.replaceRangeWith(start, end, footnote);
        return tr.setSelection(NodeSelection.create(tr.doc, start));
      }),
    );

  // Table: typing "||| " at the start of a block drops a 3×3 table.
  if (n.table)
    rules.push(
      new InputRule(/^\|\|\|\s$/, (state, _match, start, end) => {
        const table = createTable(schema);
        if (!table) return null;
        return state.tr.delete(start, end).replaceSelectionWith(table);
      }),
    );

  return inputRules({ rules });
}
