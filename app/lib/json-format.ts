/**
 * JSON formatting core: a parse wrapper that recovers the error location from
 * the engine's message, indentation presets, and a tree model for the
 * collapsible viewer. No DOM, no Ember — the component in
 * app/components/tools/json-formatter.gts and the unit tests both drive these.
 */

export const INDENT_OPTIONS = [
	{ id: '2', label: '2 spaces' },
	{ id: '4', label: '4 spaces' },
	{ id: 'tab', label: 'Tabs' },
	{ id: 'minify', label: 'Minify' },
] as const;

export type IndentId = (typeof INDENT_OPTIONS)[number]['id'];

export interface JsonErrorInfo {
	/** The engine's message, verbatim. */
	message: string;
	/** 1-based. */
	line: number;
	/** 1-based. */
	column: number;
	/** 0-based character offset. */
	position: number;
}

export type JsonParseResult =
	{ ok: true; value: unknown } | { ok: false; error: JsonErrorInfo };

/** Where a 0-based offset sits, in 1-based line/column terms. */
export function positionInfo(
	source: string,
	position: number,
): { line: number; column: number } {
	const clamped = Math.max(0, Math.min(position, source.length));
	const before = source.slice(0, clamped);
	const line = (before.match(/\n/g) ?? []).length + 1;
	const column = clamped - (before.lastIndexOf('\n') + 1) + 1;
	return { line, column };
}

/** Where a 1-based line/column sits, as a 0-based offset. */
export function positionFromLineColumn(
	source: string,
	line: number,
	column: number,
): number {
	let offset = 0;
	for (let current = 1; current < line; current++) {
		const next = source.indexOf('\n', offset);
		if (next === -1) return offset;
		offset = next + 1;
	}
	return Math.min(offset + column - 1, source.length);
}

/**
 * The window V8 echoes in "Unexpected token 'x', ...\"ctx\"... is not valid
 * JSON" is up to ten characters either side of the offending token, string-
 * escaped, with ellipses when clipped. Undo the escapes so the window can be
 * matched back into the source. (Observed on V8 14 / Chrome 151; the grammar
 * changed in V8 10.x when error messages started quoting the input.)
 */
function unescapeSnippets(escaped: string): string {
	return escaped
		.replace(/\\u([0-9a-fA-F]{4})/g, (_w, hex: string) =>
			String.fromCharCode(parseInt(hex, 16)),
		)
		.replace(/\\(.)/gs, (_w, escape: string) => {
			switch (escape) {
				case 'n':
					return '\n';
				case 'r':
					return '\r';
				case 't':
					return '\t';
				case 'b':
					return '\b';
				case 'f':
					return '\f';
				default:
					return escape;
			}
		});
}

/**
 * The token-echo grammar carries no position: recover it by matching the
 * echoed window back onto the source. Because the token's index inside the
 * window is unknown (the left context is "up to ten" characters), every
 * occurrence of the token inside the window is a candidate; the full window
 * must then coincide at the candidate site, and the longest prefix wins — a
 * one-character prefix like `" ` recurs all over any real document.
 */
function recoverUnexpectedToken(
	source: string,
	token: string,
	echoed: string,
): number | null {
	for (let i = echoed.length - token.length; i >= 0; i--) {
		if (!echoed.startsWith(token, i)) continue;
		let from = source.indexOf(echoed.slice(0, i));
		while (from !== -1) {
			const position = from + i;
			if (source.startsWith(echoed, from)) return position;
			from = source.indexOf(echoed.slice(0, i), from + 1);
		}
	}
	return null;
}

/** Dequote `'}'` / `'\n'` as V8 quotes its token, then unescape. */
function decodeToken(quoted: string): string {
	const inner =
		quoted.length >= 2 &&
		quoted.startsWith("'") &&
		quoted.endsWith("'")
			? quoted.slice(1, -1)
			: quoted;
	return unescapeSnippets(inner);
}

const UNEXPECTED_TOKEN =
	/^Unexpected token (.+?), (?:\.\.\.)?"([\s\S]*?)"(?:\.\.\.)? is not valid JSON$/s;

// JavaScriptCore: `JSON Parse error: Unexpected identifier "tru"`, no
// location. The identifier is the offending token, so search for it.
const JSC_IDENTIFIER = /Unexpected identifier "([^"]+)"/;

/**
 * Error location extraction, per engine message grammar:
 *   V8          "Expected … / Unterminated … / Unexpected non-whitespace …
 *                in JSON at position 12 (line 2 column 4)"
 *   V8 (echo)   "Unexpected token 'x', \"ctx\" is not valid JSON" — no
 *               position at all; recovered from the echoed window
 *   SpiderMonkey "JSON.parse: … at line 2 column 4 of the JSON data"
 *   JavaScriptCore "JSON Parse error: Unexpected identifier \"x\""
 * Anything unrecognised falls back to the first byte. Line/column derivation
 * always comes from the source itself, so the message grammar never reaches
 * the component. All three fields always agree with each other: grammars that
 * carry only a position get line/column derived, and a grammar carrying both
 * gets the offset derived back from its line/column.
 */
