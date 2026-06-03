// Live-preview input rules: typing Markdown shorthand transforms the block/inline
// in place (the markers are consumed, never stored), so "# " becomes a heading,
// "**x**" becomes bold, etc. — the iA-Writer / Typora feel.
import {
  InputRule,
  inputRules,
  textblockTypeInputRule,
  wrappingInputRule,
} from "prosemirror-inputrules";
import type { MarkType, Schema } from "prosemirror-model";

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

  return inputRules({ rules });
}
