import MarkdownIt from 'markdown-it';
import {
	MarkdownParser,
	MarkdownSerializer,
	defaultMarkdownParser as dP,
	defaultMarkdownSerializer as dS,
} from 'prosemirror-markdown';
import type { Attrs, Node as PMNode, NodeType } from 'prosemirror-model';
import footnotePlugin from './footnote-md';
import { schema } from './schema';

type Token = ReturnType<MarkdownIt['parse']>[number];

let footnoteBodies = new Map<number, Token[]>();

function taskListRule(md: MarkdownIt) {
	md.core.ruler.after('inline', 'task-lists', (state) => {
		const tokens = state.tokens;
		for (let i = 2; i < tokens.length; i++) {
			const inline = tokens[i];
			if (!inline || inline.type !== 'inline') continue;
			const pOpen = tokens[i - 1];
			const liOpen = tokens[i - 2];
			if (
				pOpen?.type !== 'paragraph_open' ||
				liOpen?.type !== 'list_item_open'
			)
				continue;
			const m = /^\[( |x|X)\]\s/.exec(inline.content);
			if (!m) continue;
			liOpen.attrSet(
				'checked',
				m[1] === ' ' ? 'false' : 'true',
			);
			// preserve task list roundtrips
			const n = m[0].length;
			inline.content = inline.content.slice(n);
			const child = inline.children?.[0];
			if (child && child.type === 'text')
				child.content = child.content.slice(n);
		}
		return true;
	});
}

function extractFootnotes(md: MarkdownIt) {
	md.core.ruler.push('extract-footnotes', (state) => {
		const tokens = state.tokens;
		for (let i = 0; i < tokens.length; i++) {
			if (tokens[i]?.type !== 'footnote_block_open') continue;
			let id: number | null = null;
			let buf: Token[] = [];
			let j = i;
			for (; j < tokens.length; j++) {
				const t = tokens[j];
				if (!t) break;
				if (t.type === 'footnote_open') {
					id =
						(
							t.meta as {
								id?: number;
							} | null
						)?.id ?? null;
					buf = [];
				} else if (t.type === 'footnote_close') {
					if (id != null)
						footnoteBodies.set(id, buf);
					id = null;
				} else if (
					id !== null &&
					t.type !== 'footnote_anchor'
				) {
					buf.push(t);
				}
				if (t.type === 'footnote_block_close') {
					j++;
					break;
				}
			}
			tokens.splice(i, j - i);
			break;
		}
		return true;
	});
}

const alignFromStyle = (s: string | null): string | null =>
	s?.match(/text-align:\s*(left|center|right)/)?.[1] ?? null;

const md = new MarkdownIt('commonmark', { html: false })
	.enable(['strikethrough', 'table'])
	.set({ linkify: true })
	.enable('linkify')
	.use(taskListRule)
	.use(footnotePlugin)
	.use(extractFootnotes);

const parser = new MarkdownParser(schema, md, {
	...dP.tokens,
	s: { mark: 'strikethrough' },
	list_item: {
		block: 'list_item',
		getAttrs: (tok) => {
			const c = tok.attrGet('checked');
			return { checked: c == null ? null : c === 'true' };
		},
	},
	// ignore footnote backlinks
	footnote_anchor: { ignore: true, noCloseToken: true },
	// table sections absent
	table: { block: 'table' },
	thead: { ignore: true },
	tbody: { ignore: true },
	tr: { block: 'table_row' },
	th: {
		block: 'table_header',
		getAttrs: (t) => ({
			align: alignFromStyle(t.attrGet('style')),
		}),
	},
	td: {
		block: 'table_cell',
		getAttrs: (t) => ({
			align: alignFromStyle(t.attrGet('style')),
		}),
	},
});

interface ParseState {
	openNode(type: NodeType, attrs?: Attrs): void;
	closeNode(): void;
	parseTokens(tokens: Token[]): void;
}
(
	parser as unknown as {
		tokenHandlers: Record<
			string,
			(s: ParseState, t: Token) => void
		>;
	}
).tokenHandlers.footnote_ref = (state, tok) => {
	const footnote = schema.nodes.footnote;
	if (!footnote) return;
	state.openNode(footnote);
	const id = (tok.meta as { id?: number } | null)?.id;
	const body = id == null ? undefined : footnoteBodies.get(id);
	if (body && body.length) state.parseTokens(body);
	// prosemirror inserts empty paragraphs
	state.closeNode();
};

type NodeSerializer = (typeof dS.nodes)[string];

// serializer lacks tables
const alignSep = (a: unknown): string =>
	a === 'center'
		? ':---:'
		: a === 'right'
			? '---:'
			: a === 'left'
				? ':---'
				: '---';

function serializeCell(
	state: Parameters<NodeSerializer>[0],
	cell: PMNode,
): string {
	const s = state as unknown as { out: string };
	const saved = s.out;
	s.out = '';
	state.renderInline(cell);
	const text = s.out;
	s.out = saved;
	return text.replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();
}

const serializeTable: NodeSerializer = (state, node) => {
	const rows: { cells: string[]; aligns: unknown[] }[] = [];
	node.forEach((row) => {
		const cells: string[] = [];
		const aligns: unknown[] = [];
		row.forEach((cell) => {
			cells.push(serializeCell(state, cell));
			aligns.push(cell.attrs.align);
		});
		rows.push({ cells, aligns });
	});
	const head = rows[0];
	if (!head) return;
	const cols = Math.max(...rows.map((r) => r.cells.length));
	const pad = (arr: string[]) =>
		Array.from({ length: cols }, (_, i) => arr[i] ?? '');
	const line = (cells: string[]) => '| ' + pad(cells).join(' | ') + ' |';
	state.write(line(head.cells) + '\n');
	state.write('| ' + pad(head.aligns.map(alignSep)).join(' | ') + ' |\n');
	for (const row of rows.slice(1)) state.write(line(row.cells) + '\n');
	state.closeBlock(node);
};

const baseNodes: Record<string, NodeSerializer> = {
	...dS.nodes,
	list_item(state, node) {
		if (node.attrs.checked !== null)
			state.write(node.attrs.checked ? '[x] ' : '[ ] ');
		state.renderContent(node);
	},
	table: serializeTable,
};

const baseMarks = {
	...dS.marks,
	strikethrough: {
		open: '~~',
		close: '~~',
		mixable: true,
		expelEnclosingWhitespace: true,
	},
};

function makeSerializer(notes: PMNode[] | null) {
	return new MarkdownSerializer(
		{
			...baseNodes,
			footnote(state, node) {
				if (notes) {
					notes.push(node);
					state.write(`[^${notes.length}]`);
				} else {
					// avoid nested footnotes
					state.write('[^?]');
				}
			},
		},
		baseMarks,
	);
}

export function parseMarkdown(markdown: string): PMNode {
	footnoteBodies = new Map();
	return parser.parse(markdown) ?? schema.topNodeType.createAndFill()!;
}

export function serializeDoc(doc: PMNode): string {
	const notes: PMNode[] = [];
	let out = makeSerializer(notes).serialize(doc);
	if (notes.length) {
		const bodySer = makeSerializer(null);
		const defs = notes.map((node, i) => {
			const bodyDoc = schema.topNodeType.create(
				null,
				node.content,
			);
			const body = bodySer
				.serialize(bodyDoc)
				.trim()
				.replace(/\n/g, '\n    ');
			return `[^${i + 1}]: ${body}`;
		});
		out = out.replace(/\s+$/, '') + '\n\n' + defs.join('\n') + '\n';
	}
	return out;
}
