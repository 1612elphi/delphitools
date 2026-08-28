import { schema as cm } from 'prosemirror-markdown';
import { Schema, type NodeSpec } from 'prosemirror-model';
import { tableNodes } from 'prosemirror-tables';

const listItem = cm.spec.nodes.get('list_item') as NodeSpec;

const footnote: NodeSpec = {
	group: 'inline',
	inline: true,
	atom: true,
	// markdown uses paragraph bodies
	content: 'block+',
	toDOM: () => ['footnote', 0],
	parseDOM: [{ tag: 'footnote' }],
};

// gfm cells are inline
const tNodes = tableNodes({
	tableGroup: 'block',
	cellContent: 'inline*',
	cellAttributes: {
		align: {
			default: null,
			getFromDOM: (dom) => dom.style.textAlign || null,
			setDOMAttr: (value, attrs) => {
				if (value)
					attrs.style = `text-align: ${value as string};${(attrs.style as string) ?? ''}`;
			},
		},
	},
});

export const schema = new Schema({
	nodes: cm.spec.nodes
		.update('list_item', {
			...listItem,
			attrs: { checked: { default: null } },
			toDOM(node) {
				// exports omit node views
				if (node.attrs.checked === null)
					return ['li', 0];
				return [
					'li',
					{
						class: 'task-list-item',
						'data-checked': String(
							node.attrs.checked,
						),
					},
					[
						'span',
						{ class: 'task-checkbox' },
						node.attrs.checked
							? '☑ '
							: '☐ ',
					],
					['div', 0],
				];
			},
		})
		.addToEnd('footnote', footnote)
		.append(tNodes),
	marks: cm.spec.marks.addToEnd('strikethrough', {
		parseDOM: [
			{ tag: 's' },
			{ tag: 'del' },
			{ tag: 'strike' },
			{ style: 'text-decoration=line-through' },
		],
		toDOM() {
			return ['s', 0];
		},
	}),
});
