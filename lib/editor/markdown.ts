// Markdown is the single source of truth: this is the only place we parse a
// Markdown string into a ProseMirror doc and serialise a doc back to Markdown.
import {
  defaultMarkdownParser,
  defaultMarkdownSerializer,
  schema,
} from "prosemirror-markdown";
import type { Node as PMNode } from "prosemirror-model";

export function parseMarkdown(markdown: string): PMNode {
  // parse() returns a valid doc (one empty paragraph for ""), but guard anyway.
  return defaultMarkdownParser.parse(markdown) ?? schema.topNodeType.createAndFill()!;
}

export function serializeDoc(doc: PMNode): string {
  return defaultMarkdownSerializer.serialize(doc);
}
