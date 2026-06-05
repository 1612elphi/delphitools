// The block types offered by the gutter's click-to-convert menu, each paired
// with the ProseMirror command that turns the current block into it.
import { setBlockType, wrapIn } from "prosemirror-commands";
import { wrapInList } from "prosemirror-schema-list";
import type { Node as PMNode, NodeType, Schema } from "prosemirror-model";
import type { Command } from "prosemirror-state";

export interface BlockChoice {
  label: string;
  command: Command;
  isActive: (node: PMNode) => boolean;
  /** wraps the block (list/quote) — normalise a styled block to a paragraph first */
  wrap?: boolean;
  /** for the list choices — lets us swap an existing list's type in place */
  listType?: NodeType;
}

export function blockChoices(schema: Schema): BlockChoice[] {
  const n = schema.nodes;
  const choices: BlockChoice[] = [];

  if (n.paragraph)
    choices.push({
      label: "Paragraph",
      command: setBlockType(n.paragraph),
      isActive: (node) => node.type === n.paragraph,
    });

  if (n.heading)
    for (const level of [1, 2, 3, 4, 5, 6]) {
      choices.push({
        label: `Heading ${level}`,
        command: setBlockType(n.heading, { level }),
        isActive: (node) => node.type === n.heading && node.attrs.level === level,
      });
    }

  if (n.bullet_list)
    choices.push({
      label: "Bullet list",
      command: wrapInList(n.bullet_list),
      isActive: (node) => node.type === n.bullet_list,
      wrap: true,
      listType: n.bullet_list,
    });

  if (n.ordered_list)
    choices.push({
      label: "Numbered list",
      command: wrapInList(n.ordered_list),
      isActive: (node) => node.type === n.ordered_list,
      wrap: true,
      listType: n.ordered_list,
    });

  if (n.blockquote)
    choices.push({
      label: "Quote",
      command: wrapIn(n.blockquote),
      isActive: (node) => node.type === n.blockquote,
      wrap: true,
    });

  if (n.code_block)
    choices.push({
      label: "Code block",
      command: setBlockType(n.code_block),
      isActive: (node) => node.type === n.code_block,
    });

  return choices;
}