export function errorInfo(source: string, message: string): JsonErrorInfo {
	const positionMatch = /position (\d+)/.exec(message);
	const lineColumnMatch = /\(line (\d+) column (\d+)\)/.exec(message);
	if (lineColumnMatch) {
		const line = Number(lineColumnMatch[1]);
		const column = Number(lineColumnMatch[2]);
		// The offset is derived from line/column even when the same sentence
		// carries "position N": line/column is what the UI reports, and the
		// position must agree with it.
		const position = positionFromLineColumn(source, line, column);
		return { message, line, column, position };
	}

	const smMatch = /at line (\d+) column (\d+)/.exec(message);
	if (smMatch) {
		const line = Number(smMatch[1]);
		const column = Number(smMatch[2]);
		return {
			message,
			line,
			column,
			position: positionFromLineColumn(source, line, column),
		};
	}

	if (positionMatch) {
		const position = Number(positionMatch[1]);
		return { message, ...positionInfo(source, position), position };
	}

	const tokenMatch = UNEXPECTED_TOKEN.exec(message);
	if (tokenMatch) {
		const position = recoverUnexpectedToken(
			source,
			decodeToken(tokenMatch[1]!),
			unescapeSnippets(tokenMatch[2]!),
		);
		if (position !== null)
			return {
				message,
				...positionInfo(source, position),
				position,
			};
	}

	const jscMatch = JSC_IDENTIFIER.exec(message);
	if (jscMatch) {
		const position = source.indexOf(jscMatch[1]!);
		if (position !== -1)
			return {
				message,
				...positionInfo(source, position),
				position,
			};
	}

	// "Unexpected end of JSON input" carries no location, but the site is the
	// end of the input by definition.
	if (/end of JSON input|unexpected end of data/.test(message)) {
		const position = source.length;
		return { message, ...positionInfo(source, position), position };
	}

	return { message, line: 1, column: 1, position: 0 };
}

export function parseJson(source: string): JsonParseResult {
	try {
		return { ok: true, value: JSON.parse(source) };
	} catch (caught) {
		const message =
			caught instanceof Error
				? caught.message
				: String(caught);
		return { ok: false, error: errorInfo(source, message) };
	}
}

/**
 * Indentation presets — 2/4 → spaces, tab → "\t", minify → no whitespace.
 * JSON.stringify's gap argument takes either width or string, so the mapping
 * is one ternary.
 */
export function formatJson(value: unknown, indent: IndentId): string {
	if (indent === 'minify') return JSON.stringify(value);
	return JSON.stringify(
		value,
		null,
		indent === 'tab' ? '\t' : Number(indent),
	);
}

export type TreeNodeKind =
	'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';

export interface TreeNode {
	kind: TreeNodeKind;
	/** Key in the parent: object key verbatim, array index as a string, null at the root. */
	key: string | null;
	/**
	 * NUL-joined key path from the root, used as the `{{#each}}` key so a
	 * node's collapse state survives a source edit. NUL cannot appear in a
	 * key from JSON.parse more than zero times unless the author writes \0,
	 * which would still only collide with its own twin.
	 */
	path: string;
	/** Direct children of a container; 0 for primitives. */
	entryCount: number;
	/** Non-null for object/array nodes only. */
	children: TreeNode[] | null;
	/** The primitive payload; null for containers and, naturally, null. */
	value: string | number | boolean | null;
}

export function buildTree(
	value: unknown,
	key: string | null = null,
	path = 'root',
): TreeNode {
	if (value === null)
		return {
			kind: 'null',
			key,
			path,
			entryCount: 0,
			children: null,
			value: null,
		};

	if (Array.isArray(value)) {
		const children = value.map((entry, index) =>
			buildTree(entry, String(index), `${path}\0${index}`),
		);
		return {
			kind: 'array',
			key,
			path,
			entryCount: children.length,
			children,
			value: null,
		};
	}

	if (typeof value === 'object') {
		const children = Object.entries(
			value as Record<string, unknown>,
		).map(([childKey, entry]) =>
			buildTree(entry, childKey, `${path}\0${childKey}`),
		);
		return {
			kind: 'object',
			key,
			path,
			entryCount: children.length,
			children,
			value: null,
		};
	}

	const kind = typeof value as 'string' | 'number' | 'boolean';
	return {
		kind,
		key,
		path,
		entryCount: 0,
		children: null,
		value: value as string | number | boolean,
	};
}

/** One row of the unfolded tree the viewer renders. */
export interface FlatTreeRow {
	node: TreeNode;
	/** Nesting depth; the root sits at 0. */
	depth: number;
	/** True when this row is a container the viewer shows collapsed. */
	collapsed: boolean;
	/**
	 * Rendered payload for primitives (strings quoted); null for containers,
	 * which render their entry count instead.
	 */
	display: string | null;
}

/**
 * The tree as the viewer shows it: a depth-first walk of the visible rows.
 * Everything below a collapsed container is withheld, so the template stays a
 * single flat `{{#each}}` instead of a recursive component.
 */
export function flattenTree(
	root: TreeNode,
	collapsed: ReadonlySet<string>,
): FlatTreeRow[] {
	const rows: FlatTreeRow[] = [];
	const walk = (node: TreeNode, depth: number) => {
		const children = node.children;
		const isCollapsed =
			children !== null && collapsed.has(node.path);
		rows.push({
			node,
			depth,
			collapsed: isCollapsed,
			display: nodeDisplay(node),
		});
		if (children === null || isCollapsed) return;
		for (const child of children) walk(child, depth + 1);
	};
	walk(root, 0);
	return rows;
}

function nodeDisplay(node: TreeNode): string | null {
	switch (node.kind) {
		case 'object':
		case 'array':
			return null;
		case 'string':
			return JSON.stringify(node.value);
		case 'number':
		case 'boolean':
		case 'null':
			return String(node.value);
	}
}
