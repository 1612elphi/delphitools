// The modular per-block gutter. Each top-level block gets a row of metadata
// rendered in an overlay column to the left of the text. Adding a new field is
// just pushing one GutterField; the editor reads `enabledFields` to pick which.
import type { Node as PMNode } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";

export interface GutterField {
  id: string;
  label: string;
  render: (node: PMNode) => string;
}

function wordCount(node: PMNode): number {
  const text = node.textContent.trim();
  return text ? text.split(/\s+/).length : 0;
}

export const GUTTER_FIELDS: GutterField[] = [
  { id: "words", label: "words", render: (n) => String(wordCount(n)) },
  { id: "chars", label: "chars", render: (n) => String(n.textContent.length) },
  // Add more here later — e.g. reading time — and they appear as toggles automatically.
];

export function blockType(node: PMNode): string {
  switch (node.type.name) {
    case "heading":
      return `HEADING ${node.attrs.level as number}`;
    case "paragraph":
      return "PARAGRAPH";
    case "bullet_list":
      return "BULLET LIST";
    case "ordered_list":
      return "NUMBERED LIST";
    case "blockquote":
      return "QUOTE";
    case "code_block":
      return "CODE";
    case "table":
      return "TABLE";
    case "horizontal_rule":
      return "RULE";
    case "image":
      return "IMAGE";
    default:
      return node.type.name.replace(/_/g, " ").toUpperCase();
  }
}

export interface GutterRow {
  key: string;
  /** document position just before this top-level block */
  pos: number;
  top: number;
  type: string;
  fields: { id: string; label: string; value: string }[];
}

/** One read pass: measure every top-level block's offset + metadata. */
export function measureGutter(view: EditorView, enabledFields: string[]): GutterRow[] {
  const rows: GutterRow[] = [];
  const enabled = new Set(enabledFields);
  const active = GUTTER_FIELDS.filter((f) => enabled.has(f.id));

  view.state.doc.forEach((node, offset, index) => {
    const dom = view.nodeDOM(offset);
    if (!(dom instanceof HTMLElement)) return;
    rows.push({
      key: `${index}-${node.type.name}`,
      pos: offset,
      top: dom.offsetTop,
      type: blockType(node),
      fields: active.map((f) => ({ id: f.id, label: f.label, value: f.render(node) })),
    });
  });

  return rows;
}
