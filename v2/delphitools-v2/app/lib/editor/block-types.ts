// The block types offered by the gutter's click-to-convert menu, each paired
// with the ProseMirror command that turns the current block into it.
import { setBlockType, wrapIn } from 'prosemirror-commands';
import { wrapInList } from 'prosemirror-schema-list';
import type { Node as PMNode, NodeType, Schema } from 'prosemirror-model';
import type { Command } from 'prosemirror-state';

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
	const {
		paragraph,
		heading,
		bullet_list,
		ordered_list,
		blockquote,
		code_block,
	} = schema.nodes;
	const choices: BlockChoice[] = [];

	if (paragraph)
		choices.push({
			label: 'Paragraph',
			command: setBlockType(paragraph),
			isActive: (node) => node.type === paragraph,
		});

	if (heading)
		for (const level of [1, 2, 3, 4, 5, 6]) {
			choices.push({
				label: `Heading ${level}`,
				command: setBlockType(heading, { level }),
				isActive: (node) =>
					node.type === heading &&
					node.attrs.level === level,
			});
		}

	if (bullet_list)
		choices.push({
			label: 'Bullet list',
			command: wrapInList(bullet_list),
			isActive: (node) => node.type === bullet_list,
			wrap: true,
			listType: bullet_list,
		});

	if (ordered_list)
		choices.push({
			label: 'Numbered list',
			command: wrapInList(ordered_list),
			isActive: (node) => node.type === ordered_list,
			wrap: true,
			listType: ordered_list,
		});

	if (blockquote)
		choices.push({
			label: 'Quote',
			command: wrapIn(blockquote),
			isActive: (node) => node.type === blockquote,
			wrap: true,
		});

	if (code_block)
		choices.push({
			label: 'Code block',
			command: setBlockType(code_block),
			isActive: (node) => node.type === code_block,
		});

	return choices;
}
