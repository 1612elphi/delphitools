// The editor's document schema. We use prosemirror-markdown's CommonMark schema
// directly — it already defines paragraph, heading, blockquote, code_block,
// bullet_list/ordered_list/list_item, horizontal_rule, image, hard_break and the
// em/strong/link/code marks — and the default parser/serializer are bound to it,
// giving a lossless Markdown round-trip with no schema-mismatch.
export { schema } from "prosemirror-markdown";
