export const INDENT_OPTIONS = [
	{ id: '2', label: '2 spaces' },
	{ id: '4', label: '4 spaces' },
	{ id: 'tab', label: 'Tabs' },
	{ id: 'minify', label: 'Minify' },
] as const;

export type IndentId = (typeof INDENT_OPTIONS)[number]['id'];

export interface JsonErrorInfo {
	message: string;
	/** 1-based index. */
	line: number;
	/** 1-based index. */
	column: number;
	/** 0-based offset. */
	position: number;
}

export type JsonParseResult =
	{ ok: true; value: unknown } | { ok: false; error: JsonErrorInfo };

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

// v8 escapes token windows
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

// v8 omits token positions
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

// javascriptcore omits locations
const JSC_IDENTIFIER = /Unexpected identifier "([^"]+)"/;

export function errorInfo(source: string, message: string): JsonErrorInfo {
	const positionMatch = /position (\d+)/.exec(message);
	const lineColumnMatch = /\(line (\d+) column (\d+)\)/.exec(message);
	if (lineColumnMatch) {
		const line = Number(lineColumnMatch[1]);
		const column = Number(lineColumnMatch[2]);
		// preserve ui coordinates
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

	// eof has no location
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
	key: string | null;
	/** stable collapse-state key. */
	path: string;
	entryCount: number;
	children: TreeNode[] | null;
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

export interface FlatTreeRow {
	node: TreeNode;
	depth: number;
	collapsed: boolean;
	display: string | null;
}

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
