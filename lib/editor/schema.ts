// The editor's document schema: prosemirror-markdown's CommonMark schema,
// extended with GFM constructs. We build a new Schema from its spec so the
// custom MarkdownParser/serializer (markdown.ts) bind to THIS schema.
//
// GFM additions:
//  - strikethrough mark (~~…~~)
//  - `checked` attr on list_item (task lists: null = plain, true/false = task)
//  - footnote node (inline atom; its block content is edited via a NodeView)
import { schema as cm } from "prosemirror-markdown";
import { Schema, type NodeSpec } from "prosemirror-model";
import { tableNodes } from "prosemirror-tables";

const listItem = cm.spec.nodes.get("list_item") as NodeSpec;

const footnote: NodeSpec = {
  group: "inline",
  inline: true,
  atom: true, // treated as a leaf in the main view; body edited in a sub-editor
  content: "block+", // markdown-it wraps footnote bodies in a paragraph
  toDOM: () => ["footnote", 0],
  parseDOM: [{ tag: "footnote" }],
};

// GFM tables. Cells are single-line inline (GFM can't represent multi-block
// cells), with a per-cell `align` carried as a text-align style.
const tNodes = tableNodes({
  tableGroup: "block",
  cellContent: "inline*",
  cellAttributes: {
    align: {
      default: null,
      getFromDOM: (dom) => (dom as HTMLElement).style.textAlign || null,
      setDOMAttr: (value, attrs) => {
        if (value) attrs.style = `text-align: ${value};${(attrs.style as string) ?? ""}`;
      },
    },
  },
});

export const schema = new Schema({
  nodes: cm.spec.nodes
    .update("list_item", {
      ...listItem,
      attrs: { checked: { default: null } },
      toDOM(node) {
        // Editor-side rendering uses a NodeView (interactive checkbox); this
        // toDOM is what DOMSerializer emits on export, so render a static glyph.
        if (node.attrs.checked === null) return ["li", 0];
        return [
          "li",
          { class: "task-list-item", "data-checked": String(node.attrs.checked) },
          ["span", { class: "task-checkbox" }, node.attrs.checked ? "☑ " : "☐ "],
          ["div", 0],
        ];
      },
    })
    .addToEnd("footnote", footnote)
    .append(tNodes),
  marks: cm.spec.marks.addToEnd("strikethrough", {
    parseDOM: [
      { tag: "s" },
      { tag: "del" },
      { tag: "strike" },
      { style: "text-decoration=line-through" },
    ],
    toDOM() {
      return ["s", 0];
    },
  }),
});
