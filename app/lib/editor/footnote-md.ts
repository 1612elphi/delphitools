// Vendored from markdown-it-footnote 4.0.0 (MIT, markdown-it/markdown-it-footnote),
// parse rules only — ProseMirror consumes the tokens, so the renderer partials are
// dropped. The emitted stream (footnote_block_open / footnote_open / footnote_anchor
// / …) is exactly what markdown.ts's extractFootnotes rule expects.
import type MarkdownIt from 'markdown-it';
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs';
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs';
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs';
import type Token from 'markdown-it/lib/token.mjs';

interface FootnoteEntry {
	label?: string;
	count?: number;
	content?: string;
	tokens?: Token[];
}

interface FootnoteEnv {
	footnotes?: {
		refs?: Record<string, number>;
		list?: FootnoteEntry[];
	};
}

export default function footnotePlugin(md: MarkdownIt): void {
	const parseLinkLabel = md.helpers.parseLinkLabel;
	const isSpace = md.utils.isSpace;

	// Process footnote block definitions ("[^label]: body")
	function footnote_def(
		state: StateBlock,
		startLine: number,
		endLine: number,
		silent: boolean,
	): boolean {
		const start =
			state.bMarks[startLine]! + state.tShift[startLine]!;
		const max = state.eMarks[startLine]!;

		// line should be at least 5 chars - "[^x]:"
		if (start + 4 > max) return false;

		if (state.src.charCodeAt(start) !== 0x5b /* [ */) return false;
		if (state.src.charCodeAt(start + 1) !== 0x5e /* ^ */)
			return false;

		let pos;

		for (pos = start + 2; pos < max; pos++) {
			if (state.src.charCodeAt(pos) === 0x20) return false;
			if (state.src.charCodeAt(pos) === 0x5d /* ] */) {
				break;
			}
		}

		if (pos === start + 2) return false; // no empty footnote labels
		if (
			pos + 1 >= max ||
			state.src.charCodeAt(++pos) !== 0x3a /* : */
		)
			return false;
		if (silent) return true;
		pos++;

		const env = state.env as FootnoteEnv;
		env.footnotes ??= {};
		env.footnotes.refs ??= {};
		const label = state.src.slice(start + 2, pos - 2);
		env.footnotes.refs[`:${label}`] = -1;

		const token_fref_o = new state.Token(
			'footnote_reference_open',
			'',
			1,
		);
		token_fref_o.meta = { label };
		token_fref_o.level = state.level++;
		state.tokens.push(token_fref_o);

		const oldBMark = state.bMarks[startLine]!;
		const oldTShift = state.tShift[startLine]!;
		const oldSCount = state.sCount[startLine]!;
		const oldParentType = state.parentType;

		const posAfterColon = pos;
		const initial =
			state.sCount[startLine]! +
			pos -
			(state.bMarks[startLine]! + state.tShift[startLine]!);
		let offset = initial;

		while (pos < max) {
			const ch = state.src.charCodeAt(pos);

			if (isSpace(ch)) {
				if (ch === 0x09) {
					offset += 4 - (offset % 4);
				} else {
					offset++;
				}
			} else {
				break;
			}

			pos++;
		}

		state.tShift[startLine] = pos - posAfterColon;
		state.sCount[startLine] = offset - initial;

		state.bMarks[startLine] = posAfterColon;
		state.blkIndent += 4;
		state.parentType = 'footnote' as StateBlock['parentType'];

		if (state.sCount[startLine] < state.blkIndent) {
			state.sCount[startLine] =
				state.sCount[startLine] + state.blkIndent;
		}

		state.md.block.tokenize(state, startLine, endLine);

		state.parentType = oldParentType;
		state.blkIndent -= 4;
		state.tShift[startLine] = oldTShift;
		state.sCount[startLine] = oldSCount;
		state.bMarks[startLine] = oldBMark;

		const token_fref_c = new state.Token(
			'footnote_reference_close',
			'',
			-1,
		);
		token_fref_c.level = --state.level;
		state.tokens.push(token_fref_c);

		return true;
	}

	// Process inline footnotes (^[...])
	function footnote_inline(state: StateInline, silent: boolean): boolean {
		const max = state.posMax;
		const start = state.pos;

		if (start + 2 >= max) return false;
		if (state.src.charCodeAt(start) !== 0x5e /* ^ */) return false;
		if (state.src.charCodeAt(start + 1) !== 0x5b /* [ */)
			return false;

		const labelStart = start + 2;
		const labelEnd = parseLinkLabel(state, start + 1);

		// parser failed to find ']', so it's not a valid note
		if (labelEnd < 0) return false;

		// We found the end of the link, and know for a fact it's a valid link;
		// so all that's left to do is to call tokenizer.
		if (!silent) {
			const env = state.env as FootnoteEnv;
			env.footnotes ??= {};
			env.footnotes.list ??= [];
			const footnoteId = env.footnotes.list.length;
			const tokens: Token[] = [];

			state.md.inline.parse(
				state.src.slice(labelStart, labelEnd),
				state.md,
				state.env,
				tokens,
			);

			const token = state.push('footnote_ref', '', 0);
			token.meta = { id: footnoteId };

			env.footnotes.list[footnoteId] = {
				content: state.src.slice(labelStart, labelEnd),
				tokens,
			};
		}

		state.pos = labelEnd + 1;
		state.posMax = max;
		return true;
	}

	// Process footnote references ([^...])
	function footnote_ref(state: StateInline, silent: boolean): boolean {
		const max = state.posMax;
		const start = state.pos;

		// should be at least 4 chars - "[^x]"
		if (start + 3 > max) return false;

		const env = state.env as FootnoteEnv;
		if (!env.footnotes?.refs) return false;
		if (state.src.charCodeAt(start) !== 0x5b /* [ */) return false;
		if (state.src.charCodeAt(start + 1) !== 0x5e /* ^ */)
			return false;

		let pos;

		for (pos = start + 2; pos < max; pos++) {
			if (state.src.charCodeAt(pos) === 0x20) return false;
			if (state.src.charCodeAt(pos) === 0x0a) return false;
			if (state.src.charCodeAt(pos) === 0x5d /* ] */) {
				break;
			}
		}

		if (pos === start + 2) return false; // no empty footnote labels
		if (pos >= max) return false;
		pos++;

		const label = state.src.slice(start + 2, pos - 1);
		const refId = env.footnotes.refs[`:${label}`];
		if (typeof refId === 'undefined') return false;

		if (!silent) {
			env.footnotes.list ??= [];

			let footnoteId;

			if (refId < 0) {
				footnoteId = env.footnotes.list.length;
				env.footnotes.list[footnoteId] = {
					label,
					count: 0,
				};
				env.footnotes.refs[`:${label}`] = footnoteId;
			} else {
				footnoteId = refId;
			}

			const entry = env.footnotes.list[footnoteId]!;
			const footnoteSubId = entry.count ?? 0;
			entry.count = footnoteSubId + 1;

			const token = state.push('footnote_ref', '', 0);
			token.meta = {
				id: footnoteId,
				subId: footnoteSubId,
				label,
			};
		}

		state.pos = pos;
		state.posMax = max;
		return true;
	}

	// Glue footnote tokens to end of token stream
	function footnote_tail(state: StateCore): void {
		let tokens: Token[] | undefined;
		let current: Token[] = [];
		let currentLabel = '';
		let insideRef = false;
		const refTokens: Record<string, Token[]> = {};

		const env = state.env as FootnoteEnv;
		if (!env.footnotes) return;

		state.tokens = state.tokens.filter((tok) => {
			if (tok.type === 'footnote_reference_open') {
				insideRef = true;
				current = [];
				currentLabel = (tok.meta as { label: string })
					.label;
				return false;
			}
			if (tok.type === 'footnote_reference_close') {
				insideRef = false;
				// prepend ':' to avoid conflict with Object.prototype members
				refTokens[':' + currentLabel] = current;
				return false;
			}
			if (insideRef) current.push(tok);
			return !insideRef;
		});

		if (!env.footnotes.list) return;
		const list = env.footnotes.list;

		state.tokens.push(
			new state.Token('footnote_block_open', '', 1),
		);

		for (let i = 0, l = list.length; i < l; i++) {
			const entry = list[i]!;
			const token_fo = new state.Token(
				'footnote_open',
				'',
				1,
			);
			token_fo.meta = { id: i, label: entry.label };
			state.tokens.push(token_fo);

			if (entry.tokens) {
				tokens = [];

				const token_po = new state.Token(
					'paragraph_open',
					'p',
					1,
				);
				token_po.block = true;
				tokens.push(token_po);

				const token_i = new state.Token(
					'inline',
					'',
					0,
				);
				token_i.children = entry.tokens;
				token_i.content = entry.content ?? '';
				tokens.push(token_i);

				const token_pc = new state.Token(
					'paragraph_close',
					'p',
					-1,
				);
				token_pc.block = true;
				tokens.push(token_pc);
			} else if (entry.label) {
				tokens = refTokens[`:${entry.label}`];
			}

			if (tokens) state.tokens = state.tokens.concat(tokens);

			let lastParagraph: Token | null;

			if (
				state.tokens[state.tokens.length - 1]?.type ===
				'paragraph_close'
			) {
				lastParagraph = state.tokens.pop()!;
			} else {
				lastParagraph = null;
			}

			const t = (entry.count ?? 0) > 0 ? entry.count! : 1;
			for (let j = 0; j < t; j++) {
				const token_a = new state.Token(
					'footnote_anchor',
					'',
					0,
				);
				token_a.meta = {
					id: i,
					subId: j,
					label: entry.label,
				};
				state.tokens.push(token_a);
			}

			if (lastParagraph) {
				state.tokens.push(lastParagraph);
			}

			state.tokens.push(
				new state.Token('footnote_close', '', -1),
			);
		}

		state.tokens.push(
			new state.Token('footnote_block_close', '', -1),
		);
	}

	md.block.ruler.before('reference', 'footnote_def', footnote_def, {
		alt: ['paragraph', 'reference'],
	});
	md.inline.ruler.after('image', 'footnote_inline', footnote_inline);
	md.inline.ruler.after('footnote_inline', 'footnote_ref', footnote_ref);
	md.core.ruler.after('inline', 'footnote_tail', footnote_tail);
}
